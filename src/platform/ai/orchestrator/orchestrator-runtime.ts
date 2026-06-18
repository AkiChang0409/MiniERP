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
import { buildRuntimeContext } from './context-builder';
import { routeMessage } from './agent-router';
import { lookupEntityResolver, resolveEntities } from './entity-resolver';
import { listReadOnlyToolSpecs, runWithTools } from './run-with-tools';
import type {
	ContextProvider,
	InboundAgentMessage,
	OrchestratorResult
} from './contracts';

/** Intent risk levels that may run the read-only dynamic tool loop. */
const READ_RISK: ReadonlySet<PlatformRiskLevel> = new Set<PlatformRiskLevel>(['R0', 'R1', 'R2']);

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

	// Phase 5: dynamic read-only tool loop. Runs only for read-risk intents and
	// only when a module context (env/db) is available. The catalog is read-only
	// and tool-policy denies un-confirmed writes, so this loop cannot mutate
	// business data — confirmed writes land in a later phase.
	if (options.moduleContext && READ_RISK.has(intent!.riskLevel)) {
		const tools = listReadOnlyToolSpecs(agent!.manifest.id);
		if (tools.length > 0) {
			const mc = options.moduleContext;
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
