import { z } from 'zod';

export type PlatformRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

export interface PlatformCapabilityContext {
	tenantId?: string;
	userId?: string;
	useMock?: boolean;
}

export interface PlatformCapability<TInput, TOutput> {
	id: string;
	description: string;
	riskLevel: PlatformRiskLevel;
	/**
	 * Runtime-serializable input contract. When present, the registry can emit a
	 * JSON Schema tool spec (see `listToolSpecs`) so an LLM / agent can call this
	 * capability via function-calling. Optional at the platform layer so legacy
	 * capabilities still register; standard modules (finance) require it.
	 */
	inputSchema?: z.ZodType<TInput>;
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

/**
 * LLM/agent-facing tool descriptor. This is the serialized "SDK-for-agent"
 * shape: id + description + governance metadata + JSON Schema parameters that a
 * function-calling model can fill. `parameters` is null when the capability has
 * no `inputSchema` yet.
 */
export interface ToolSpec {
	id: string;
	description: string;
	riskLevel: PlatformRiskLevel;
	ownerModule: string;
	allowedAgents: string[];
	requiresConfirmation: boolean;
	parameters: Record<string, unknown> | null;
}

function toToolSpec(entry: RegistryEntry): ToolSpec {
	const { manifest, capability } = entry;
	return {
		id: manifest.id,
		description: manifest.description,
		riskLevel: manifest.riskLevel,
		ownerModule: manifest.ownerModule,
		allowedAgents: manifest.allowedAgents,
		requiresConfirmation: manifest.requiresConfirmation,
		parameters: capability.inputSchema
			? (z.toJSONSchema(capability.inputSchema) as Record<string, unknown>)
			: null
	};
}

/**
 * Serialize enabled capabilities into LLM-ready tool specs. Pass `agentId` to
 * scope the catalog to the tools a given domain agent is allowed to call.
 */
export function listToolSpecs(opts?: { agentId?: string }): ToolSpec[] {
	return [...entries.values()]
		.filter((entry) => entry.manifest.enabled)
		.filter(
			(entry) => !opts?.agentId || entry.manifest.allowedAgents.includes(opts.agentId)
		)
		.map(toToolSpec);
}
