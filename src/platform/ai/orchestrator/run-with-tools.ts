/**
 * Unified governed agent loop (design §8, unified-agent refactor). Holds the
 * user's FULL cross-domain tool catalog (reads + writes) as JSON-Schema tool
 * specs, lets the model choose a tool, then acts:
 *
 *   · read tool  → execute NOW through the governed runtime
 *     (`executeGuardedCapability` = policy gate + schema validation + audit),
 *     feed the result back, and continue reasoning (multi-step ReAct: read →
 *     reflect → read again → integrate across domains).
 *   · write tool → NEVER execute here. Return a `confirm_write` proposal so the
 *     orchestrator stages a payload-hash confirmation and shows a card. The
 *     write runs later, only after the user confirms, through the same runtime.
 *
 * Each tool executes AS ITS OWNING AGENT (`manifest.allowedAgents[0]`), so
 * tool-policy's per-agent allow-list still applies unchanged — this is a
 * governed loop, not an ungoverned super-agent. The model proposes; the platform
 * enforces policy / permission / risk / confirmation / schema / audit on every
 * call.
 */
import { z } from 'zod';
import type { DBClient } from '../../../infrastructure/db';
import type { AuthRole } from '../../auth/config';
import type { PlatformCapabilityContext, ToolSpec } from '../capability-registry';
import { executeGuardedCapability } from '../execute-capability';
import { runStructuredOutput } from '../ai-runtime';
import { lookupAgent } from './agent-registry';

export interface ToolCallTrace {
	step: number;
	toolId: string;
	ok: boolean;
	status: string;
	auditId?: string;
	error?: string;
}

/** A write the loop wants to perform — staged for confirmation, never auto-run. */
export interface PendingWriteProposal {
	/** Owning agent id the write executes as (tool's `allowedAgents[0]`). */
	agentId: string;
	capabilityId: string;
	/** Validated-shape input the model produced for the write. */
	input: unknown;
	/** Human-readable summary for the confirmation card. */
	summary: string;
}

export interface RunWithToolsInput {
	/** Orchestrator identity for loop-level audit metadata + owning-agent fallback. */
	agentId: string;
	agentVersion: string;
	userMessage: string;
	/** Persona / system preamble prepended to the loop prompt. */
	systemPreamble?: string;
	/** Full cross-domain tool catalog the model may choose from (reads + writes). */
	tools: ToolSpec[];
	maxSteps?: number;
	env: Env;
	db: DBClient;
	capabilityCtx: PlatformCapabilityContext;
	actor: { userId?: string | null; userEmail?: string | null; roles: AuthRole[] | null | undefined };
	promptVersion?: string;
}

export interface RunWithToolsResult {
	status: 'final' | 'confirm_write' | 'max_steps' | 'no_provider' | 'error';
	answer: string;
	/** Present when status === 'confirm_write'. */
	write?: PendingWriteProposal;
	steps: ToolCallTrace[];
	error?: string;
}

const decisionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('call_tool'),
		toolId: z.string(),
		input: z.record(z.string(), z.unknown()).optional(),
		reason: z.string().optional(),
		/** For write tools: a one-line description of the change, for confirmation. */
		summary: z.string().optional()
	}),
	z.object({
		action: z.literal('final'),
		answer: z.string()
	})
]);

/** A tool is a write (must confirm, never auto-run) if flagged either way. */
function isWriteTool(spec: ToolSpec): boolean {
	return spec.sideEffect === 'write' || spec.requiresConfirmation;
}

/** Owning agent the tool executes as (fallback to the orchestrator identity). */
function owningAgentId(spec: ToolSpec, fallback: string): string {
	return spec.allowedAgents[0] ?? fallback;
}

function truncate(value: string, max = 6000): string {
	return value.length > max ? `${value.slice(0, max)}… (truncated)` : value;
}

function buildSystemPrompt(tools: ToolSpec[], preamble?: string): string {
	const toolLines = tools
		.map((tool) => {
			const tag = isWriteTool(tool) ? ' [WRITE — will be proposed for confirmation, not executed now]' : '';
			return `- ${tool.id}${tag}: ${tool.description}\n  parameters: ${JSON.stringify(tool.parameters ?? {})}`;
		})
		.join('\n');
	return [
		preamble ?? 'You are the SmartFin/MiniERP assistant, a governed cross-domain agent.',
		'You can call the tools below to read ERP business data and to propose changes.',
		'Work step by step: call a read tool, look at its result, and call more tools (across domains) until you can fully answer. For questions that need business data, ALWAYS call the relevant tool before answering — do not answer from memory and do not refuse authorized data that a listed tool can retrieve.',
		'To make a change, call the matching WRITE tool with the full intended input and a clear one-line "summary". It will NOT run immediately — it is proposed to the user for confirmation. Never claim a change is done from this loop.',
		'',
		'TOOLS:',
		toolLines || '(no tools available)',
		'',
		'Respond with exactly ONE JSON object and nothing else:',
		'- To call a read tool: {"action":"call_tool","toolId":"<id>","input":{...}}',
		'- To propose a write: {"action":"call_tool","toolId":"<write-id>","input":{...},"summary":"<what will change>"}',
		'- To give the final answer: {"action":"final","answer":"<text>"}',
		'Rules: only call tools from the list above; never invent tool ids; do not repeat a failed call; keep the final answer concise.'
	].join('\n');
}

export async function runWithTools(input: RunWithToolsInput): Promise<RunWithToolsResult> {
	const maxSteps = input.maxSteps ?? 6;
	const steps: ToolCallTrace[] = [];
	const specById = new Map(input.tools.map((tool) => [tool.id, tool]));
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

		const spec = specById.get(decision.toolId)!;
		const agentId = owningAgentId(spec, input.agentId);

		// Write tool → stage for confirmation, end the loop. No side effect here.
		if (isWriteTool(spec)) {
			steps.push({ step: i, toolId: decision.toolId, ok: true, status: 'staged_write' });
			return {
				status: 'confirm_write',
				answer: '',
				write: {
					agentId,
					capabilityId: decision.toolId,
					input: decision.input ?? {},
					summary: decision.summary?.trim() || decision.reason?.trim() || `Run ${decision.toolId}`
				},
				steps
			};
		}

		// Read tool → execute now, as the owning agent, through the governed runtime.
		const agentVersion = lookupAgent(agentId)?.manifest.version ?? input.agentVersion;
		const exec = await executeGuardedCapability({
			db: input.db,
			agentId,
			agentVersion,
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
