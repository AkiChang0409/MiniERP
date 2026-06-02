<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	// ── Requests tab state ────────────────────────────────────────────────────
	let pendingRejectId = $state<string | null>(null);
	let rejectReason = $state('');
	let actionError = $state<string | null>(null);

	// ── Balances tab state ────────────────────────────────────────────────────
	let balanceSearchQuery = $state('');

	// ── Balance helpers ───────────────────────────────────────────────────────

	type BalanceRow = (typeof data.balances)[number];

	function filterLeaveBalancesByEmployee(balances: BalanceRow[], query: string): BalanceRow[] {
		const q = query.trim().toLowerCase();
		if (!q) return balances;
		return balances.filter((b) => (b.personName ?? '').toLowerCase().includes(q));
	}

	function groupLeaveBalancesByEmployee(balances: BalanceRow[]) {
		const map = new Map<string, { personId: string; personName: string; rows: BalanceRow[] }>();
		for (const bal of balances) {
			const key = bal.personId;
			const existing = map.get(key);
			if (existing) {
				existing.rows.push(bal);
			} else {
				map.set(key, {
					personId: bal.personId,
					personName: bal.personName ?? bal.personId,
					rows: [bal]
				});
			}
		}
		return Array.from(map.values());
	}

	const filteredBalances = $derived(
		filterLeaveBalancesByEmployee(data.balances, balanceSearchQuery)
	);
	const groupedBalances = $derived(groupLeaveBalancesByEmployee(filteredBalances));

	// ── Shared helpers ────────────────────────────────────────────────────────

	function statusBadgeClass(status: string) {
		switch (status) {
			case 'pending':
				return 'bg-yellow-100 text-yellow-800';
			case 'approved':
				return 'bg-green-100 text-green-800';
			case 'rejected':
				return 'bg-red-100 text-red-800';
			case 'cancelled':
				return 'bg-slate-100 text-slate-600';
			default:
				return 'bg-slate-100 text-slate-600';
		}
	}

	function sourceBadgeClass(source: string) {
		switch (source) {
			case 'mock':
				return 'bg-purple-50 text-purple-700';
			case 'employee_portal':
				return 'bg-blue-50 text-blue-700';
			default:
				return 'bg-slate-50 text-slate-600';
		}
	}

	function remainingDaysClass(days: number) {
		if (days < 0) return 'text-red-600';
		if (days === 0) return 'text-slate-400';
		return 'text-green-700';
	}

	function fmtDate(d: string | null | undefined) {
		return d ? d.slice(0, 10) : '--';
	}
</script>

<PageShell
	eyebrow="HR"
	title="Leave Management"
	description="Review and manage employee leave requests and balances."
