/**
 * Unified orchestrator runtime entry point. One channel-agnostic function every
 * adapter calls: `handleMessage(InboundAgentMessage)`.
 *
 * Pipeline (unified-agent refactor):
 *   1. Build minimal runtime context (user / roles / route hints).
 *   2. Resolve identity (must succeed before anything runs).
 *   3. CONFIRM/CANCEL FIRST — an affirmative reply resumes a staged write via the
 *      governed runtime, instead of being re-interpreted as a new request.
 *   4. UNIFIED AGENT LOOP — assemble the user's full cross-domain tool catalog
 *      (reads + writes, filtered by role) and run the governed ReAct loop
 *      (`runWithTools`): reads execute now, writes come back as a `confirm_write`
 *      proposal we stage for confirmation.
 *   5. Render answer / confirmation / error.
 *
 * The orchestrator performs no business logic and never bypasses
 * policy/confirmation/audit — every tool call inside the loop and every
 * confirmed write goes through `executeGuardedCapability`. Governance lives at
 * each tool call, not in a single super-agent gate; domains are reduced to
 * "capability packages + permissions" the loop composes across.
 */
import type { ModuleContext } from '../../modules/types';
import type { PlatformRiskLevel } from '../capability-registry';
import { lookupCapability } from '../capability-registry';
import { executeGuardedCapability } from '../execute-capability';
import { buildRuntimeContext } from './context-builder';
import { lookupAgent } from './agent-registry';
import {
	appendConversationTurns,
	clearConversationState,
	consumePendingConfirmation,
	getConversationState,
	setPendingConfirmation
} from './conversation-state';
import { runWithTools } from './run-with-tools';
import { buildAgentToolCatalog } from './tool-catalog';
import { describeCurrentContext, extractRouteEntities } from './current-context';
import { summarizeConversation } from './conversation-summary';
import type {
	ContextProvider,
	DomainAgentPlugin,
	InboundAgentMessage,
	OrchestratorResult
} from './contracts';

/** Natural-language confirm / cancel fallbacks (structured actionId is primary). */
const AFFIRM = /^(confirm|yes|ok(ay)?|y|确认|确定|好的?|同意|是的?)\s*$/i;
const NEGATE = /^(cancel|no|n|取消|不用了?|算了)\s*$/i;

/** Render a capability result via the plugin's optional renderer, else fallback. */
async function renderOrDefault(
	agent: DomainAgentPlugin,
	capabilityId: string,
	output: unknown,
	env: Env,
	fallback: string
): Promise<string> {
	if (!agent.renderResult) return fallback;
	try {
		return (await agent.renderResult({ capabilityId, output, env })) || fallback;
	} catch {
		return fallback;
	}
}

function confirmFailMessage(reason: 'none_pending' | 'expired' | 'hash_mismatch' | 'action_mismatch'): string {
	switch (reason) {
		case 'expired':
			return 'That confirmation has expired — please ask again and I will re-propose.';
		case 'hash_mismatch':
			return 'The proposal changed since it was shown — please review the new proposal before confirming.';
		case 'action_mismatch':
			return 'That confirmation no longer matches the pending action.';
		default:
			return 'There is nothing pending to confirm.';
	}
}

export interface OrchestratorRuntimeOptions {
	contextProviders?: readonly ContextProvider[];
	/** Request-scoped module context so the loop can read/write module data. */
	moduleContext?: ModuleContext;
}

