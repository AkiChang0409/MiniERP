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
 * All current project capabilities are AI/LLM-driven and read-only (suggestive,
 * never authoritative — the route layer shows an editable preview before
 * anything is persisted, per the "AI is suggestive, not authoritative" rule).
 * They therefore have `sideEffect: 'read'` and never require confirmation.
 *
 * Contract every project capability MUST follow (enforced by review, not the
 * type):
 *   - `execute` reads `ctx.env` to reach the platform AI runtime (Workers AI)
 *     and FORWARDS to the module's own LLM function — it does not reimplement
 *     prompt/schema logic that lives in the capability's `capability.ts`.
 *   - It never touches `$infrastructure/db`, never `new Service`, never a
 *     repository. Data assembly (context bundles, dashboard numbers) is the
 *     caller's job and arrives via the validated `input`.
 */
export interface ProjectCapability<TInput, TOutput>
	extends PlatformCapability<TInput, TOutput> {
	inputSchema: ZodType<TInput>;
	outputSchema: ZodType<unknown>;
}
