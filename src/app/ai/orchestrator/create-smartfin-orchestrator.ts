/**
 * SmartFin-specific orchestrator entry. The platform orchestrator runtime is
 * module-agnostic; this composition-layer wrapper supplies SmartFin context
 * providers (recent projects, entity resolvers — added in later plan phases) and
 * is the single function channel routes call.
 *
 * Agent registration itself happens as a startup side-effect in
 * `src/app/bootstrap/register-agents.ts`.
 */
import type { ModuleContext } from '$platform/modules';
import {
	handleMessage,
	type ContextProvider,
	type InboundAgentMessage,
	type OrchestratorResult
} from '$platform/ai/orchestrator';

export interface SmartFinOrchestratorDeps {
	/** Module-backed context providers (recent projects, etc.). Empty today. */
	contextProviders?: readonly ContextProvider[];
	/** Request-scoped module context so entity resolvers can call module apis. */
	moduleContext?: ModuleContext;
}

export async function runSmartFinOrchestrator(
	message: InboundAgentMessage,
	deps: SmartFinOrchestratorDeps = {}
): Promise<OrchestratorResult> {
	return handleMessage(message, {
		contextProviders: deps.contextProviders ?? [],
		moduleContext: deps.moduleContext
	});
}
