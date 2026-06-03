<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data } = $props();

	// ── Badge helpers ─────────────────────────────────────────────────────────

	function statusBadgeClass(status: string): string {
		switch (status) {
			case 'present':
				return 'bg-green-100 text-green-800';
			case 'late':
				return 'bg-yellow-100 text-yellow-800';
			case 'absent':
				return 'bg-red-100 text-red-800';
			case 'on_leave':
				return 'bg-blue-100 text-blue-800';
			case 'missing_checkout':
				return 'bg-amber-100 text-amber-800';
			case 'rest_day':
				return 'bg-slate-100 text-slate-600';
			default:
				return 'bg-slate-100 text-slate-500';
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'present':
				return 'Present';
			case 'late':
				return 'Late';
			case 'absent':
				return 'Absent';
			case 'on_leave':
				return 'On Leave';
			case 'missing_checkout':
				return 'Missing Out';
			case 'rest_day':
				return 'Rest Day';
			default:
				return status;
		}
	}

	function payrollEffectBadgeClass(effect: string): string {
		switch (effect) {
			case 'not_applicable':
				return 'bg-slate-100 text-slate-500';
			case 'pending_review':
				return 'bg-amber-100 text-amber-700';
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
			case 'pending_review':
				return 'Review';
			case 'pending_export':
				return 'Export';
			case 'exported':
				return 'Exported';
			default:
				return effect;
		}
	}

	function sourceBadgeClass(source: string): string {
		switch (source) {
			case 'mock':
				return 'bg-purple-50 text-purple-700';
			case 'manual':
				return 'bg-slate-100 text-slate-600';
			case 'employee_portal':
				return 'bg-blue-50 text-blue-700';
			case 'mobile':
				return 'bg-cyan-50 text-cyan-700';
			case 'terminal':
				return 'bg-indigo-50 text-indigo-700';
			case 'imported':
				return 'bg-orange-50 text-orange-700';
			default:
				return 'bg-slate-100 text-slate-500';
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

	function fmtWorkedHours(mins: number | null | undefined): string {
		if (mins == null) return '—';
		const h = Math.floor(mins / 60);
		const m = mins % 60;
		return m === 0 ? `${h}h` : `${h}h ${m}m`;
	}

	function fmtDate(d: string): string {
		return d.slice(5).replace('-', '/');
	}

	function buildDetailUrl(personId: string, weekStart: string, weekEnd: string): string {
		const params = new URLSearchParams({
			view: 'detail',
			personId,
			weekStart,
			weekEnd,
			dateFrom: data.filters.dateFrom,
			dateTo: data.filters.dateTo
		});
		return `/hr/attendance?${params.toString()}`;
	}

	function buildSummaryUrl(): string {
		const params = new URLSearchParams({
			view: 'summary',
			dateFrom: data.filters.dateFrom,
			dateTo: data.filters.dateTo
		});
		if (data.filters.status) params.set('status', data.filters.status);
		if (data.filters.source) params.set('source', data.filters.source);
		return `/hr/attendance?${params.toString()}`;
	}

	const STATUS_OPTIONS = [
		{ value: '', label: 'All Statuses' },
		{ value: 'present', label: 'Present' },
		{ value: 'late', label: 'Late' },
		{ value: 'absent', label: 'Absent' },
		{ value: 'on_leave', label: 'On Leave' },
		{ value: 'missing_checkout', label: 'Missing Checkout' },
		{ value: 'rest_day', label: 'Rest Day' }
	];

	const SOURCE_OPTIONS = [
		{ value: '', label: 'All Sources' },
		{ value: 'mock', label: 'Mock' },
		{ value: 'manual', label: 'Manual' },
		{ value: 'employee_portal', label: 'Employee Portal' },
		{ value: 'mobile', label: 'Mobile' },
		{ value: 'terminal', label: 'Terminal' },
		{ value: 'imported', label: 'Imported' }
	];
</script>

<PageShell eyebrow="HR" title="Attendance Management" description="View weekly attendance summaries and daily records.">
	{#if data.view === 'detail'}
		<!-- ─── DETAIL VIEW ──────────────────────────────────────────────────── -->
		<div class="space-y-4">
			<div class="flex items-center gap-4">
				<a
					href={buildSummaryUrl()}
					class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
				>
					← Back
				</a>
				<div>
					<h2 class="text-base font-semibold text-slate-900">
						{data.employeeName ?? data.personId}
					</h2>
					<p class="text-sm text-slate-500">
						Week {data.weekStart} – {data.weekEnd}
					</p>
				</div>
			</div>

			<div class="theme-card overflow-x-auto">
				{#if data.records.length === 0}
					<p class="py-10 text-center text-sm text-slate-400">
						No attendance records found for this employee and week.
					</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th class="px-4 py-3">Date</th>
								<th class="px-4 py-3">Check In</th>
								<th class="px-4 py-3">Check Out</th>
								<th class="px-4 py-3">Worked</th>
								<th class="px-4 py-3">Late</th>
								<th class="px-4 py-3">Early Leave</th>
								<th class="px-4 py-3">OT</th>
								<th class="px-4 py-3">Status</th>
								<th class="px-4 py-3">Source</th>
								<th class="px-4 py-3">Payroll</th>
								<th class="px-4 py-3">Notes</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-50">
							{#each data.records as rec (rec.id)}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 font-mono text-xs text-slate-700">{rec.workDate}</td>
									<td class="px-4 py-3 font-mono text-xs">{rec.checkInTime ?? '—'}</td>
									<td class="px-4 py-3 font-mono text-xs">{rec.checkOutTime ?? '—'}</td>
									<td class="px-4 py-3 tabular-nums">{fmtWorkedHours(rec.workedMinutes)}</td>
									<td class="px-4 py-3 tabular-nums text-amber-700"
										>{rec.lateMinutes > 0 ? `${rec.lateMinutes}m` : '—'}</td
									>
									<td class="px-4 py-3 tabular-nums text-slate-600"
										>{rec.earlyLeaveMinutes > 0 ? `${rec.earlyLeaveMinutes}m` : '—'}</td
									>
									<td class="px-4 py-3 tabular-nums text-blue-700"
										>{rec.overtimeMinutes > 0 ? `${rec.overtimeMinutes}m` : '—'}</td
									>
									<td class="px-4 py-3">
										<span
											class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(rec.status)}`}
										>
											{statusLabel(rec.status)}
										</span>
									</td>
									<td class="px-4 py-3">
										<span
											class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sourceBadgeClass(rec.source)}`}
										>
											{rec.source}
										</span>
									</td>
									<td class="px-4 py-3">
										<span
											class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${payrollEffectBadgeClass(rec.payrollEffect)}`}
										>
											{payrollEffectLabel(rec.payrollEffect)}
										</span>
									</td>
									<td class="max-w-[12rem] truncate px-4 py-3 text-xs text-slate-500"
										>{rec.notes ?? '—'}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		</div>
	{:else}
		<!-- ─── SUMMARY VIEW ─────────────────────────────────────────────────── -->
		<div class="space-y-4">
			<!-- Filter form -->
			<form method="GET" class="theme-card flex flex-wrap items-end gap-3 p-4">
				<input type="hidden" name="view" value="summary" />

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

				<div class="flex flex-col gap-1">
					<label for="status" class="text-xs font-medium text-slate-600">Status</label>
					<select
						id="status"
						name="status"
						class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[var(--sf-green)] focus:outline-none"
					>
						{#each STATUS_OPTIONS as opt}
							<option value={opt.value} selected={data.filters.status === opt.value}>
								{opt.label}
							</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label for="source" class="text-xs font-medium text-slate-600">Source</label>
					<select
						id="source"
						name="source"
						class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-[var(--sf-green)] focus:outline-none"
					>
						{#each SOURCE_OPTIONS as opt}
							<option value={opt.value} selected={data.filters.source === opt.value}>
								{opt.label}
							</option>
						{/each}
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

			<!-- Weekly summary table -->
			<div class="theme-card overflow-x-auto">
				{#if data.weeklySummary.length === 0}
					<p class="py-10 text-center text-sm text-slate-400">
						No attendance records found for the selected period.
					</p>
				{:else}
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<th class="px-4 py-3">Employee</th>
								<th class="px-4 py-3">Week</th>
								<th class="px-4 py-3 text-right">Total</th>
								<th class="px-4 py-3 text-right">Present</th>
								<th class="px-4 py-3 text-right">Late</th>
								<th class="px-4 py-3 text-right">Absent</th>
								<th class="px-4 py-3 text-right">On Leave</th>
								<th class="px-4 py-3 text-right">Missing</th>
								<th class="px-4 py-3 text-right">Worked</th>
								<th class="px-4 py-3 text-right">OT</th>
								<th class="px-4 py-3 text-right">Review</th>
								<th class="px-4 py-3"></th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-50">
							{#each data.weeklySummary as row (row.personId + '::' + row.weekStart)}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 font-medium text-slate-900">{row.employeeName}</td>
									<td class="px-4 py-3 font-mono text-xs text-slate-600"
										>{fmtDate(row.weekStart)} – {fmtDate(row.weekEnd)}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-slate-700"
										>{row.totalRecords}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-green-700"
										>{row.presentCount || '—'}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-yellow-700"
										>{row.lateCount || '—'}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-red-700"
										>{row.absentCount || '—'}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-blue-700"
										>{row.onLeaveCount || '—'}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-amber-700"
										>{row.missingCheckoutCount || '—'}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-slate-700"
										>{fmtWorkedHours(row.totalWorkedMinutes)}</td
									>
									<td class="px-4 py-3 text-right tabular-nums text-blue-600"
										>{row.totalOvertimeMinutes > 0
											? fmtMins(row.totalOvertimeMinutes)
											: '—'}</td
									>
									<td class="px-4 py-3 text-right tabular-nums">
										{#if row.payrollReviewCount > 0}
											<span class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
												{row.payrollReviewCount}
											</span>
										{:else}
											<span class="text-slate-300">—</span>
										{/if}
									</td>
									<td class="px-4 py-3">
										<a
											href={buildDetailUrl(row.personId, row.weekStart, row.weekEnd)}
											class="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
										>
											View Detail
										</a>
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
