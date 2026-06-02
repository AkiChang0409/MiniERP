<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();
	let settingsOpen = $state(false);

	const formatStatus = (s: string) =>
		s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

	const formatShortDate = (d: string | null | undefined) => {
		if (!d) return '';
		const dt = new Date(d);
		if (Number.isNaN(dt.getTime())) return d;
		return dt.toLocaleDateString('en-SG', { month: 'short', day: 'numeric', year: 'numeric' });
	};

	const dateRangeLabel = $derived.by(() => {
		const a = data.project.startDate;
		const b = data.project.endDate;
		if (a && b) return `${formatShortDate(a)} �?${formatShortDate(b)}`;
		if (a) return `From ${formatShortDate(a)}`;
		if (b) return `Until ${formatShortDate(b)}`;
		return '';
	});

	const base = $derived(`/projects/${data.project.id}`);
	const path = $derived(page.url.pathname);

	// Active nav item within project workspace
	const isDashboard = $derived(path === base);
	const isDocuments = $derived(path.startsWith(`${base}/documents`));
	const isExpenses = $derived(path.startsWith(`${base}/expenses`));
	const isRevenue = $derived(path.startsWith(`${base}/revenue`));
	const isMembers = $derived(path.startsWith(`${base}/employees`) || path.startsWith(`${base}/members`));

	// Project workspace nav items
	type NavItem = {
		href: string;
		label: string;
		icon: string;
		active: boolean;
		count?: number;
	};

	const navItems = $derived<NavItem[]>([
		{ href: base, label: 'Dashboard', icon: '-', active: isDashboard },
		{
			href: `${base}/documents`,
			label: 'Documents',
			icon: '-',
			active: isDocuments,
			count:
				data.submoduleCounts.contracts +
				data.submoduleCounts.quotations +
				data.submoduleCounts.purchaseOrders +
				data.submoduleCounts.expenses
		},
		{ href: `${base}/expenses`, label: 'Expenses', icon: '-', active: isExpenses, count: data.submoduleCounts.expenses },
		{ href: `${base}/revenue`, label: 'Revenue', icon: '¥', active: isRevenue },
		{ href: `${base}/employees`, label: 'Team & Cost', icon: '-', active: isMembers }
	]);

	const projectAction = (action: string) => `${base}?/${action}`;

	const formMessage = $derived(
		page.form && typeof page.form === 'object' && page.form !== null && 'message' in page.form
			? String((page.form as { message?: string }).message ?? '')
			: ''
	);

	const navLinkClass = (active: boolean) =>
		`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition ${
			active
				? 'bg-[var(--sf-green-soft)] font-medium text-[var(--sf-green)]'
				: 'text-slate-600 hover:bg-slate-100'
		}`;
</script>

