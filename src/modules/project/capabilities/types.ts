import type { ZodType } from 'zod';
import type {
	PlatformCapability,
	PlatformCapabilityContext
} from '$platform/ai/capability-registry';

export type { PlatformCapabilityContext };

/**
 * A project capability is a platform capability that additionally carries its
 * input/output Zod schemas (lifted to the manifest at registration time).
 *
 * All current project capabilities are read-only. Two shapes are allowed, both
 * `sideEffect: 'read'` and never requiring confirmation:
 *
 *   1. LLM/suggestive (generate-plan, summarize-dashboard, answer-question, …):
 *      `execute` reads `ctx.env` to reach the platform AI runtime (Workers AI)
 *      and FORWARDS to the module's own LLM function. It never touches
 *      `$infrastructure/db`, never `new Service`, never a repository — data
 *      assembly arrives via the validated `input`.
 *
 *   2. Data-read via the api facade (view-calendar): `execute` reads
 *      `ctx.moduleContext` and forwards to `createProjectApi(ctx.moduleContext)`
 *      (the blessed facade-path, Architecture_rules R3 / mirrors
 *      `hr.list-pending-leave`). It still never instantiates a service or repo
 *      directly — all business logic stays behind the api.
 */
export interface ProjectCapability<TInput, TOutput>
	extends PlatformCapability<TInput, TOutput> {
	inputSchema: ZodType<TInput>;
	outputSchema: ZodType<unknown>;
}
