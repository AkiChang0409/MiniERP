import type { AuthRole } from './config';

const roleRank: Record<AuthRole, number> = {
	employee: 1,
	staff: 2,
	hr: 3,
	project_manager: 3,
	finance: 4,
	admin: 5,
	owner: 6
};

const MODULES_BY_ROLE: Record<AuthRole, readonly string[]> = {
	owner: [
		'finance',
		'document-intake',
		'project',
		'hr',
		'procurement',
		'sales-crm',
		'inventory',
		'core'
	],
	admin: [
		'finance',
		'document-intake',
		'project',
		'hr',
		'procurement',
		'sales-crm',
		'inventory',
		'core'
	],
	finance: ['finance', 'document-intake'],
	project_manager: ['project'],
	hr: ['hr'],
	staff: ['project'],
	employee: ['project']
};

const DEFAULT_PATH_BY_ROLE: Record<AuthRole, string> = {
	owner: '/finance/dashboard',
	admin: '/finance/dashboard',
	finance: '/finance/dashboard',
	project_manager: '/projects',
	hr: '/hr/employees',
	staff: '/projects',
	employee: '/projects'
};

export function primaryRole(roles: AuthRole[]): AuthRole {
	if (roles.length === 0) return 'employee';
	return roles.reduce((best, r) => (roleRank[r] > roleRank[best] ? r : best), roles[0]);
}

export function hasAtLeastRole(roles: AuthRole[], required: AuthRole): boolean {
	return roles.some((r) => roleRank[r] >= roleRank[required]);
}

export function roleAllowedModuleIds(roles: AuthRole[]): readonly string[] {
	const set = new Set<string>();
	for (const r of roles) {
		for (const m of MODULES_BY_ROLE[r]) set.add(m);
	}
	return [...set];
}

export function canRolesAccessModule(roles: AuthRole[], moduleId: string): boolean {
	return roles.some((r) => MODULES_BY_ROLE[r].includes(moduleId));
}

export function defaultPathForRoles(roles: AuthRole[]): string {
	return DEFAULT_PATH_BY_ROLE[primaryRole(roles)];
}

export function isRouteAllowed(pathname: string, roles: AuthRole[]): boolean {
	if (
		pathname.startsWith('/settings/users') ||
		pathname.startsWith('/settings/invites') ||
		pathname.startsWith('/api/settings/users') ||
		pathname.startsWith('/api/settings/invites')
	) {
		return roles.some((r) => r === 'owner' || r === 'admin');
	}
	if (pathname.startsWith('/api/finance/tax') || pathname.startsWith('/api/settings')) {
		return roles.some((r) => r === 'owner' || r === 'finance' || r === 'admin');
	}
	if (pathname.startsWith('/api/employees')) {
		return roles.some(
			(r) => r === 'owner' || r === 'hr' || r === 'project_manager' || r === 'finance' || r === 'admin'
		);
	}
	if (pathname.startsWith('/settings')) return roles.some((r) => r === 'owner' || r === 'admin');
	if (pathname.startsWith('/finance/tax'))
		return roles.some((r) => r === 'owner' || r === 'finance' || r === 'admin');
	if (pathname.startsWith('/hr/employees'))
		return roles.some((r) => r === 'owner' || r === 'hr' || r === 'admin');
	return true;
}
