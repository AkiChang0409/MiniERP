/**
 * SDK-for-code entry. Routes, other modules, and background jobs call the
 * project module through `createProjectApi(ctx)` — a strongly-typed surface with
 * no NL / confirmation / permission-narration. (Mirrors `finance/api.ts`.)
 */
export { createProjectApi, type ProjectApi } from './services/api';