>
	<!-- Tab navigation -->
	<div class="flex gap-0 border-b border-slate-200">
		<a
			href="?tab=requests"
			class="px-4 py-2 text-sm font-medium transition-colors {data.tab !== 'balances'
				? 'border-b-2 border-[var(--sf-green)] text-[var(--sf-green)]'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			Requests
		</a>
		<a
			href="?tab=balances"
			class="px-4 py-2 text-sm font-medium transition-colors {data.tab === 'balances'
				? 'border-b-2 border-[var(--sf-green)] text-[var(--sf-green)]'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			Balances
		</a>
	</div>

	{#if actionError}
		<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{actionError}
		</div>
	{/if}

	<!-- ===== REQUESTS TAB ===== -->
	{#if data.tab !== 'balances'}
		<!-- Filter form -->
		<form
			method="GET"
			class="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3"
		>
			<input type="hidden" name="tab" value="requests" />
			<label class="space-y-1 text-sm">
				<span class="font-medium text-slate-700">Status</span>
				<select
					name="status"
					value={data.filters.status}
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
				>
					<option value="">All statuses</option>
					<option value="pending">Pending</option>
					<option value="approved">Approved</option>
					<option value="rejected">Rejected</option>
					<option value="cancelled">Cancelled</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium text-slate-700">Leave Type</span>
				<select
					name="leaveTypeId"
					value={data.filters.leaveTypeId}
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
				>
					<option value="">All types</option>
					{#each data.leaveTypes as lt}
						<option value={lt.id}>{lt.name}</option>
					{/each}
				</select>
			</label>
			<div class="flex items-end">
				<button
					type="submit"
					class="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Apply
				</button>
			</div>
		</form>

		<!-- Requests table -->
		<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-slate-50 text-left text-slate-600">
					<tr>
						<th class="px-4 py-3 font-medium">Employee</th>
						<th class="px-4 py-3 font-medium">Leave Type</th>
						<th class="px-4 py-3 font-medium">Start</th>
						<th class="px-4 py-3 font-medium">End</th>
						<th class="px-4 py-3 font-medium">Days</th>
						<th class="px-4 py-3 font-medium">Status</th>
						<th class="px-4 py-3 font-medium">Reason</th>
						<th class="px-4 py-3 font-medium">Source</th>
						<th class="px-4 py-3 font-medium">Submitted</th>
						<!-- min-w keeps Approve + Reject on one line -->
						<th class="px-4 py-3 font-medium" style="min-width:180px">Action</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if data.requests.length === 0}
						<tr>
							<td class="px-4 py-8 text-center text-slate-400" colspan="10">
								No leave requests found.
							</td>
						</tr>
					{:else}
						{#each data.requests as req (req.id)}
							<tr class="hover:bg-slate-50">
								<td class="px-4 py-3 font-medium text-slate-800">{req.personName}</td>
								<td class="px-4 py-3 text-slate-600">{req.leaveTypeName}</td>
								<td class="whitespace-nowrap px-4 py-3 text-slate-600">{req.startDate}</td>
								<td class="whitespace-nowrap px-4 py-3 text-slate-600">{req.endDate}</td>
								<td class="px-4 py-3 text-slate-600">{req.totalDays}</td>
								<td class="px-4 py-3">
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(req.status)}"
									>
										{req.status}
									</span>
								</td>
								<td class="max-w-[160px] px-4 py-3 text-slate-500">
									<span class="line-clamp-2">{req.reason ?? '--'}</span>
								</td>
								<td class="px-4 py-3">
									<span class="rounded px-1.5 py-0.5 text-xs {sourceBadgeClass(req.source)}">
										{req.source}
									</span>
								</td>
								<td class="whitespace-nowrap px-4 py-3 text-slate-500">{fmtDate(req.submittedAt)}</td>

								<!-- Action cell ─────────────────────────────────────────────── -->
								<td class="px-4 py-3">
									{#if req.status === 'pending'}
										{#if pendingRejectId === req.id}
											<!-- Expanded reject form -->
											<form
												method="POST"
												action="?/reject"
												class="space-y-1"
												use:enhance={() => {
													return async ({ result, update }) => {
														if (result.type === 'failure') {
															actionError =
																(result.data as { message?: string })?.message ?? 'Reject failed';
														} else {
															actionError = null;
															pendingRejectId = null;
															rejectReason = '';
														}
														await update({ reset: false });
													};
												}}
											>
												<input type="hidden" name="leaveRequestId" value={req.id} />
												<input
													type="text"
													name="rejectionReason"
													bind:value={rejectReason}
													placeholder="Reason (required)"
													class="w-full rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
												/>
												<div class="flex items-center gap-2">
													<button
														type="submit"
														class="text-xs font-medium text-red-600 hover:underline"
													>
														Confirm
													</button>
													<button
														type="button"
														onclick={() => {
															pendingRejectId = null;
															rejectReason = '';
														}}
														class="text-xs text-slate-400 hover:underline"
													>
														Cancel
													</button>
												</div>
											</form>
										{:else}
											<!-- Normal state: Approve | Reject on one line -->
											<div class="flex items-center gap-3">
												<form
													method="POST"
													action="?/approve"
													use:enhance={() => {
														return async ({ result, update }) => {
															if (result.type === 'failure') {
																actionError =
																	(result.data as { message?: string })?.message ?? 'Approve failed';
															} else {
																actionError = null;
															}
															await update({ reset: false });
														};
													}}
												>
													<input type="hidden" name="leaveRequestId" value={req.id} />
													<button
														type="submit"
														class="whitespace-nowrap text-xs font-medium text-[var(--sf-green)] hover:underline"
													>
														Approve
													</button>
												</form>
												<button
													type="button"
													onclick={() => {
														pendingRejectId = req.id;
														rejectReason = '';
													}}
													class="whitespace-nowrap text-xs font-medium text-red-500 hover:underline"
												>
													Reject
												</button>
											</div>
										{/if}
									{:else if req.status === 'approved'}
										<span class="whitespace-nowrap text-xs text-slate-400">
											{req.approvedByUserId ? `by ${req.approvedByUserId}` : 'approved'}
											{#if req.approvedAt}· {fmtDate(req.approvedAt)}{/if}
										</span>
									{:else if req.status === 'rejected'}
										<span
											class="whitespace-nowrap text-xs text-slate-400"
											title={req.rejectionReason ?? ''}
										>
											{req.rejectedByUserId ? `by ${req.rejectedByUserId}` : 'rejected'}
											{#if req.rejectedAt}· {fmtDate(req.rejectedAt)}{/if}
										</span>
									{:else}
										<span class="text-xs text-slate-300">--</span>
									{/if}
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

	<!-- ===== BALANCES TAB ===== -->
	{:else}
		<!-- Controls row: year selector + employee search -->
		<div class="flex flex-wrap items-end gap-3">
			<!-- Year selector -->
			<form method="GET" class="flex items-center gap-2">
				<input type="hidden" name="tab" value="balances" />
				<label class="flex items-center gap-2 text-sm text-slate-700">
					<span class="font-medium">Year</span>
					<select
						name="year"
						value={String(data.year)}
						class="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
					>
						{#each [new Date().getFullYear() + 1, new Date().getFullYear(), new Date().getFullYear() - 1] as y}
							<option value={String(y)}>{y}</option>
						{/each}
					</select>
				</label>
				<button
					type="submit"
					class="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
				>
					Load
				</button>
			</form>

			<!-- Employee search (client-side) -->
			<div class="relative">
				<svg
					class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					viewBox="0 0 24 24"
				>
					<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
				</svg>
				<input
					type="search"
					placeholder="Search employee…"
					bind:value={balanceSearchQuery}
					class="rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)] w-48"
				/>
			</div>
		</div>

		<!-- Grouped employee cards -->
		{#if data.balances.length === 0}
			<div
				class="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm"
			>
				No leave balance records for {data.year}.
			</div>
		{:else if groupedBalances.length === 0}
			<div
				class="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm"
			>
				No employees match "<span class="font-medium text-slate-600">{balanceSearchQuery}</span>".
			</div>
		{:else}
			<div class="space-y-4">
				{#each groupedBalances as group (group.personId)}
					<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						<!-- Employee header -->
						<div
							class="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5"
						>
							<span class="font-semibold text-slate-800">{group.personName}</span>
							<span class="text-xs text-slate-400">
								{group.rows.length}
								{group.rows.length === 1 ? 'leave type' : 'leave types'} · {data.year}
							</span>
						</div>

						<!-- Leave type rows -->
						<table class="min-w-full text-sm">
							<thead>
								<tr class="border-b border-slate-100 text-xs text-slate-500">
									<th class="px-4 py-2 text-left font-medium">Leave Type</th>
									<th class="px-4 py-2 text-right font-medium">Entitled</th>
									<th class="px-4 py-2 text-right font-medium">Used</th>
									<th class="px-4 py-2 text-right font-medium text-amber-700">Pending</th>
									<th class="px-4 py-2 text-right font-medium">Remaining</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								{#each group.rows as bal (bal.id)}
									<tr class="hover:bg-slate-50/60">
										<td class="px-4 py-2.5 text-slate-700">
											<span
												class="mr-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
											>
												{bal.leaveTypeCode}
											</span>
											{bal.leaveTypeName}
										</td>
										<td class="px-4 py-2.5 text-right tabular-nums text-slate-700">
											{bal.entitledDays}
										</td>
										<td class="px-4 py-2.5 text-right tabular-nums text-slate-600">
											{bal.usedDays}
										</td>
										<td class="px-4 py-2.5 text-right tabular-nums text-amber-700">
											{bal.pendingDays}
										</td>
										<td
											class="px-4 py-2.5 text-right tabular-nums font-semibold {remainingDaysClass(bal.remainingDays)}"
										>
											{bal.remainingDays}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</PageShell>
