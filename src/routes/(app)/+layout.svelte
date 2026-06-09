<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$platform/auth/client';
	import WorkflowPanel from '$app-layer/ai-panel/components/workflow-panel/WorkflowPanel.svelte';
	import PanelTrigger from '$app-layer/ai-panel/components/workflow-panel/PanelTrigger.svelte';

	type Primary =
		| 'finance'
		| 'project'
		| 'hr'
		| 'procurement'
		| 'sales-crm'
		| 'inventory'
		| 'settings';

	type SideLink = {
		href: string;
		label: string;
		moduleId: string | null;
		icon?: string;
		badge?: number;
	};

	type SideGroup = {
		title?: string;
		items: SideLink[];
	};

	const primaryTabs: Array<{
		id: Primary;
		href: string;
		label: string;
		moduleId: string | null;
	}> = [
		{ id: 'finance', href: '/finance/dashboard', label: 'Finance', moduleId: 'finance' },
		{ id: 'project', href: '/projects/gantt', label: 'Project', moduleId: 'project' },
		{ id: 'hr', href: '/hr/employees', label: 'HR', moduleId: 'hr' },
		{ id: 'procurement', href: '/procurement/suppliers', label: 'Procurement', moduleId: 'procurement' },
		{ id: 'sales-crm', href: '/sales-crm/customers', label: 'Sales CRM', moduleId: 'sales-crm' },
		{ id: 'inventory', href: '/inventory/items', label: 'Inventory', moduleId: 'inventory' },
		{ id: 'settings', href: '/settings', label: 'Setting', moduleId: 'core' }
	];


	// Finance section sidebar - company-level finance
	const financeGroups: SideGroup[] = [
		{
			title: 'Overview',
			items: [{ href: '/finance/dashboard', label: 'Dashboard', moduleId: 'finance', icon: 'D' }]
		},
		{
			title: 'Tax',
			items: [
				{ href: '/finance/tax', label: 'GST Return', moduleId: 'finance', icon: '%' },
				{ href: '/finance/tax/corporate', label: 'Corporate Tax', moduleId: 'finance', icon: '%' }
			]
		},
		{
			title: 'Company Expenses',
			items: [
				{ href: '/finance/expenses', label: 'All Expenses', moduleId: 'finance', icon: '$' },
				{ href: '/finance/expenses/reimbursements', label: 'Reimbursement Queue', moduleId: 'finance', icon: '$' }
			]
		},
		{
			title: 'Revenue',
			items: [
				{
					href: '/finance/revenue',
					label: 'All Revenue',
					moduleId: 'finance',
					icon: 'I'
				}
			]
		},
		{
			title: 'Inbox',
			items: [
				{
					href: '/finance/inbox',
					label: 'Document Inbox',
					moduleId: 'document-intake',
					icon: 'I'
				}
			]
		},
		{
			title: 'Documents',
			items: [{ href: '/finance/doc-hub', label: 'Doc Hub', moduleId: 'finance', icon: 'F' }]
		}
	];

	const hrGroups: SideGroup[] = [
		{
			title: 'Employees',
			items: [
				{ href: '/hr/employees', label: 'All Employees', moduleId: 'hr', icon: 'H' },
				{ href: '/hr/employees/new', label: 'New Employee', moduleId: 'hr', icon: '+' }
			]
		},
		{
			title: 'Leave',
			items: [
				{ href: '/hr/leave', label: 'Leave Management', moduleId: 'hr', icon: 'L' }
			]
		},
		{
			title: 'Attendance',
			items: [
				{ href: '/hr/attendance', label: 'Attendance Management', moduleId: 'hr', icon: 'A' }
			]
		},
		{
			title: 'Overtime',
			items: [
				{ href: '/hr/overtime', label: 'Overtime Management', moduleId: 'hr', icon: 'O' }
			]
		}
	];

	const procurementGroups: SideGroup[] = [
		{
			title: 'Suppliers',
			items: [
				{ href: '/procurement/suppliers', label: 'Suppliers', moduleId: 'procurement', icon: 'S' },
				{ href: '/procurement/rfqs', label: 'RFQs', moduleId: 'procurement', icon: 'R' }
			]
		}
	];

	const salesCrmGroups: SideGroup[] = [
		{
			title: 'Customers',
			items: [{ href: '/sales-crm/customers', label: 'Customers', moduleId: 'sales-crm', icon: 'C' }]
		}
	];

	const inventoryGroups: SideGroup[] = [
		{
			title: 'Master Data',
			items: [
				{ href: '/inventory/items', label: 'Items', moduleId: 'inventory', icon: 'I' },
				{ href: '/inventory/items/new', label: 'New Item', moduleId: 'inventory', icon: '+' },
				{ href: '/inventory/scan', label: 'Barcode Scan', moduleId: 'inventory', icon: 'B' }
			]
		},
		{
			title: 'Warehouse',
			items: [
				{ href: '/inventory/warehouses', label: 'Warehouses', moduleId: 'inventory', icon: 'W' },
				{ href: '/inventory/stock', label: 'Stock by Location', moduleId: 'inventory', icon: 'S' },
				{ href: '/inventory/transfers', label: 'Stock Transfers', moduleId: 'inventory', icon: 'T' }
			]
		},
		{
			title: 'Movements & Counts',
			items: [
				{ href: '/inventory/movements', label: 'Movement Audit', moduleId: 'inventory', icon: 'M' },
				{ href: '/inventory/cycle-counts', label: 'Cycle Counts', moduleId: 'inventory', icon: 'C' },
				{ href: '/inventory/aging', label: 'Aging Report', moduleId: 'inventory', icon: 'A' }
			]
		}
	];

	const settingsGroups: SideGroup[] = [
		{
			title: 'Configuration',
			items: [{ href: '/settings', label: 'Workspace Settings', moduleId: 'core', icon: '*' }]
		},
		{
			title: 'Team',
			items: [
				{ href: '/settings/users', label: 'Team Members', moduleId: 'core', icon: 'U' },
				{ href: '/settings/invites', label: 'Invite Codes', moduleId: 'core', icon: '+' }
			]
		},
		{
			title: 'Compliance',
			items: [
				{ href: '/settings/audit-logs', label: 'Audit Trail', moduleId: 'core', icon: 'A' }
			]
		}
	];

	let { children, data } = $props();
	const enabledModules = $derived(new Set((data.enabledModules as string[] | undefined) ?? []));
	const homeHref = $derived((data.defaultHome as string | undefined) ?? '/finance/dashboard');

	const projectListGroups = $derived.by((): SideGroup[] => {
		const c = data.projectListCounts;
		return [
			{
				title: 'Projects',
				items: [
					{ href: '/projects/gantt', label: 'Gantt', moduleId: 'project', icon: 'G' },
					{ href: '/projects/dashboard', label: 'Dashboard', moduleId: 'project', icon: 'D' },
					{ href: '/projects/calendar', label: 'Calendar', moduleId: 'project', icon: 'C' },
					{ href: '/projects', label: 'All Projects', moduleId: 'project', icon: 'P', badge: c?.all },
					{
						href: '/projects?status=active',
						label: 'Active',
						moduleId: 'project',
						icon: 'A',
						badge: c?.active
					},
					{ href: '/projects/new', label: 'New Project', moduleId: 'project', icon: '+' }
				]
			}
		];
	});

	const visiblePrimaryTabs = $derived(
		primaryTabs.filter(
			(item) => item.moduleId === null || item.moduleId === 'core' || enabledModules.has(item.moduleId)
		)
	);

	const path = $derived(page.url.pathname);

	// Project detail pages use their own sidebar; shell sidebar is hidden.
	// `/projects/new`, `/projects/dashboard`, `/projects/calendar` are top-level
	// project pages and should stay inside the default centered max-w-6xl
	// container along with `/projects` itself.
	const isProjectDetailPage = $derived(
		/^\/projects\/(?!new$|dashboard(\/|$)|calendar(\/|$)|gantt(\/|$))[^/]+/.test(path)
	);

	// Determine which primary section the route belongs to
	const primaryFromPath = $derived.by((): Primary => {
		if (path.startsWith('/settings')) return 'settings';
		if (path.startsWith('/procurement')) return 'procurement';
		if (path.startsWith('/sales-crm')) return 'sales-crm';
		if (path.startsWith('/inventory')) return 'inventory';
		// Project: list and detail routes
		if (path === '/projects' || path.startsWith('/projects/')) return 'project';
		// HR: employee master data and leave management
		if (path.startsWith('/hr/')) return 'hr';
		// Finance: dashboard, tax, expenses, /finance/* (supplier invoices live under Business Partner)
		return 'finance';
	});

	// Pick sidebar groups for the current section
	const shellSidebarGroups = $derived.by((): SideGroup[] => {
		if (primaryFromPath === 'project') return projectListGroups;
		if (primaryFromPath === 'hr') return hrGroups;
		if (primaryFromPath === 'procurement') return procurementGroups;
		if (primaryFromPath === 'sales-crm') return salesCrmGroups;
		if (primaryFromPath === 'inventory') return inventoryGroups;
		if (primaryFromPath === 'settings') return settingsGroups;
		return financeGroups;
	});

	function linkAllowed(item: SideLink): boolean {
		return item.moduleId === null || item.moduleId === 'core' || enabledModules.has(item.moduleId);
	}

	function linkActive(item: SideLink): boolean {
		const itemPath = new URL(item.href, page.url.origin).pathname;

		// Dashboard
		if (itemPath === '/finance/dashboard') {
			return path === '/finance/dashboard' || path === '/';
		}
		// Tax
		if (itemPath === '/finance/tax/corporate') {
			return path.startsWith('/finance/tax/corporate');
		}
		if (itemPath === '/finance/tax') {
			return path.startsWith('/finance/tax') && !path.startsWith('/finance/tax/corporate');
		}
		// Expenses
		if (itemPath === '/finance/expenses/reimbursements') {
			return path.startsWith('/finance/expenses/reimbursements');
		}
		if (itemPath === '/finance/expenses') {
			return path === '/finance/expenses' || (path.startsWith('/finance/expenses/') && !path.startsWith('/finance/expenses/reimbursements'));
		}
		if (itemPath.startsWith('/finance/revenue/')) {
			return path.startsWith('/finance/revenue');
		}
		if (itemPath === '/finance/doc-hub') {
			return path.startsWith('/finance/doc-hub');
		}
		// Projects
		if (itemPath === '/projects/new') {
			return path === '/projects/new';
		}
		// Active shortcut filter: /projects?status=active
		if (item.href.includes('status=active') && new URL(item.href, page.url.origin).pathname === '/projects') {
			return path === '/projects' && page.url.searchParams.get('status') === 'active';
		}
		if (itemPath === '/projects') {
			return path === '/projects' && page.url.searchParams.get('status') !== 'active';
		}
		// HR / Employees
		if (itemPath === '/hr/employees/new') {
			return path === '/hr/employees/new';
		}
		if (itemPath === '/hr/employees') {
			return path === '/hr/employees';
		}
		// HR / Leave
		if (itemPath === '/hr/leave') {
			return path.startsWith('/hr/leave');
		}
		// HR / Attendance
		if (itemPath === '/hr/attendance') {
			return path.startsWith('/hr/attendance');
		}
		// HR / Overtime
		if (itemPath === '/hr/overtime') {
			return path.startsWith('/hr/overtime');
		}
		// Procurement / Sales CRM
		if (itemPath === '/procurement/suppliers') {
			return path.startsWith('/procurement/suppliers');
		}
		if (itemPath === '/procurement/rfqs') {
			return path.startsWith('/procurement/rfqs');
		}
		if (itemPath === '/sales-crm/customers') {
			return path.startsWith('/sales-crm/customers');
		}
		// Settings
		if (itemPath === '/settings') {
			return path.startsWith('/settings');
		}
		return path === itemPath;
	}

	const subLinkClass = (active: boolean) =>
		`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] transition ${
			active 
				? 'bg-[var(--sf-green-soft)] font-medium text-[var(--sf-green)]' 
				: 'text-slate-600 hover:bg-slate-100'
		}`;

	const primaryTabClass = (id: Primary) =>
		`rounded-md px-3 py-1.5 text-sm font-medium transition ${
			primaryFromPath === id 
				? 'bg-[var(--sf-green-soft)] text-[var(--sf-green)]' 
				: 'text-slate-600 hover:bg-slate-100'
		}`;

	async function logout() {
		await authClient.signOut();
		await goto('/login');
	}
