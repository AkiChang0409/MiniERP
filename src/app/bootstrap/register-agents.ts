/**
 * Application composition root for domain-agent registration. Platform owns the
 * agent registry; concrete agent plugins are selected here so the platform
 * orchestrator never imports domain modules. Mirrors `register-ai-capabilities`.
 *
 * Imported for its side effect at app startup (see `hooks.server.ts`).
 */
import { financeAgentPlugin } from '$modules/finance/agent';
import { hrAgentPlugin } from '$modules/hr/agent';
import { projectAgentPlugin } from '$modules/project/agent';
import { registerAgent, registerEntityResolver } from '$platform/ai/orchestrator';
import { projectEntityResolver } from '$app-layer/ai/orchestrator/resolvers/project-resolver';

registerAgent(financeAgentPlugin);
registerAgent(projectAgentPlugin);
registerAgent(hrAgentPlugin);

// Entity resolvers (project first; task/employee/supplier/customer follow).
registerEntityResolver(projectEntityResolver);