<div class="flex min-h-[calc(100vh-3.5rem)]">
	<!-- Project sidebar -->
	<aside class="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50/50 lg:block">
		<div class="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
			<!-- Back to project list -->
			<div class="shrink-0 border-b border-slate-200 p-4">
				<a 
					href="/projects" 
					class="flex items-center gap-2 text-sm text-slate-500 transition hover:text-[var(--sf-green)]"
				>
					<span>-</span>
					<span>All Projects</span>
				</a>
			</div>

			<!-- Current project summary -->
			<div class="shrink-0 border-b border-slate-200 p-4">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h2 class="truncate text-sm font-semibold text-slate-900">{data.project.name}</h2>
						<p class="mt-0.5 truncate text-xs text-slate-500">{data.customerName}</p>
					</div>
					<span
						class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
						style="background: var(--sf-green-soft); color: var(--sf-green);"
					>
						{formatStatus(data.project.status)}
					</span>
				</div>
				{#if dateRangeLabel}
					<p class="mt-2 text-[11px] text-slate-400">{dateRangeLabel}</p>
				{/if}
			</div>

			<!-- Project section links -->
			<nav class="flex-1 overflow-y-auto p-4">
				<p class="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
					Project Navigation
				</p>
				<div class="flex flex-col gap-1">
					{#each navItems as item}
						<a class={navLinkClass(item.active)} href={item.href}>
							<span class="w-4 text-center opacity-60">{item.icon}</span>
							<span class="flex-1">{item.label}</span>
							{#if item.count !== undefined && item.count > 0}
								<span 
									class={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
										item.active 
											? 'bg-[var(--sf-green)] text-white' 
											: 'bg-slate-200 text-slate-600'
									}`}
								>
									{item.count}
								</span>
							{/if}
						</a>
					{/each}
				</div>
			</nav>

			<!-- Project settings -->
			<div class="shrink-0 border-t border-slate-200 p-4">
				<button
					type="button"
					class="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
					onclick={() => { settingsOpen = true; }}
				>
					<span class="opacity-60">-</span>
					Project Settings
				</button>
			</div>
		</div>
	</aside>

	<!-- Main column -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Mobile project nav -->
		<div class="border-b border-slate-200 bg-slate-50/80 px-4 py-3 lg:hidden">
			<div class="mb-2 flex items-center justify-between">
				<a href="/projects" class="text-xs text-slate-500 hover:text-[var(--sf-green)]">�?All Projects</a>
				<button
					type="button"
					class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
					onclick={() => { settingsOpen = true; }}
				>
					Settings
				</button>
			</div>
			<h2 class="text-sm font-semibold text-slate-900">{data.project.name}</h2>
			<div class="mt-2 flex gap-2 overflow-x-auto pb-1">
				{#each navItems as item}
					<a
						href={item.href}
						class={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
							item.active
								? 'border-[var(--sf-green)] bg-[var(--sf-green-soft)] text-[var(--sf-green)]'
								: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
						}`}
					>
						{item.label}
						{#if item.count !== undefined && item.count > 0}
							<span class="ml-1 opacity-70">({item.count})</span>
						{/if}
					</a>
				{/each}
			</div>
		</div>

		<!-- Page body -->
		<main class="flex-1 overflow-y-auto">
			<div class="mx-auto w-full max-w-5xl px-6 py-6">
				<!-- Breadcrumb -->
				<header class="mb-6">
					<nav class="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
						<a class="hover:text-[var(--sf-green)] hover:underline" href="/projects">Projects</a>
						<span class="text-slate-300">/</span>
						<a class="hover:text-[var(--sf-green)] hover:underline" href={base}>{data.project.name}</a>
						{#if !isDashboard}
							<span class="text-slate-300">/</span>
							<span class="text-slate-600">
								{#if isDocuments}Documents{:else if isExpenses}Expenses{:else if isRevenue}Revenue{:else if isMembers}Team & Cost{/if}
							</span>
						{/if}
					</nav>
				</header>

				<!-- Nested route outlet -->
				<div class="min-w-0">
					{@render children?.()}
				</div>
			</div>
		</main>
	</div>

	<!-- Activity feed (large screens) -->
	<aside class="hidden w-72 shrink-0 border-l border-slate-200 bg-slate-50/30 xl:block">
		<div class="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto p-4">
			<section class="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div class="shrink-0 border-b border-slate-200 px-4 py-3">
					<h2 class="text-[13px] font-semibold text-slate-900">Recent Updates</h2>
					<p class="mt-0.5 text-[11px] text-slate-500">Project activity and audit log</p>
				</div>
				<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
					{#if data.activityFeed.length === 0}
						<p class="px-2 py-8 text-center text-xs text-slate-500">
							No recent activity
						</p>
					{:else}
						<div class="flex flex-col gap-2.5">
							{#each data.activityFeed as item}
								<div
									class="rounded-lg border px-3 py-2.5 {item.variant === 'success'
										? 'border-emerald-100 bg-emerald-50/50'
										: item.variant === 'warn'
											? 'border-amber-100 bg-amber-50/40'
											: 'border-sky-100 bg-sky-50/40'}"
								>
									<p class="text-[12px] leading-snug text-slate-800">{item.summary}</p>
									<p class="mt-1.5 text-[10px] text-slate-500">
										<span class="font-medium text-slate-600">{item.actor}</span>
										<span class="text-slate-300"> · </span>
										{item.timeLabel}
									</p>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</section>
		</div>
	</aside>
</div>

{#if settingsOpen}
	<div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
		<button
			type="button"
			class="absolute inset-0 bg-slate-900/50"
			aria-label="Close settings"
			onclick={() => {
				settingsOpen = false;
			}}
		></button>
		<div
			class="relative max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="project-settings-title"
		>
			<div class="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
				<h2 id="project-settings-title" class="text-sm font-semibold text-slate-900">Project settings</h2>
				<button
					type="button"
					class="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
					onclick={() => {
						settingsOpen = false;
					}}
				>
					Close
				</button>
			</div>
			<div class="max-h-[calc(90vh-8rem)] overflow-y-auto p-5">
				<form
					id="project-settings-form"
					class="space-y-4"
					method="POST"
					action={projectAction('update')}
					use:enhance={() => {
						return async ({ result }) => {
							if (result.type === 'success') {
								settingsOpen = false;
								await invalidateAll();
							}
						};
					}}
				>
					{#if formMessage}
						<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formMessage}</p>
					{/if}

					<label class="block space-y-1.5 text-xs font-medium text-slate-700">
						Project name
						<input
							name="name"
							required
							value={data.project.name}
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
						/>
					</label>

					<label class="block space-y-1.5 text-xs font-medium text-slate-700">
						Customer
						<input
							readonly
							value={data.customerName}
							class="h-9 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-2.5 text-[13px] font-normal text-slate-600"
						/>
					</label>

					<label class="block space-y-1.5 text-xs font-medium text-slate-700">
						Status
						<select
							name="status"
							class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							value={data.project.status}
						>
							<option value="unassigned">Unassigned</option>
							<option value="ongoing">Ongoing</option>
							<option value="under_review">Under Review</option>
							<option value="completed">Completed</option>
							<option value="active">active (legacy)</option>
							<option value="on_hold">on_hold (legacy)</option>
							<option value="archived">archived</option>
						</select>
					</label>

					<div class="grid grid-cols-2 gap-3">
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Deadline
							<input
								type="date"
								name="deadline"
								value={data.project.deadline ?? ''}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Priority (1–10)
							<input
								type="number"
								name="priority"
								min="1"
								max="10"
								value={data.project.priority ?? 5}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Recurrence
							<select
								name="recurrenceFrequency"
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
								value={data.project.recurrenceFrequency ?? ''}
							>
								<option value="">No recurrence</option>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
								<option value="monthly">Monthly</option>
								<option value="custom">Custom (every N days)</option>
							</select>
						</label>
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Recurrence interval (days)
							<input
								type="number"
								name="recurrenceInterval"
								min="1"
								value={data.project.recurrenceInterval ?? ''}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Start date
							<input
								type="date"
								name="startDate"
								value={data.project.startDate ?? ''}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							End date
							<input
								type="date"
								name="endDate"
								value={data.project.endDate ?? ''}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
					</div>

					<label class="block space-y-1.5 text-xs font-medium text-slate-700">
						Description
						<textarea
							name="description"
							rows="3"
							class="w-full resize-none rounded-md border border-slate-300 px-2.5 py-2 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
						>{data.project.description ?? ''}</textarea>
					</label>

					<label class="block space-y-1.5 text-xs font-medium text-slate-700">
						Notes
						<textarea
							name="notes"
							rows="3"
							class="w-full resize-none rounded-md border border-slate-300 px-2.5 py-2 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
						>{data.project.notes ?? ''}</textarea>
					</label>

					<div class="grid grid-cols-2 gap-3">
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Attachment URL
							<input
								type="url"
								name="attachmentUrl"
								value={data.project.attachmentUrl ?? ''}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
						<label class="block space-y-1.5 text-xs font-medium text-slate-700">
							Attachment label
							<input
								name="attachmentName"
								value={data.project.attachmentName ?? ''}
								class="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px] font-normal outline-none focus:border-[var(--sf-green)] focus:ring-1 focus:ring-[var(--sf-green)]"
							/>
						</label>
					</div>

					<div class="flex gap-2 pt-2">
						<button
							type="submit"
							class="flex-1 rounded-md bg-[var(--sf-green)] py-2 text-[13px] font-medium text-white hover:bg-[#2f5e2c]"
						>
							Save changes
						</button>
						<button
							type="button"
							class="rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 hover:bg-slate-50"
							onclick={() => invalidateAll()}
						>
							Reset
						</button>
					</div>
				</form>

				<div class="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
					<form
						method="POST"
						action={projectAction('archive')}
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									settingsOpen = false;
									await invalidateAll();
								}
							};
						}}
					>
						<button
							type="submit"
							class="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
						>
							Archive project
						</button>
					</form>
					<form method="POST" action={projectAction('remove')}>
						<button
							type="submit"
							class="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
						>
							Remove project
						</button>
					</form>
				</div>
			</div>
		</div>
	</div>
{/if}


