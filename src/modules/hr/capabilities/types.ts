import type { ZodType } from 'zod';
import type {
	PlatformCapability,
	PlatformCapabilityContext
} from '$platform/ai/capability-registry';

export type { PlatformCapabilityContext };

/**
 * An HR capability is a platform capability that additionally carries its
 * input/output Zod schemas (lifted to the manifest at registration time) and an
 * optional idempotency-key deriver for write actions.
 *
 * Contract every HR capability MUST follow (not enforced by the type, enforced
 * by review + the guarded executor):
 *   - `execute` calls the HR module API facade (`createLeaveApi` /
 *     `createEmployeeLeaveApi`) via `ctx.moduleContext` — never `new Service`,
 *     never a repository, never `$infrastructure/db`, never `fetch('/api/...')`.
 *   - personId for self-service writes is resolved server-side from the bound
 *     login user, never read from `input`.
 */
export interface HrCapability<TInput, TOutput> extends PlatformCapability<TInput, TOutput> {
	inputSchema: ZodType<unknown>;
	outputSchema: ZodType<unknown>;
	idempotencyKey?: (input: unknown) => string;
}