export async function handleMessage(
	message: InboundAgentMessage,
	options: OrchestratorRuntimeOptions = {}
): Promise<OrchestratorResult> {
	const context = await buildRuntimeContext(message, options.contextProviders ?? []);

	// Identity must be resolved before anything runs (acceptance criterion §17.2).
	if (!message.userId) {
		return {
			kind: 'denied',
			message:
				'I could not resolve your SmartFin identity for this channel. Please link your account first.',
			context,
			trace: { reason: 'identity_unresolved', source: message.source }
		};
	}

	const mc = options.moduleContext;
	const kv = mc?.env.KV;

	// --- Confirm / cancel a staged write (design §10) — before the loop so an
	// affirmative reply resumes the pending action instead of starting a new one.
	if (kv && mc) {
		const trimmed = message.text.trim();
		const wantsConfirm = !!message.confirm?.actionId || AFFIRM.test(trimmed);
		const wantsCancel = message.cancel === true || NEGATE.test(trimmed);
		if (message.confirm || message.cancel || wantsConfirm || wantsCancel) {
			const state = await getConversationState(kv, message.conversationId);
			const pending = state?.pendingConfirmation;
			if (pending) {
				if (wantsCancel && !message.confirm) {
					await clearConversationState(kv, message.conversationId);
					return {
						kind: 'answer',
						message: 'Okay — cancelled. Nothing was changed.',
						context,
						trace: { stage: 'confirm', action: 'cancelled' }
					};
				}
				if (wantsConfirm) {
					const actionId = message.confirm?.actionId ?? pending.actionId;
					const outcome = await consumePendingConfirmation(kv, message.conversationId, { actionId });
					if (!outcome.ok) {
						return {
							kind: 'answer',
							message: confirmFailMessage(outcome.reason),
							context,
							trace: { stage: 'confirm', reason: outcome.reason }
						};
					}
					const p = outcome.confirmation;
					// Apply every staged write in order, each through the governed runtime
					// as its owning agent. The whole batch shares one payloadHash.
					const applied: string[] = [];
					const auditIds: string[] = [];
					for (const item of p.items) {
						const agentPlugin = lookupAgent(item.agentId);
						const exec = await executeGuardedCapability({
							db: mc.db,
							agentId: item.agentId,
							agentVersion: agentPlugin?.manifest.version ?? '0.1.0',
							capabilityId: item.capabilityId,
							input: item.input,
							ctx: {
								tenantId: context.tenantId ?? 'default',
								userId: message.userId,
								env: mc.env,
								moduleContext: mc
							},
							actor: { userId: message.userId, userEmail: mc.user?.email ?? null, roles: context.roles },
							confirmationRef: p.payloadHash,
							intent: 'apply_confirmed',
							finalAction: 'agent.apply_confirmed'
						});
						if (exec.status !== 'ok') {
							return {
								kind: exec.status === 'denied' ? 'denied' : 'error',
								message:
									p.items.length > 1
										? `Applied ${applied.length} of ${p.items.length} change(s); "${item.summary}" failed (${exec.status}).`
										: `I could not apply the change (${exec.status}).`,
								context,
								trace: { stage: 'confirm', status: exec.status, applied, failedItem: item.capabilityId }
							};
						}
						if (exec.auditId) auditIds.push(exec.auditId);
						applied.push(
							await renderOrDefault(
								agentPlugin ?? ({} as DomainAgentPlugin),
								item.capabilityId,
								exec.output,
								mc.env,
								item.summary
							)
						);
					}
					return {
						kind: 'answer',
						message:
							applied.length === 1
								? `Done — applied: ${applied[0]}.`
								: `Done — applied ${applied.length} change(s):\n- ${applied.join('\n- ')}`,
						context,
						trace: { stage: 'confirm', applied, auditIds }
					};
				}
			}
			// No pending action: fall through to the loop (don't hijack the message).
		}
	}

	// The unified loop needs a module context (env / db / kv). Without it we can't
	// safely read or act — every real adapter (AI Panel, Lark) supplies one.
	if (!mc) {
		return {
			kind: 'error',
			message: 'The assistant runtime is not available in this context.',
			context,
			trace: { reason: 'no_module_context', source: message.source }
		};
	}

	// --- Unified cross-domain agent loop. Catalog is scoped to the user's roles;
	// reads execute now, writes come back as a confirm_write proposal we stage.
	const tools = buildAgentToolCatalog(context.roles);
	if (tools.length === 0) {
		return {
			kind: 'answer',
			message: "You don't currently have access to any assistant tools. Please contact an admin.",
			context,
			trace: { reason: 'empty_catalog' }
		};
	}

	// P4.1/P4.2: current-page seeding + remembered entities + rolling summary + history.
	const convoBase = {
		conversationId: message.conversationId,
		source: message.source,
		userId: message.userId,
		tenantId: context.tenantId
	};
	const priorState = kv ? await getConversationState(kv, message.conversationId) : null;
	const priorMessages = (priorState?.history ?? []).map((t) => ({ role: t.role, content: t.text }));
	const pagePreamble = describeCurrentContext(context.routeContext, priorState?.lastResolvedEntities);
	const summaryLine = priorState?.summary?.trim()
		? `CONVERSATION SUMMARY SO FAR:\n${priorState.summary.trim()}`
		: null;
	const contextPreamble = [summaryLine, pagePreamble].filter(Boolean).join('\n\n') || undefined;
	// Entities to remember this turn (current page); folds into lastResolvedEntities.
	const turnEntities = extractRouteEntities(context.routeContext);
	const summarize = (prior: string | undefined, dropped: Parameters<typeof summarizeConversation>[2]) =>
		summarizeConversation(mc.env, prior, dropped, {
			tenantId: context.tenantId,
			userId: message.userId ?? undefined
		});

	const loop = await runWithTools({
		agentId: 'orchestrator',
		agentVersion: '1.0.0',
		userMessage: message.text,
		contextPreamble,
		priorMessages,
		tools,
		env: mc.env,
		db: mc.db,
		capabilityCtx: {
			tenantId: context.tenantId ?? 'default',
			userId: message.userId,
			env: mc.env,
			moduleContext: mc
		},
		actor: {
			userId: message.userId,
			userEmail: mc.user?.email ?? null,
			roles: context.roles
		}
	});

	// Write(s) proposed → stage the batch for confirmation (no side effect yet).
	if (loop.status === 'confirm_write' && loop.writes && loop.writes.length > 0) {
		const writes = loop.writes;
		const items = writes.map((write) => ({
			agentId: write.agentId,
			capabilityId: write.capabilityId,
			riskLevel: (lookupCapability(write.capabilityId)?.manifest.riskLevel ?? 'R4') as PlatformRiskLevel,
			summary: write.summary,
			input: write.input
		}));
		const combinedSummary =
			items.length === 1
				? items[0].summary
				: `${items.length} changes:\n- ${items.map((it) => it.summary).join('\n- ')}`;
		const preface = loop.answer?.trim() ? `${loop.answer.trim()}\n\n` : '';
		if (!kv) {
			return {
				kind: 'confirmation',
				message: `${preface}${combinedSummary}\n\n(Confirmation store unavailable — open the app to apply.)`,
				draft: { summary: combinedSummary, items },
				context,
				trace: { stage: 'loop', staged: false, steps: loop.steps }
			};
		}
		const actionId = crypto.randomUUID();
		await setPendingConfirmation(
			kv,
			{
				conversationId: message.conversationId,
				source: message.source,
				userId: message.userId,
				tenantId: context.tenantId
			},
			{ actionId, items, summary: combinedSummary }
		);
		// Record the user turn for continuity; the applied result is recorded on confirm.
		await appendConversationTurns(kv, convoBase, [{ role: 'user', text: message.text }], {
			entities: turnEntities
		});
		return {
			kind: 'confirmation',
			message: `${preface}${combinedSummary}\n\nReply to confirm, or cancel.`,
			actionId,
			agentId: items.length === 1 ? items[0].agentId : undefined,
			draft: { summary: combinedSummary, items },
			context,
			trace: { stage: 'loop', staged: true, steps: loop.steps }
		};
	}

	if (loop.status === 'no_provider' || loop.status === 'error') {
		return {
			kind: 'error',
			message: loop.answer,
			context,
			trace: { stage: 'loop', status: loop.status, error: loop.error, steps: loop.steps }
		};
	}

	// 'final' or 'max_steps' — natural-language answer (possibly partial).
	if (kv) {
		await appendConversationTurns(
			kv,
			convoBase,
			[
				{ role: 'user', text: message.text },
				{ role: 'assistant', text: loop.answer }
			],
			{ summarize, entities: turnEntities }
		);
	}
	return {
		kind: 'answer',
		message: loop.answer,
		context,
		trace: { stage: 'loop', status: loop.status, steps: loop.steps }
	};
}