</script>

<div class="theme-shell flex min-h-screen flex-col">
	<!-- Top app bar -->
	<header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
		<div class="flex h-14 items-center justify-between px-4 lg:px-6">
			<!-- Logo and primary nav -->
			<div class="flex items-center gap-6">
				<a class="flex items-center gap-2 text-lg font-semibold text-[var(--sf-green)]" href={homeHref}>
					<span class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sf-green)] text-white text-sm">SF</span>
					SmartFin
				</a>
				<nav class="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
					{#each visiblePrimaryTabs as tab}
						<a class={primaryTabClass(tab.id)} href={tab.href}>
							{tab.label}
						</a>
					{/each}
				</nav>
			</div>
			<!-- User menu -->
			<div class="flex items-center gap-3">
				{#if data.user}
					<div class="hidden items-center gap-2 text-xs sm:flex">
						<span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">{data.user.email}</span>
						<span class="rounded-full bg-[var(--sf-green-soft)] px-2.5 py-1 font-medium text-[var(--sf-green)]">{data.user.roles.join(', ')}</span>
					</div>
					<button
						type="button"
						class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50"
						onclick={() => logout()}
					>
						Logout
					</button>
				{/if}
			</div>
		</div>
		<!-- Mobile primary nav -->
		<nav class="flex items-center gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden" aria-label="Primary navigation mobile">
			{#each visiblePrimaryTabs as tab}
				<a 
					class={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
						primaryFromPath === tab.id 
							? 'bg-[var(--sf-green-soft)] text-[var(--sf-green)]' 
							: 'text-slate-600 hover:bg-slate-100'
					}`}
					href={tab.href}
				>
					{tab.label}
				</a>
			{/each}
		</nav>
	</header>

	<div class="flex min-h-0 flex-1">
		<!-- Shell sidebar (hidden on project detail routes) -->
		{#if !isProjectDetailPage}
			<aside
				class="hidden w-56 shrink-0 border-r border-slate-200 bg-slate-50/50 lg:block"
				aria-label="Secondary navigation"
			>
				<div class="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col overflow-y-auto p-4">
					{#each shellSidebarGroups as group, gi (gi)}
						<div class={gi > 0 ? 'mt-6' : ''}>
							{#if group.title}
								<p class="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
									{group.title}
								</p>
							{/if}
							<nav class="flex flex-col gap-1">
								{#each group.items as item}
									{#if linkAllowed(item)}
										<a class={`${subLinkClass(linkActive(item))} justify-between gap-2`} href={item.href}>
											<span class="flex min-w-0 items-center gap-2.5">
												{#if item.icon}
													<span class="w-4 shrink-0 text-center opacity-60">{item.icon}</span>
												{/if}
												{item.label}
											</span>
											{#if item.badge !== undefined}
												<span
													class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"
												>
													{item.badge}
												</span>
											{/if}
										</a>
									{/if}
								{/each}
							</nav>
						</div>
					{/each}
				</div>
			</aside>

			<!-- Mobile: sidebar as horizontal chips -->
			<div class="border-b border-slate-200 bg-slate-50/80 px-4 py-2 lg:hidden">
				<div class="flex gap-2 overflow-x-auto pb-1" role="navigation" aria-label="Secondary navigation mobile">
					{#each shellSidebarGroups as group}
						{#each group.items as item}
							{#if linkAllowed(item)}
								<a
									class={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
										linkActive(item)
											? 'border-[var(--sf-green)] bg-[var(--sf-green-soft)] text-[var(--sf-green)]'
											: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
									}`}
									href={item.href}
								>
									{item.label}
									{#if item.badge !== undefined}
										<span class="rounded-full bg-white/80 px-1.5 py-0 text-[10px] opacity-90">{item.badge}</span>
									{/if}
								</a>
							{/if}
						{/each}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Main content -->
		<main class="min-w-0 flex-1 bg-white">
			{#if isProjectDetailPage}
				<!-- Project detail: full width; project layout owns sidebars -->
				<div class="h-full">
					{@render children()}
				</div>
			{:else}
				<!-- Default: centered max-width layout -->
				<div class="mx-auto w-full max-w-6xl px-6 py-6">
					{@render children()}
				</div>
			{/if}
		</main>
	</div>
	<PanelTrigger />
	<WorkflowPanel />
</div>

