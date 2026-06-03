<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	// ── Action state ──────────────────────────────────────────────────────────
	let pendingRejectId = $state<string | null>(null);
	let rejectReason = $state('');
	let actionError = $state<string | null>(null);

	// ── Helpers ─────────────────────────────────────────────────────────────────

	function statusBadgeClass(status: string): string {
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
				return 'bg-slate-100 text-slate-500';
		}
	}

	function payrollEffectBadgeClass(effect: string): string {
		switch (effect) {
			case 'pending_export':
				return 'bg-blue-100 text-blue-700';
			case 'exported':
				return 'bg-green-100 text-green-700';
			default:
				return 'bg-slate-100 text-slate-500';
		}
	}

	function payrollEffectLabel(effect: string): string {
		switch (effect) {
			case 'not_applicable':
				return '—';
			case 'pending_export':
				return 'Export';
			case 'exported':
				return 'Exported';
			default:
				return effect;
		}
	}

	function fmtMins(mins: number | null | undefined): string {
		if (mins == null || mins === 0) return '—';
		const h = Math.floor(mins / 60);
		const m = mins % 60;
		if (h === 0) return `${m}m`;
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	function fmtDateTime(d: string | null | undefined): string {
		return d ? d.slice(0, 10) : '—';
	}

	function buildTabUrl(tab: string): string {
		const params = new URLSearchParams({
			tab,
			dateFrom: data.filters.dateFrom,
			dateTo: data.filters.dateTo
		});
		if (tab === 'requests' && data.filters.status) params.set('status', data.filters.status);
		return `/hr/overtime?${params.toString()}`;
	}
</script>

<PageShell
	eyebrow="HR"
	title="Overtime Management"
	description="Generate overtime requests from detected attendance overtime, then approve or reject them for payroll."
>
	<!-- Tab navigation -->
	<div class="flex gap-0 border-b border-slate-200">
		<a
			href={buildTabUrl('candidates')}
			class="px-4 py-2 text-sm font-medium transition-colors {data.tab !== 'requests'
				? 'border-b-2 border-[var(--sf-green)] text-[var(--sf-green)]'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			Candidates
		</a>
		<a
			href={buildTabUrl('requests')}
			class="px-4 py-2 text-sm font-medium transition-colors {data.tab === 'requests'
				? 'border-b-2 border-[var(--sf-green)] text-[var(--sf-green)]'
				: 'text-slate-500 hover:text-slate-700'}"
		>
			Requests
		</a>
	</div>

	{#if actionError}
		<div class="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{actionError}
		</div>
	{/if}

	<!-- ===== CANDIDATES TAB ===== -->
	{#if data.tab !== 'requests'}
		<div class="mt-4 space-y-4">
			<p class="text-sm text-slate-500">
				Attendance records with detected overtime that have no overtime request yet. Generating a
				request sends it to the Requests tab for approval.
			</p>

			<!-- Date filter -->
			<form method="GET" class="theme-card flex flex-wrap items-end gap-3 p-4">
				<input type="hidden" name="tab" value="candidates" />
				<div class="flex flex-col gap-1">
					<label for="dateFrom" class="text-xs font-medium text-slate-600">From</label>
					<input
						id="dateFrom"
						type="date"
						name="dateFrom"
						value={data.filters.dateFrom}
						class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[var(--sf-green)] focus:outline-none"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="dateTo" class="text-xs font-medium text-slate-600">To</label>
					<input
						id="dateTo"
						type="date"
						name="dateTo"
						value={data.filters.dateTo}
						class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[var(--sf-green)] focus:outline-none"
					/>
				</div>
				<button
					type="submit"
					class="rounded-lg px-4 py-1.5 text-sm font-medium text-white"
					style="background-color: var(--sf-green);"
				>
					Apply
				</button>
			</form>

			<div class="theme-card overflow-x-auto">
				{#if data.candidates.length === 0}
					<p class="py-10 text-center text-sm text-slate-400">
						No overtime candidates found for the selected period.
					</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th class="px-4 py-3">Employee</th>
								<th class="px-4 py-3">Date</th>
								<th class="px-4 py-3">Check In</th>
								<th class="px-4 py-3">Check Out</th>
								<th class="px-4 py-3 text-right">Overtime</th>
								<th class="px-4 py-3">Notes</th>
								<th class="px-4 py-3" style="min-width:240px">Generate Request</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-50">
							{#each data.candidates as cand (cand.attendanceRecordId)}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 font-medium text-slate-900">{cand.personName}</td>
									<td class="px-4 py-3 font-mono text-xs text-slate-700">{cand.workDate}</td>
									<td class="px-4 py-3 font-mono text-xs">{cand.checkInTime ?? '—'}</td>
									<td class="px-4 py-3 font-mono text-xs">{cand.checkOutTime ?? '—'}</td>
									<td class="px-4 py-3 text-right tabular-nums font-medium text-blue-700"
										>{fmtMins(cand.overtimeMinutes)}</td
									>
									<td class="max-w-[12rem] truncate px-4 py-3 text-xs text-slate-500"
										>{cand.notes ?? '—'}</td
									>
									<td class="px-4 py-3">
										<form
											method="POST"
											action="?/generate"
											class="flex items-center gap-2"
											use:enhance={() => {
												return async ({ result, update }) => {
													if (result.type === 'failure') {
														actionError =
															(result.data as { message?: string })?.message ?? 'Generate failed';
													} else {
														actionError = null;
													}
													await update({ reset: false });
												};
											}}
										>
											<input type="hidden" name="attendanceRecordId" value={cand.attendanceRecordId} />
											<input
												type="text"
												name="reason"
												placeholder="Reason (optional)"
												class="w-32 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
											/>
											<button
												type="submit"
												class="whitespace-nowrap rounded-md border border-[var(--sf-green)] px-3 py-1 text-xs font-medium text-[var(--sf-green)] hover:bg-[var(--sf-green-soft)]"
											>
												Generate
											</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>

	<!-- ===== REQUESTS TAB ===== -->
	{:else}
		<div class="mt-4 space-y-4">
			<!-- Status filter -->
			<form method="GET" class="theme-card flex flex-wrap items-end gap-3 p-4">
				<input type="hidden" name="tab" value="requests" />
				<div class="flex flex-col gap-1">
					<label for="status" class="text-xs font-medium text-slate-600">Status</label>
					<select
						id="status"
						name="status"
						value={data.filters.status}
						class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[var(--sf-green)] focus:outline-none"
					>
						<option value="">All statuses</option>
						<option value="pending">Pending</option>
						<option value="approved">Approved</option>
						<option value="rejected">Rejected</option>
						<option value="cancelled">Cancelled</option>
					</select>
				</div>
				<button
					type="submit"
					class="rounded-lg px-4 py-1.5 text-sm font-medium text-white"
					style="background-color: var(--sf-green);"
				>
					Apply
				</button>
			</form>

			<div class="theme-card overflow-x-auto">
				{#if data.requests.length === 0}
					<p class="py-10 text-center text-sm text-slate-400">No overtime requests found.</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th class="px-4 py-3">Employee</th>
								<th class="px-4 py-3">Date</th>
								<th class="px-4 py-3 text-right">Overtime</th>
								<th class="px-4 py-3">Status</th>
								<th class="px-4 py-3">Source</th>
								<th class="px-4 py-3">Reason</th>
								<th class="px-4 py-3">Payroll</th>
								<th class="px-4 py-3" style="min-width:180px">Action</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-50">
							{#each data.requests as req (req.id)}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 font-medium text-slate-900">{req.personName}</td>
									<td class="px-4 py-3 font-mono text-xs text-slate-700">{req.workDate}</td>
									<td class="px-4 py-3 text-right tabular-nums font-medium text-blue-700"
										>{fmtMins(req.overtimeMinutes)}</td
									>
									<td class="px-4 py-3">
										<span
											class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadgeClass(req.status)}"
										>
											{req.status}
										</span>
									</td>
									<td class="px-4 py-3">
										<span class="rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600">
											{req.source}
										</span>
									</td>
									<td class="max-w-[12rem] truncate px-4 py-3 text-xs text-slate-500"
										>{req.reason ?? '—'}</td
									>
									<td class="px-4 py-3">
										<span
											class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {payrollEffectBadgeClass(req.payrollEffect)}"
										>
											{payrollEffectLabel(req.payrollEffect)}
										</span>
									</td>

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
													<input type="hidden" name="overtimeRequestId" value={req.id} />
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
																		(result.data as { message?: string })?.message ??
																		'Approve failed';
																} else {
																	actionError = null;
																}
																await update({ reset: false });
															};
														}}
													>
														<input type="hidden" name="overtimeRequestId" value={req.id} />
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
												{#if req.approvedAt}· {fmtDateTime(req.approvedAt)}{/if}
											</span>
										{:else if req.status === 'rejected'}
											<span
												class="whitespace-nowrap text-xs text-slate-400"
												title={req.rejectionReason ?? ''}
											>
												{req.rejectedByUserId ? `by ${req.rejectedByUserId}` : 'rejected'}
												{#if req.rejectedAt}· {fmtDateTime(req.rejectedAt)}{/if}
											</span>
										{:else}
											<span class="text-xs text-slate-300">—</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	{/if}
</PageShell>
