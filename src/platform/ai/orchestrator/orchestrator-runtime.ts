/**
 * Unified orchestrator runtime entry point. One channel-agnostic function every
 * adapter calls: `handleMessage(InboundAgentMessage)`.
 *
 * Responsibilities (design §6): normalize is done by the adapter; here we build
 * minimal context, resolve identity, route to a domain agent, and return a
 * channel-appropriate result. The orchestrator never performs business logic,
 * never touches repositories, and never bypasses policy/confirmation/audit.
 *
 * Phase 3 scope: read-only routing only — it reports which agent/intent a
 * message resolves to. The dynamic tool loop (`runWithTools`) that actually
 * executes capabilities lands in plan Phase 5.
 */
import type { ModuleContext } from '../../modules/types';
import type { PlatformRiskLevel } from '../capability-registry';
import { executeGuardedCapability } from '../execute-capability';
import { buildRuntimeContext } from './context-builder';
import { routeMessage } from './agent-router';
import { lookupAgent } from './agent-registry';
import { lookupEntityResolver, resolveEntities } from './entity-resolver';
import {
	clearConversationState,
	consumePendingConfirmation,
	getConversationState,
	setPendingConfirmation
} from './conversation-state';
import { listReadOnlyToolSpecs, runWithTools } from './run-with-tools';
import type {
	ContextProvider,
	DomainAgentPlugin,
	InboundAgentMessage,
	OrchestratorResult
} from './contracts';

/** Intent risk levels that may run the read-only dynamic tool loop. */
const READ_RISK: ReadonlySet<PlatformRiskLevel> = new Set<PlatformRiskLevel>(['R0', 'R1', 'R2']);

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
	/** Request-scoped module context so entity resolvers can call module apis. */
	moduleContext?: ModuleContext;
}

