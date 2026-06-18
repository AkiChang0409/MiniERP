/**
 * Unified Agent Orchestrator — generic contracts.
 *
 * This layer is **module-agnostic**: it must never import `$modules/*`. Domain
 * agents, context providers, and entity resolvers are supplied by registration
 * (IoC) from the app composition layer (`src/app/ai/orchestrator/*` +
 * `src/app/bootstrap/register-agents.ts`), exactly like the capability and
 * workflow registries.
 *
 * Mental model (see `smartfin_unified_agent_orchestrator_design.md`):
 *   Orchestrator decides *who* handles a request (routing + context).
 *   Domain agent decides *how* within its domain.
 *   Capability/workflow decides *what* can safely execute.
 *   Service performs the actual business operation.
 */
import type { AuthRole } from '../../auth/config';
import type { PlatformRiskLevel } from '../capability-registry';

export type ChannelSource = 'ai_panel' | 'lark' | 'email' | 'mobile' | 'system';

export interface InboundAttachment {
	id: string;
	fileName?: string;
	mimeType?: string;
	storageRef?: string;
}

export interface RouteContext {
	moduleId?: string;
	route?: string;
	projectId?: string;
	taskId?: string;
	documentId?: string;
}

/**
 * Channel-agnostic inbound message. Every channel adapter (Lark webhook, AI
 * Panel, future email/mobile) normalizes its native payload into this shape and
 * calls `orchestrator.handleMessage(message)`. Adapters stay thin: no business
 * logic, only normalization + identity mapping.
 */
export interface InboundAgentMessage {
	source: ChannelSource;
	/** Resolved SmartFin user id, when identity mapping succeeded. */
	userId?: string;
	/** Channel-native external user id (e.g. Lark open_id) before mapping. */
	externalUserId?: string;
	tenantId?: string;
	roles?: AuthRole[];
	/** Stable per-conversation key (Lark chat_id, AI Panel session id, …). */
	conversationId: string;
	text: string;
	attachments?: InboundAttachment[];
	mentions?: string[];
	channel?: {
		type: 'direct' | 'group' | 'system';
		externalChannelId?: string;
	};
	/** UI / channel-supplied context hints (route, selected ids). */
	routeContext?: RouteContext;
	metadata?: Record<string, unknown>;
}

/**
 * Minimal runtime context built *before* intent classification (design §4).
 * Kept small on purpose — the model should not be pre-loaded with the whole ERP.
 */
export interface RuntimeContextEnvelope {
	source: ChannelSource;
	userId?: string;
	tenantId?: string;
	roles: AuthRole[];
	channel?: {
		type: 'direct' | 'group' | 'system';
		externalChannelId?: string;
		conversationId?: string;
	};
	routeContext?: RouteContext;
	recentContext?: {
		recentProjectIds?: string[];
		recentTaskIds?: string[];
		recentDocumentIds?: string[];
	};
	enabledModules?: string[];
}

export interface IntentClassificationInput {
	message?: string;
	intentHint?: string;
	currentPath?: string;
}

/**
 * Result of a domain agent's intent classification, projected to a generic shape
 * the router can compare across domains. `confidence` is the routing signal.
 */
export interface AgentIntentResult {
	agentId: string;
	domain: string;
	intent: string;
	confidence: number;
	reason: string;
	riskLevel: PlatformRiskLevel;
	requiredInputs: string[];
	/** Bound capability id, when the intent maps to a single capability. */
	suggestedCapabilityId?: string | null;
	/** Bound workflow id, when the intent maps to a deterministic workflow. */
	suggestedWorkflowId?: string | null;
	/** Canonical category id hint (finance document intake). */
	suggestedCategoryId?: string | null;
}

/**
 * Generic projection of a domain agent's manifest. Each module owns its richer
 * typed manifest (`FinanceAgentManifest`, …); the plugin adapter maps it here so
 * the router can reason uniformly without importing module types.
 */
export interface OrchestratorAgentManifest {
	id: string;
	name: string;
	domain: string;
	version: string;
	description: string;
	owns: readonly string[];
	canHandle: readonly string[];
	cannotHandle: readonly string[];
	defaultRiskLevel: PlatformRiskLevel;
	forbiddenActions: readonly string[];
}

/**
 * Optional context contributor (registered separately). Augments the runtime
 * envelope with domain-specific recent context (e.g. recent project ids).
 */
export interface ContextProvider {
	id: string;
	contribute(
		message: InboundAgentMessage,
		envelope: RuntimeContextEnvelope
	): Promise<Partial<RuntimeContextEnvelope>> | Partial<RuntimeContextEnvelope>;
}

/**
 * The public "agent plugin" a module exposes. Consumed by the orchestrator only
 * through the generic registry — the platform never deep-imports the module.
 */
export interface DomainAgentPlugin {
	manifest: OrchestratorAgentManifest;
	/** Capability ids this agent may call (scopes the LLM tool catalog). */
	allowedCapabilityIds: readonly string[];
	/**
	 * Domain-level intent classifier. Returns null when the message clearly does
	 * not belong to this domain so the router can compare candidates. Reuses the
	 * module's existing classifier; never executes a tool.
	 */
	classifyIntent(input: IntentClassificationInput): AgentIntentResult | null;
}

export type OrchestratorResultKind =
	| 'routed' // delegated to a domain agent (read-only echo in early phases)
	| 'answer' // final natural-language answer
	| 'clarification' // need the user to disambiguate (domain or entity)
	| 'confirmation' // pending write confirmation
	| 'no_route' // could not determine a domain agent
	| 'denied' // policy / permission denied
	| 'error';

export interface OrchestratorCandidate {
	type: string;
	id: string;
	label: string;
	confidence: number;
}

export interface OrchestratorResult {
	kind: OrchestratorResultKind;
	message: string;
	agentId?: string;
	domain?: string;
	intent?: AgentIntentResult;
	context?: RuntimeContextEnvelope;
	candidates?: OrchestratorCandidate[];
	/** Free-form trace surfaced to the AI Panel / logged for audit. */
	trace?: Record<string, unknown>;
}
