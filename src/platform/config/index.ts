import { registry } from '../registry';

export interface ModulePathMapping {
	prefix: string;
	moduleId: string;
}

const ENABLED_MODULE_ALIASES: Record<string, string> = {
	employee: 'hr',
	person: 'hr'
};

// Legacy persisted module id from before Procurement and Sales CRM split.
const ENABLED_MODULE_EXPANSIONS: Record<string, string[]> = {
	'business-partner': ['procurement', 'sales-crm']
};

export function moduleForPath(
	pathname: string,
	mappings: readonly ModulePathMapping[]
): string | null {
	for (const entry of mappings) {
		if (pathname.startsWith(entry.prefix)) return entry.moduleId;
	}
	return null;
}

export function resolveEnabledModuleIds(configured: unknown): string[] {
	const all = registry.getAll().map((m) => m.manifest.id);
	if (!Array.isArray(configured)) return all;

	const valid = new Set(all);
	const filtered = [
		...new Set(
			configured
				.filter((id): id is string => typeof id === 'string')
				.map((id) => id.trim())
				.map((id) => ENABLED_MODULE_ALIASES[id] ?? id)
				.flatMap((id) => ENABLED_MODULE_EXPANSIONS[id] ?? [id])
				.filter((id) => valid.has(id))
		)
	];
	const validation = registry.validateDependencies(filtered);
	if (!validation.valid) return all;
	return filtered;
}

export function isPathEnabled(
	pathname: string,
	enabledModuleIds: readonly string[],
	mappings: readonly ModulePathMapping[]
): boolean {
	const moduleId = moduleForPath(pathname, mappings);
	if (!moduleId) return true;
	if (moduleId === 'core') return true;
	return enabledModuleIds.includes(moduleId);
}