export async function handleMessage(
	message: InboundAgentMessage,
	options: OrchestratorRuntimeOptions = {}
): Promise<OrchestratorResult> {
	const context = await buildRuntimeContext(message, options.contextProviders ?? []);

	// Identity must be resolved before routing (acceptance criterion §17.2).
	if (!message.userId) {
		return {
			kind: 'denied',
			message:
				'I could not resolve your SmartFin identity for this channel. Please link your account first.',
			context,
			trace: { reason: 'identity_unresolved', source: message.source }
		};
	}

	// --- Confirm / cancel a staged write (design §10) — before routing so an
	// affirmative reply resumes the pending action instead of being re-classified.
	const mc = options.moduleContext;
	const kv = mc?.env.KV;
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
					const agentPlugin = lookupAgent(p.agentId);
					const exec = await executeGuardedCapability({
						db: mc.db,
						agentId: p.agentId,
						agentVersion: agentPlugin?.manifest.version ?? '0.1.0',
						capabilityId: p.capabilityId,
						input: p.input,
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
							message: `I could not apply the change (${exec.status}).`,
							context,
							trace: { stage: 'confirm', status: exec.status }
						};
					}
					const doneMessage = agentPlugin
						? await renderOrDefault(
								agentPlugin,
								p.capabilityId,
								exec.output,
								mc.env,
								`Done — applied: ${p.summary}.`
							)
						: `Done — applied: ${p.summary}.`;
					return {
						kind: 'answer',
						message: doneMessage,
						context,
						trace: { stage: 'confirm', applied: exec.output, auditId: exec.auditId }
					};
				}
			}
			// No pending action: fall through to normal routing (don't hijack the message).
		}
	}

	const decision = routeMessage(
		{ message: message.text, currentPath: context.routeContext?.route },
		context
	);

	if (decision.kind === 'no_route') {
		return {
			kind: 'no_route',
			message:
				"I couldn't tell which area this relates to (project, finance, or HR). Could you rephrase, or tell me which one?",
			context,
			trace: { source: message.source }
		};
	}

	if (decision.kind === 'ambiguous') {
		return {
			kind: 'clarification',
			message: 'This could relate to more than one area — which one do you mean?',
			context,
			candidates: decision.candidates.map((candidate) => ({
				type: 'domain',
				id: candidate.agent.manifest.domain,
				label: candidate.agent.manifest.name,
				confidence: candidate.intent.confidence
			})),
			trace: { source: message.source }
		};
	}

	const { agent, intent } = decision;

	// Targeted entity resolution: only when the intent needs a specific project,
	// the channel did not already supply one, and a resolver is available. We
	// never block routing when resolution simply cannot run (design §9: ask only
	// on genuine ambiguity, otherwise proceed).
	const needsProject =
		!!intent!.requiredInputs.includes('project_context') &&
		!context.routeContext?.projectId;
	if (needsProject && options.moduleContext && lookupEntityResolver('project')) {
		const resolution = await resolveEntities({
			message,
			context,
			want: ['project'],
			moduleContext: options.moduleContext
		});

		if (resolution.ambiguity) {
			return {
				kind: 'clarification',
				message: 'I found more than one matching project. Which one do you mean?',
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				candidates: resolution.candidates.map((candidate) => ({
					type: candidate.type,
					id: candidate.id,
					label: candidate.label,
					confidence: candidate.confidence
				})),
				trace: { stage: 'entity_resolution' }
			};
		}

		if (resolution.resolved.projectId) {
			context.routeContext = {
				...context.routeContext,
				projectId: resolution.resolved.projectId
			};
		} else if (resolution.missingSlots.includes('projectId')) {
			return {
				kind: 'clarification',
				message:
					"Which project is this about? I couldn't match one from your message.",
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				trace: { stage: 'entity_resolution', missing: resolution.missingSlots }
			};
		}
	}

	// --- Full domain planner (design §7): when the agent owns a `planAction`
	// (async LLM intent + input extraction — e.g. HR leave), use it instead of the
	// generic draft/tool-loop path. Read executes now (rendered by the plugin);
	// write is staged for confirmation through the same mechanism as everything
	// else. This is how a domain with rich, module-specific logic joins the
	// unified agent without leaking that logic into the platform.
	if (mc && agent!.planAction) {
		const meta = {
			agentId: agent!.manifest.id,
			domain: agent!.manifest.domain,
			intent,
			context
		};
		const plan = await agent!.planAction({ message, context, moduleContext: mc, env: mc.env });

		if (plan.kind === 'answer') {
			return { kind: 'answer', message: plan.message, ...meta, trace: { stage: 'plan', kind: 'answer' } };
		}
		if (plan.kind === 'clarification') {
			return { kind: 'clarification', message: plan.message, ...meta, trace: { stage: 'plan' } };
		}
		if (plan.kind === 'unknown') {
			return {
				kind: 'no_route',
				message: plan.message ?? "I couldn't map that to something I can do.",
				...meta,
				trace: { stage: 'plan', kind: 'unknown' }
			};
		}
		if (plan.kind === 'read') {
			const exec = await executeGuardedCapability({
				db: mc.db,
				agentId: agent!.manifest.id,
				agentVersion: agent!.manifest.version,
				capabilityId: plan.capabilityId,
				input: plan.input,
				ctx: {
					tenantId: context.tenantId ?? 'default',
					userId: message.userId,
					env: mc.env,
					moduleContext: mc
				},
				actor: { userId: message.userId, userEmail: mc.user?.email ?? null, roles: context.roles },
				intent: intent!.intent,
				finalAction: plan.finalAction
			});
			if (exec.status !== 'ok') {
				return {
					kind: exec.status === 'denied' ? 'denied' : 'error',
					message: `That didn't work (${exec.status}).`,
					...meta,
					trace: { stage: 'plan', status: exec.status }
				};
			}
			const rendered = await renderOrDefault(agent!, plan.capabilityId, exec.output, mc.env, 'Done.');
			return { kind: 'answer', message: rendered, ...meta, trace: { stage: 'plan', kind: 'read' } };
		}
		// plan.kind === 'write' — stage for confirmation (no write yet).
		if (kv) {
			const actionId = crypto.randomUUID();
			await setPendingConfirmation(
				kv,
				{
					conversationId: message.conversationId,
					source: message.source,
					userId: message.userId,
					tenantId: context.tenantId
				},
				{
					actionId,
					agentId: agent!.manifest.id,
					capabilityId: plan.capabilityId,
					riskLevel: 'R4',
					summary: plan.summary,
					input: plan.input
				}
			);
			return {
				kind: 'confirmation',
				message: `${plan.summary} — reply to confirm, or cancel.`,
				actionId,
				draft: { summary: plan.summary },
				...meta,
				trace: { stage: 'plan', staged: true }
			};
		}
		return {
			kind: 'confirmation',
			message: `${plan.summary} (confirmation store unavailable — open the app to apply).`,
			draft: { summary: plan.summary },
			...meta,
			trace: { stage: 'plan', staged: false }
		};
	}

	// --- Draft tier (R3): propose a change set, preview it, and stage it for
	// confirmation (design §11/§12). No business write happens here — the write is
	// the separate R4 apply capability, run only after the user confirms.
	if (mc && intent!.riskLevel === 'R3' && intent!.suggestedCapabilityId) {
		const projectId = context.routeContext?.projectId;
		if (!projectId) {
			return {
				kind: 'clarification',
				message: "Which project is this about? I couldn't determine one.",
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				trace: { stage: 'draft', missing: ['projectId'] }
			};
		}
		const draftExec = await executeGuardedCapability({
			db: mc.db,
			agentId: agent!.manifest.id,
			agentVersion: agent!.manifest.version,
			capabilityId: intent!.suggestedCapabilityId,
			input: { projectId, goal: message.text },
			ctx: {
				tenantId: context.tenantId ?? 'default',
				userId: message.userId,
				env: mc.env,
				moduleContext: mc
			},
			actor: { userId: message.userId, userEmail: mc.user?.email ?? null, roles: context.roles },
			intent: intent!.intent
		});
		if (draftExec.status !== 'ok') {
			return {
				kind: draftExec.status === 'denied' ? 'denied' : 'error',
				message: `I couldn't prepare a proposal (${draftExec.status}).`,
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				trace: { stage: 'draft', status: draftExec.status }
			};
		}
		const draft = draftExec.output;
		const applyReq = agent!.buildApplyRequest?.({ intent: intent!, draft, context });
		if (!applyReq) {
			return {
				kind: 'answer',
				message: 'I reviewed it but found no changes to apply.',
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				draft,
				trace: { stage: 'draft', changes: 0 }
			};
		}
		if (!kv) {
			return {
				kind: 'confirmation',
				message:
					'Here is the proposed change set (open the app to apply — confirmation store unavailable).',
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				draft,
				trace: { stage: 'draft', staged: false }
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
			{
				actionId,
				agentId: agent!.manifest.id,
				capabilityId: applyReq.capabilityId,
				riskLevel: 'R4',
				summary: applyReq.summary,
				input: applyReq.input
			}
		);
		return {
			kind: 'confirmation',
			message: `I propose the following changes — review and confirm to apply. (${applyReq.summary})`,
			agentId: agent!.manifest.id,
			domain: agent!.manifest.domain,
			intent,
			context,
			draft,
			actionId,
			trace: { stage: 'draft', staged: true }
		};
	}

	// Phase 5: dynamic read-only tool loop. Runs only for read-risk intents and
	// only when a module context (env/db) is available. The catalog is read-only
	// and tool-policy denies un-confirmed writes, so this loop cannot mutate
	// business data — confirmed writes land in a later phase.
	if (mc && READ_RISK.has(intent!.riskLevel)) {
		const tools = listReadOnlyToolSpecs(agent!.manifest.id);
		if (tools.length > 0) {
			const loop = await runWithTools({
				agentId: agent!.manifest.id,
				agentVersion: agent!.manifest.version,
				userMessage: message.text,
				systemPreamble: agent!.manifest.description,
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
			return {
				kind: loop.status === 'final' ? 'answer' : 'routed',
				message: loop.answer,
				agentId: agent!.manifest.id,
				domain: agent!.manifest.domain,
				intent,
				context,
				trace: { phase: 'tool_loop', loopStatus: loop.status, steps: loop.steps }
			};
		}
	}

	return {
		kind: 'routed',
		message: `Routed to ${agent!.manifest.name} (intent: ${intent!.intent}).`,
		agentId: agent!.manifest.id,
		domain: agent!.manifest.domain,
		intent,
		context,
		trace: {
			phase: 'route_only',
			candidateCount: decision.candidates.length,
			resolvedProjectId: context.routeContext?.projectId
		}
	};
}
