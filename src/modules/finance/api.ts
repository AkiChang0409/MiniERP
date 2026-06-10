/**
 * SDK-for-code entry. Routes, other modules, and background jobs call finance
 * through `createFinanceApi(ctx)` — a strongly-typed surface with no NL /
 * confirmation / permission-narration. The agent-facing surface is
 * `capabilities/` (SDK-for-agent); both ultimately resolve to services here.
 */
export { createFinanceApi, type FinanceApi } from './services/api';
