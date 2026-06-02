<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';

	let { data } = $props();

	let filterModule = $state(data.filters.module ?? '');
	let filterActionType = $state<string>(data.filters.actionType ?? '');
	let filterEmail = $state(data.filters.actorEmail ?? '');
	let filterDateFrom = $state(data.filters.dateFrom ?? '');
	let filterDateTo = $state(data.filters.dateTo ?? '');
	let filterQuery = $state(data.filters.query ?? '');
	let expandedRow = $state<string | null>(null);

	let integrityResult = $state<{
		valid: boolean;
		checkedCount: number;
		firstInvalidSeq: number | null;
		lastVerifiedSeq: number;
	} | null>(null);
	let integrityLoading = $state(false);

	const modules = [
		'core',
		'finance',
		'document-intake',
		'project',
		'hr',
		'procurement',
		'sales-crm'
	];
	const actionTypes = ['view', 'create', 'update', 'delete', 'export', 'login', 'permission_change', 'system'];

	function applyFilters() {
		const params = new URLSearchParams();
		if (filterModule) params.set('module', filterModule);
		if (filterActionType) params.set('actionType', filterActionType);
		if (filterEmail) params.set('actorEmail', filterEmail);
		if (filterDateFrom) params.set('dateFrom', filterDateFrom);
		if (filterDateTo) params.set('dateTo', filterDateTo);
		if (filterQuery) params.set('q', filterQuery);
		goto(`/settings/audit-logs?${params.toString()}`);
	}

	function clearFilters() {
		filterModule = '';
		filterActionType = '';
		filterEmail = '';
		filterDateFrom = '';
		filterDateTo = '';
		filterQuery = '';
		goto('/settings/audit-logs');
	}

	function goToPage(p: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', String(p));
		goto(`/settings/audit-logs?${params.toString()}`);
	}

	async function exportCsv() {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('format', 'csv');
		params.delete('page');
		params.delete('pageSize');
		window.open(`/api/audit/logs/export?${params.toString()}`, '_blank');
	}

	async function verifyIntegrity() {
		integrityLoading = true;
		try {
			const res = await fetch('/api/audit/integrity');
			const json: { data: typeof integrityResult } = await res.json();
			integrityResult = json.data;
		} catch {
			integrityResult = { valid: false, checkedCount: 0, firstInvalidSeq: -1, lastVerifiedSeq: 0 };
		} finally {
			integrityLoading = false;
		}
	}

	function toggleExpand(id: string) {
		expandedRow = expandedRow === id ? null : id;
	}

	function formatDate(iso: string | null) {
		if (!iso) return '-';
		return new Date(iso).toLocaleString();
	}

	function actionTypeBadge(type: string | null) {
		const colors: Record<string, string> = {
			create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
			update: 'bg-blue-50 text-blue-700 border-blue-200',
			delete: 'bg-rose-50 text-rose-700 border-rose-200',
			view: 'bg-slate-50 text-slate-700 border-slate-200',
			export: 'bg-amber-50 text-amber-700 border-amber-200',
			login: 'bg-violet-50 text-violet-700 border-violet-200',
			permission_change: 'bg-orange-50 text-orange-700 border-orange-200',
			system: 'bg-indigo-50 text-indigo-700 border-indigo-200'
		};
		return colors[type ?? ''] ?? 'bg-slate-50 text-slate-600 border-slate-200';
	}

	function tryParseJson(val: string | null): Record<string, unknown> | null {
		if (!val) return null;
		try { return JSON.parse(val); } catch { return null; }
	}
</script>

<PageShell
	eyebrow="Compliance"
	title="Centralised Audit Trail"
	description="View, search, and export all system transactions. Hash-chained for tamper evidence."
