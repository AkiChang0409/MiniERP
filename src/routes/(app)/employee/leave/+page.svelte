<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	let submitError = $state<string | null>(null);
	let submitSuccess = $state<string | null>(null);

	// Submit form fields
	let leaveTypeId = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let reason = $state('');

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

	function remainingDaysClass(days: number) {
		if (days < 0) return 'text-red-600';
		if (days === 0) return 'text-slate-400';
		return 'text-green-700';
	}

	function payrollLabel(effect: string) {
		switch (effect) {
			case 'pending_export':
				return 'Affects payroll (pending)';
			case 'exported':
				return 'Exported to payroll';
			default:
				return '—';
		}
	}

	function fmtDate(d: string | null | undefined) {
		return d ? d.slice(0, 10) : '--';
	}
</script>

<PageShell
	eyebrow="Employee"
	title="My Leave"
	description="View your leave balances, submit a new request, and track its status."
>
	{#if data.linkState === 'unlinked'}
		<div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-800">
			<p class="font-medium">Account is not linked to an employee profile</p>
			<p class="mt-1 text-amber-700">
				The signed-in account
				<span class="font-mono font-semibold">{data.userEmail ?? '(not signed in)'}</span>
				is not linked to an employee profile. Make sure you are using the account registered with an HR employee invite code. To link this account, create an employee-bound invite in
				<a href="/settings/invites" class="underline">Settings → Invite Codes</a>
				and register with that invite.
			</p>
			<p class="mt-1 text-amber-700">
				Logged in as <span class="font-mono font-semibold">{data.userEmail ?? '(none)'}</span> —
				this account is not linked to an employee profile.
			</p>
		</div>
	{:else if data.linkState === 'inactive'}
		<div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-800">
			<p class="font-medium">Account is inactive</p>
			<p class="mt-1 text-amber-700">
				The employee profile linked to <span class="font-mono font-semibold">{data.userEmail ?? ''}</span>
				is not active. Contact HR before submitting leave.
			</p>
		</div>
	{:else}
		<!-- ===== MY LEAVE BALANCES ===== -->
		<section class="space-y-3">
			<h2 class="text-sm font-semibold text-slate-700">
				My Leave Balances · {data.year}
			</h2>
			{#if data.balances.length === 0}
				<div
					class="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-sm"
				>
					No leave balances available.
				</div>
			{:else}
				<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
					<table class="min-w-full text-sm">
						<thead class="bg-slate-50 text-left text-slate-600">
							<tr>
								<th class="px-4 py-3 font-medium">Leave Type</th>
								<th class="px-4 py-3 text-right font-medium">Entitled</th>
								<th class="px-4 py-3 text-right font-medium">Used</th>
								<th class="px-4 py-3 text-right font-medium text-amber-700">Pending</th>
								<th class="px-4 py-3 text-right font-medium">Remaining</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#each data.balances as bal (bal.id)}
								<tr class="hover:bg-slate-50/60">
									<td class="px-4 py-2.5 text-slate-700">
										<span
											class="mr-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
										>
											{bal.leaveTypeCode}
										</span>
										{bal.leaveTypeName}
									</td>
									<td class="px-4 py-2.5 text-right tabular-nums text-slate-700">{bal.entitledDays}</td>
									<td class="px-4 py-2.5 text-right tabular-nums text-slate-600">{bal.usedDays}</td>
									<td class="px-4 py-2.5 text-right tabular-nums text-amber-700">{bal.pendingDays}</td>
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
			{/if}
		</section>

		<!-- ===== SUBMIT LEAVE REQUEST ===== -->
		<section class="space-y-3">
			<h2 class="text-sm font-semibold text-slate-700">Submit a Leave Request</h2>

			{#if submitSuccess}
				<div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
					{submitSuccess}
				</div>
			{/if}
			{#if submitError}
				<div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{submitError}
				</div>
			{/if}

			<form
				method="POST"
				action="?/submit"
				class="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'failure') {
							submitError = (result.data as { message?: string })?.message ?? 'Submit failed';
							submitSuccess = null;
						} else if (result.type === 'success') {
							submitError = null;
							submitSuccess = `Leave request submitted (${(result.data as { totalDays?: number })?.totalDays ?? ''} day(s), pending approval).`;
							leaveTypeId = '';
							startDate = '';
							endDate = '';
							reason = '';
						}
						await update({ reset: false });
					};
				}}
			>
				<label class="space-y-1 text-sm">
					<span class="font-medium text-slate-700">Leave Type</span>
					<select
						name="leaveTypeId"
						bind:value={leaveTypeId}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
					>
						<option value="" disabled>Choose a leave type…</option>
						{#each data.leaveTypes as lt (lt.id)}
							<option value={lt.id}>{lt.name}</option>
						{/each}
					</select>
				</label>

				<div class="hidden md:block"></div>

				<label class="space-y-1 text-sm">
					<span class="font-medium text-slate-700">Start Date</span>
					<input
						type="date"
						name="startDate"
						bind:value={startDate}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
					/>
				</label>

				<label class="space-y-1 text-sm">
					<span class="font-medium text-slate-700">End Date</span>
					<input
						type="date"
						name="endDate"
						bind:value={endDate}
						required
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
					/>
				</label>

				<label class="space-y-1 text-sm md:col-span-2">
					<span class="font-medium text-slate-700">Reason</span>
					<textarea
						name="reason"
						bind:value={reason}
						rows="2"
						placeholder="Optional — brief reason for your leave"
						class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
					></textarea>
				</label>

				<div class="md:col-span-2">
					<button
						type="submit"
						class="rounded-md bg-[var(--sf-green)] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
					>
						Submit Request
					</button>
				</div>
			</form>
		</section>

		<!-- ===== MY LEAVE REQUESTS ===== -->
		<section class="space-y-3">
			<h2 class="text-sm font-semibold text-slate-700">My Leave Requests</h2>
			<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
				<table class="min-w-full divide-y divide-slate-200 text-sm">
					<thead class="bg-slate-50 text-left text-slate-600">
						<tr>
							<th class="px-4 py-3 font-medium">Leave Type</th>
							<th class="px-4 py-3 font-medium">Start</th>
							<th class="px-4 py-3 font-medium">End</th>
							<th class="px-4 py-3 font-medium">Days</th>
							<th class="px-4 py-3 font-medium">Status</th>
							<th class="px-4 py-3 font-medium">Reason</th>
							<th class="px-4 py-3 font-medium">Rejection Reason</th>
							<th class="px-4 py-3 font-medium">Payroll</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#if data.requests.length === 0}
							<tr>
								<td class="px-4 py-8 text-center text-slate-400" colspan="8">
									You have no leave requests yet.
								</td>
							</tr>
						{:else}
							{#each data.requests as req (req.id)}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 text-slate-700">
										<span
											class="mr-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
										>
											{req.leaveTypeCode}
										</span>
										{req.leaveTypeName}
									</td>
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
									<td class="max-w-[160px] px-4 py-3 text-slate-500">
										<span class="line-clamp-2">{req.rejectionReason ?? '--'}</span>
									</td>
									<td class="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
										{payrollLabel(req.payrollEffect)}
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</PageShell>
