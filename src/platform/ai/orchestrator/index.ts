/**
 * Platform unified-agent-orchestrator barrel. Generic, module-agnostic runtime
 * pieces only. SmartFin-specific wiring lives in `src/app/ai/orchestrator`.
 */
export type {
	ChannelSource,
	InboundAttachment,
	RouteContext,
	InboundAgentMessage,
	RuntimeContextEnvelope,
	IntentClassificationInput,
	AgentIntentResult,
	OrchestratorAgentManifest,
	ContextProvider,
	DomainAgentPlugin,
	OrchestratorResultKind,
	OrchestratorCandidate,
	OrchestratorResult,
	ApplyRequest,
	BuildApplyRequestArgs
} from './contracts';

export {
	registerAgent,
	lookupAgent,
	listAgents,
	findAgentsByDomain,
	clearAgentRegistry
} from './agent-registry';

export { buildRuntimeContext } from './context-builder';
export {
	routeMessage,
	type RouteCandidate,
	type RouteDecision
} from './agent-router';
export {
	handleMessage,
	type OrchestratorRuntimeOptions
} from './orchestrator-runtime';
export {
	registerEntityResolver,
	lookupEntityResolver,
	resolveEntities,
	clearEntityResolvers,
	type EntityType,
	type EntityCandidate,
	type ResolvedEntities,
	type EntityResolutionResult,
	type EntityResolverInput,
	type EntityResolver
} from './entity-resolver';
export {
	runWithTools,
	listReadOnlyToolSpecs,
	type RunWithToolsInput,
	type RunWithToolsResult,
	type ToolCallTrace
} from './run-with-tools';
export {
	getConversationState,
	saveConversationState,
	clearConversationState,
	setPendingConfirmation,
	consumePendingConfirmation,
	type AgentConversationState,
	type AgentPendingClarification,
	type AgentPendingConfirmation,
	type ConfirmationOutcome
} from './conversation-state';
