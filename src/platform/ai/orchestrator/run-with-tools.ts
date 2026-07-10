/**
 * Dynamic agent tool loop (design §8). Gives a domain agent the registered
 * capability catalog (as JSON-Schema tool specs), lets the model choose a tool,
 * then executes it **only through the governed runtime** (`executeGuardedCapability`
 * = policy gate + schema validation + audit). The loop is JSON-decision driven so
 * it stays provider-agnostic on top of `runStructuredOutput` (Workers AI /
 * external), rather than depending on one vendor's native tool-calling API.
 *
 * Critical invariant (design §8): even though the model proposes the tool, the
 * platform still enforces policy / permission / risk / confirmation / schema /
 * audit before execution. A write tool reaching this loop without a
 * confirmationRef is denied by tool-policy — so this loop is safe to run with a
 * read-only catalog and cannot mutate business data on its own.
 */
import { z } from 'zod';
import type { DBClient } from '../../../infrastructure/db';
import type { AuthRole } from '../../auth/config';
import { listToolSpecs, type PlatformCapabilityContext, type ToolSpec } from '../capability-registry';
import { executeGuardedCapability } from '../execute-capability';
import { runStructuredOutput } from '../ai-runtime';

/** Risk levels considered read-only for the Phase-5 (no-write) catalog. */
const READ_RISK: ReadonlySet<string> = new Set(['R0', 'R1', 'R2']);

/**
 * Scope the registered catalog to read-only tools for an agent: not a write
 * (no confirmation required) and risk ≤ R2. Defense-in-depth — even if a write
 * slipped through, tool-policy would still deny it without a confirmationRef.
 */
export function listReadOnlyToolSpecs(agentId: string): ToolSpec[] {
	return listToolSpecs({ agentId }).filter(
		(spec) => !spec.requiresConfirmation && READ_RISK.has(spec.riskLevel)
	);
}

export interface ToolCallTrace {
	step: number;
	toolId: string;
	ok: boolean;
	status: string;
	auditId?: string;
	error?: string;
}

export interface RunWithToolsInput {
	agentId: string;
	agentVersion: string;
	userMessage: string;
	/** Domain-agent persona prepended to the system prompt. */
	systemPreamble?: string;
	/** Pre-filtered tool catalog the model may choose from. */
	tools: ToolSpec[];
	maxSteps?: number;
	env: Env;
	db: DBClient;
	capabilityCtx: PlatformCapabilityContext;
	actor: { userId?: string | null; userEmail?: string | null; roles: AuthRole[] | null | undefined };
	promptVersion?: string;
}

export interface RunWithToolsResult {
	status: 'final' | 'max_steps' | 'no_provider' | 'error';
	answer: string;
	steps: ToolCallTrace[];
	error?: string;
}

const decisionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('call_tool'),
		toolId: z.string(),
		input: z.record(z.string(), z.unknown()).optional(),
		reason: z.string().optional()
	}),
	z.object({
		action: z.literal('final'),
		answer: z.string()
	})
]);

function truncate(value: string, max = 6000): string {
	return value.length > max ? `${value.slice(0, max)}… (truncated)` : value;
}

function buildSystemPrompt(tools: ToolSpec[], preamble?: string): string {
	const toolLines = tools
		.map(
			(tool) =>
				`- ${tool.id}: ${tool.description}\n  parameters: ${JSON.stringify(tool.parameters ?? {})}`
		)
		.join('\n');
	return [
		preamble ?? 'You are a SmartFin domain expert agent.',
		'You can call the read-only tools below to answer the user.',
		'For questions that ask for ERP business data, call the relevant tool before answering. Do not answer from memory and do not refuse authorized data that a listed tool can retrieve.',
		'',
		'TOOLS:',
		toolLines || '(no tools available)',
		'',
		'Respond with exactly ONE JSON object and nothing else:',
		'- To call a tool: {"action":"call_tool","toolId":"<id>","input":{...}}',
		'- To give the final answer: {"action":"final","answer":"<text>"}',
		'Rules: only call tools from the list above; never invent tool ids; do not repeat a failed call; keep the final answer concise.'
	].join('\n');
}

export async function runWithTools(input: RunWithToolsInput): Promise<RunWithToolsResult> {
	const maxSteps = input.maxSteps ?? 4;
	const steps: ToolCallTrace[] = [];
	const allowed = new Set(input.tools.map((tool) => tool.id));
	const system = buildSystemPrompt(input.tools, input.systemPreamble);
	let scratch = '';

	for (let i = 1; i <= maxSteps; i++) {
		const decisionRes = await runStructuredOutput({
			task: 'agent_tool_loop',
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: input.userMessage + (scratch ? `\n\n${scratch}` : '') }
			],
			schema: decisionSchema,
			schemaName: 'AgentToolDecision',
			schemaVersion: 'v1',
			metadata: {
				tenantId: input.capabilityCtx.tenantId ?? 'default',
				userId: input.actor.userId ?? undefined,
				agentId: input.agentId,
				capabilityId: 'orchestrator.run-with-tools',
				promptVersion: input.promptVersion ?? 'v1'
			},
			env: input.env
		});

		if (decisionRes.status !== 'success') {
			return {
				status: decisionRes.status === 'no_provider' ? 'no_provider' : 'error',
				answer: 'I could not complete that with the AI runtime right now.',
				steps,
				error: decisionRes.error
			};
		}

		const decision = decisionRes.result.value;
		if (decision.action === 'final') {
			return { status: 'final', answer: decision.answer, steps };
		}

		if (!allowed.has(decision.toolId)) {
			steps.push({
				step: i,
				toolId: decision.toolId,
				ok: false,
				status: 'not_allowed',
				error: 'tool_not_in_catalog'
			});
			scratch += `\n[step ${i}] Tool "${decision.toolId}" is not available. Choose from: ${[...allowed].join(', ')}.`;
			continue;
		}

		const exec = await executeGuardedCapability({
			db: input.db,
			agentId: input.agentId,
			agentVersion: input.agentVersion,
			capabilityId: decision.toolId,
			input: decision.input ?? {},
			ctx: input.capabilityCtx,
			actor: input.actor,
			intent: 'agent_tool_loop',
			finalAction: 'agent.tool_loop_call'
		});

		steps.push({
			step: i,
			toolId: decision.toolId,
			ok: exec.status === 'ok',
			status: exec.status,
			auditId: exec.auditId,
			error: exec.status === 'ok' ? undefined : 'error' in exec ? exec.error : exec.status
		});

		if (exec.status === 'ok') {
			scratch += `\n[step ${i}] ${decision.toolId} result: ${truncate(JSON.stringify(exec.output))}`;
		} else {
			scratch += `\n[step ${i}] ${decision.toolId} failed (${exec.status}). Do not retry the same call; answer with what you have.`;
		}
	}

	return {
		status: 'max_steps',
		answer:
			'I gathered some information but could not fully complete the request within the step limit. Please refine your question.',
		steps
	};
}