>
	<!-- Integrity Check Banner -->
	<div class="mb-4 flex items-center gap-4">
		<button
			onclick={verifyIntegrity}
			disabled={integrityLoading}
			class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
		>
			{integrityLoading ? 'Verifying...' : 'Verify Hash Chain Integrity'}
		</button>
		<button
			onclick={exportCsv}
			class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
		>
			Export CSV
		</button>
		<span class="text-xs text-slate-500">
			Retention: {data.retentionYears} years | Total: {data.logs.total} entries
		</span>
	</div>

	{#if integrityResult}
		<div class={`mb-4 rounded-md border px-3 py-2 text-sm ${
			integrityResult.valid
				? 'border-emerald-200 bg-emerald-50 text-emerald-700'
				: 'border-rose-200 bg-rose-50 text-rose-700'
		}`}>
			{#if integrityResult.valid}
				Hash chain integrity verified. {integrityResult.checkedCount} entries checked, all valid.
			{:else}
				Hash chain integrity FAILED at sequence #{integrityResult.firstInvalidSeq}.
				{integrityResult.checkedCount} entries checked before failure.
			{/if}
		</div>
	{/if}

	<!-- Filters -->
	<div class="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
			<div>
				<label class="mb-1 block text-xs font-medium text-slate-600" for="f-query">Search</label>
				<input
					id="f-query"
					type="text"
					bind:value={filterQuery}
					placeholder="Free text..."
					class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
					onkeydown={(e) => { if (e.key === 'Enter') applyFilters(); }}
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium text-slate-600" for="f-module">Module</label>
				<select
					id="f-module"
					bind:value={filterModule}
					class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
				>
					<option value="">All</option>
					{#each modules as m}
						<option value={m}>{m}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium text-slate-600" for="f-type">Action Type</label>
				<select
					id="f-type"
					bind:value={filterActionType}
					class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
				>
					<option value="">All</option>
					{#each actionTypes as t}
						<option value={t}>{t}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium text-slate-600" for="f-email">User Email</label>
				<input
					id="f-email"
					type="text"
					bind:value={filterEmail}
					placeholder="email..."
					class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium text-slate-600" for="f-from">Date From</label>
				<input
					id="f-from"
					type="date"
					bind:value={filterDateFrom}
					class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
				/>
			</div>
			<div>
				<label class="mb-1 block text-xs font-medium text-slate-600" for="f-to">Date To</label>
				<input
					id="f-to"
					type="date"
					bind:value={filterDateTo}
					class="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"
				/>
			</div>
		</div>
		<div class="mt-3 flex gap-2">
			<button
				onclick={applyFilters}
				class="rounded-md bg-[var(--sf-green)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			>
				Search
			</button>
			<button
				onclick={clearFilters}
				class="rounded-md border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Clear
			</button>
		</div>
	</div>

	<!-- Results Table -->
	<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="w-full text-left text-sm">
			<thead class="border-b border-slate-200 bg-slate-50">
				<tr>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">Timestamp</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">User</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">IP</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">Module</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">Type</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">Action</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">Entity</th>
					<th class="px-3 py-2 text-xs font-semibold text-slate-600">Seq</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs.items as log}
					<tr
						class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
						onclick={() => toggleExpand(log.id)}
					>
						<td class="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatDate(log.createdAt)}</td>
						<td class="px-3 py-2 text-xs text-slate-700">{log.actorEmail ?? '-'}</td>
						<td class="px-3 py-2 text-xs text-slate-500">{log.ipAddress ?? '-'}</td>
						<td class="px-3 py-2 text-xs text-slate-600">{log.module ?? '-'}</td>
						<td class="px-3 py-2">
							{#if log.actionType}
								<span class={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${actionTypeBadge(log.actionType)}`}>
									{log.actionType}
								</span>
							{:else}
								<span class="text-xs text-slate-400">-</span>
							{/if}
						</td>
						<td class="px-3 py-2 text-xs font-medium text-slate-800">{log.action}</td>
						<td class="px-3 py-2 text-xs text-slate-600">
							{log.entityType}{log.entityId ? `:${log.entityId.slice(0, 8)}` : ''}
						</td>
						<td class="px-3 py-2 text-xs text-slate-400">#{log.seq ?? '-'}</td>
					</tr>

					{#if expandedRow === log.id}
						<tr class="bg-slate-50">
							<td colspan="8" class="px-4 py-3">
								<div class="grid gap-3 text-xs lg:grid-cols-3">
									<div>
										<p class="mb-1 font-semibold text-slate-700">Details</p>
										<p><span class="text-slate-500">Full ID:</span> {log.id}</p>
										<p><span class="text-slate-500">User ID:</span> {log.actorUserId ?? '-'}</p>
										<p><span class="text-slate-500">Project ID:</span> {log.projectId ?? '-'}</p>
										<p><span class="text-slate-500">Entity ID:</span> {log.entityId ?? '-'}</p>
										<p><span class="text-slate-500">Hash:</span> <code class="text-[10px]">{log.hashChain?.slice(0, 24) ?? '-'}...</code></p>
									</div>
									{#if log.oldValue || log.newValue}
										<div>
											<p class="mb-1 font-semibold text-slate-700">Changes</p>
											{#if log.oldValue}
												<div class="mb-1">
													<span class="text-rose-600">Old:</span>
													<pre class="mt-0.5 max-h-32 overflow-auto rounded bg-white p-1.5 text-[10px]">{JSON.stringify(tryParseJson(log.oldValue), null, 2)}</pre>
												</div>
											{/if}
											{#if log.newValue}
												<div>
													<span class="text-emerald-600">New:</span>
													<pre class="mt-0.5 max-h-32 overflow-auto rounded bg-white p-1.5 text-[10px]">{JSON.stringify(tryParseJson(log.newValue), null, 2)}</pre>
												</div>
											{/if}
										</div>
									{/if}
									{#if log.metadata}
										<div>
											<p class="mb-1 font-semibold text-slate-700">Metadata</p>
											<pre class="max-h-40 overflow-auto rounded bg-white p-1.5 text-[10px]">{JSON.stringify(tryParseJson(log.metadata), null, 2)}</pre>
										</div>
									{/if}
								</div>
							</td>
						</tr>
					{/if}
				{:else}
					<tr>
						<td colspan="8" class="px-4 py-8 text-center text-sm text-slate-400">
							No audit log entries found.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if data.logs.totalPages > 1}
		<div class="mt-4 flex items-center justify-between text-sm">
			<span class="text-xs text-slate-500">
				Page {data.logs.page} of {data.logs.totalPages} ({data.logs.total} total)
			</span>
			<div class="flex gap-1">
				{#if data.logs.page > 1}
					<button
						onclick={() => goToPage(data.logs.page - 1)}
						class="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
					>
						Previous
					</button>
				{/if}
				{#if data.logs.page < data.logs.totalPages}
					<button
						onclick={() => goToPage(data.logs.page + 1)}
						class="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
					>
						Next
					</button>
				{/if}
			</div>
		</div>
	{/if}
</PageShell>
