import type { ZodType } from 'zod';
import type { ModuleContext } from '../modules/types';

export type PlatformRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

/**
 * Whether a capability only reads data or also persists/mutates business data.
 * Drives confirmation + audit policy: every `'write'` capability MUST set
 * `requiresConfirmation: true` (enforced at registration time).
 */
export type CapabilitySideEffect = 'read' | 'write';

export interface PlatformCapabilityContext {
	tenantId?: string;
	userId?: string;
	useMock?: boolean;
	/**
	 * Optional Cloudflare Workers env. Capabilities that call the platform AI
	 * runtime (Workers AI) read `env.AI` here.
	 */
	env?: Env;
	/**
	 * Full module context (db / user / eventBus / env). Capabilities that need to
	 * call a module's public API facade (e.g. `createLeaveApi(ctx.moduleContext)`)
	 * read it here. Pure-compute capabilities (finance extract/match/validate)
	 * leave it undefined. Threading the ModuleContext — rather than a bare db —
	 * keeps capabilities on the facade path (no `new Service` / no repository/db).
	 */
	moduleContext?: ModuleContext;
}

export interface PlatformCapability<TInput, TOutput> {
	id: string;
	description: string;
	riskLevel: PlatformRiskLevel;
	execute(input: TInput, ctx: PlatformCapabilityContext): Promise<TOutput>;
}

export interface ToolManifest {
	id: string;
	ownerModule: string;
	description: string;
	riskLevel: PlatformRiskLevel;
	allowedAgents: string[];
	requiredUserPermissions: string[];
	requiresConfirmation: boolean;
	auditRequired: boolean;
	enabled: boolean;
	/**
	 * Read vs write classification. Required so callers (the guarded executor,
	 * future LLM function-calling, Lark adapters) can decide whether a
	 * confirmation step is needed before dispatch.
	 */
	sideEffect: CapabilitySideEffect;
	/**
	 * Zod schema for the capability input. Optional today; becomes the contract
	 * for LLM function-calling argument validation and external-channel (Lark)
	 * parameter checking. When present, the guarded executor validates input
	 * against it before dispatch.
	 */
	inputSchema?: ZodType<unknown>;
	/**
	 * Zod schema for the capability output. When present, the guarded executor
	 * validates the result before returning it to the caller.
	 */
	outputSchema?: ZodType<unknown>;
	/**
	 * For write capabilities: the primary table/entity the action persists to.
	 * Informational (audit / impact analysis); not enforced.
	 */
	persistTarget?: string;
	/**
	 * For write capabilities: derives a stable idempotency key from the input so
	 * a retried/duplicated invocation (e.g. a re-delivered Lark webhook) can be
	 * de-duplicated. The dedup store is a later phase; today the key is computed
	 * and recorded in the audit trail only.
	 */
	idempotencyKey?: (input: unknown) => string;
}

interface RegistryEntry {
	manifest: ToolManifest;
	capability: PlatformCapability<unknown, unknown>;
}

const entries = new Map<string, RegistryEntry>();

export function registerCapability<TInput, TOutput>(
	manifest: ToolManifest,
	capability: PlatformCapability<TInput, TOutput>
): void {
	if (manifest.id !== capability.id) {
		throw new Error(
			`Capability id mismatch: manifest=${manifest.id} capability=${capability.id}`
		);
	}
	// Invariant: every write capability must require explicit user confirmation.
	// This is the single enforcement point so no registration can opt out.
	if (manifest.sideEffect === 'write' && !manifest.requiresConfirmation) {
		throw new Error(
			`Write capability must set requiresConfirmation: true (capability=${manifest.id})`
		);
	}
	entries.set(manifest.id, {
		manifest,
		capability: capability as PlatformCapability<unknown, unknown>
	});
}

export function lookupCapability(id: string): RegistryEntry | undefined {
	return entries.get(id);
}

export function listCapabilities(): ToolManifest[] {
	return [...entries.values()].map((entry) => entry.manifest);
}

export function executeCapability(
	id: string,
	input: unknown,
	ctx: PlatformCapabilityContext
): Promise<unknown> {
	const entry = entries.get(id);
	if (!entry) {
		throw new Error(`Capability not registered: ${id}`);
	}
	if (!entry.manifest.enabled) {
		throw new Error(`Capability disabled: ${id}`);
	}
	return entry.capability.execute(input, ctx);
}

export function clearCapabilityRegistry(): void {
	entries.clear();
}
