import type { DBClient } from '$infrastructure/db';
import { CompanySettingsRepository } from '$platform/config/company-settings-repository';
import {
	isPathEnabled as isMappedPathEnabled,
	moduleForPath,
	resolveEnabledModuleIds,
	type ModulePathMapping
} from '$platform/config';
import type { AuthRole } from '$platform/auth/config';
import { canRolesAccessModule } from '$platform/auth/permissions';

// Order matters: moduleForPath() is first-match-wins, so longer / more specific
// prefixes must come before shorter ones.
const MODULE_PATH_MAPPINGS: ModulePathMapping[] = [
	// Document Intake — file uploads, OCR, artifact lifecycle.
	{ prefix: '/api/documents', moduleId: 'document-intake' },
	{ prefix: '/api/doc-hub', moduleId: 'document-intake' },
	{ prefix: '/api/upload', moduleId: 'document-intake' },
	{ prefix: '/api/ocr', moduleId: 'document-intake' },
	{ prefix: '/api/intake', moduleId: 'document-intake' },

	// Finance — expenses, revenue, tax, reporting, dashboards.
	{ prefix: '/api/finance', moduleId: 'finance' },
	{ prefix: '/finance', moduleId: 'finance' },

	// Project — projects, members, archive documents.
	{ prefix: '/api/projects', moduleId: 'project' },
	{ prefix: '/projects', moduleId: 'project' },

	// Procurement — suppliers, vendor contacts, purchase-side master data.
	{ prefix: '/api/procurement', moduleId: 'procurement' },
	{ prefix: '/procurement', moduleId: 'procurement' },

	// Sales CRM — customers and customer-facing master data.
	{ prefix: '/api/sales-crm', moduleId: 'sales-crm' },
	{ prefix: '/sales-crm', moduleId: 'sales-crm' },

	// Inventory — item master, barcodes, attachments (warehouse/movements come later).
	{ prefix: '/api/inventory', moduleId: 'inventory' },
	{ prefix: '/inventory', moduleId: 'inventory' },

	// HR — persons, employees, allocations, payouts.
	{ prefix: '/api/hr', moduleId: 'hr' },
	{ prefix: '/hr', moduleId: 'hr' },

	// Core platform — settings / audit / company-level config (always-enabled).
	{ prefix: '/api/audit', moduleId: 'core' },
	{ prefix: '/api/settings', moduleId: 'core' },
	{ prefix: '/settings', moduleId: 'core' }
];

export async function getEnabledModuleIds(db: DBClient): Promise<string[]> {
	const repo = new CompanySettingsRepository(db);
	const raw = await repo.get<unknown>('modules.enabled');
	return resolveEnabledModuleIds(raw);
}

export function isPathEnabled(pathname: string, enabledModuleIds: readonly string[]): boolean {
	return isMappedPathEnabled(pathname, enabledModuleIds, MODULE_PATH_MAPPINGS);
}

export function moduleIdForPath(pathname: string): string | null {
	return moduleForPath(pathname, MODULE_PATH_MAPPINGS);
}

export function isPathAllowedForRole(pathname: string, roles: AuthRole[], method = 'GET'): boolean {
	if (roles.some((r) => r === 'finance') && method === 'GET' && pathname.startsWith('/api/projects')) {
		return true;
	}
	const moduleId = moduleIdForPath(pathname);
	if (!moduleId) return true;
	return canRolesAccessModule(roles, moduleId);
}

export function filterModuleIdsForRole(moduleIds: readonly string[], roles: AuthRole[]): string[] {
	return moduleIds.filter((moduleId) => canRolesAccessModule(roles, moduleId));
}
