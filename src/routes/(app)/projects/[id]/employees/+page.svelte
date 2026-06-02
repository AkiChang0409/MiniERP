<script lang="ts">
	import { goto } from '$app/navigation';

	let { data, form } = $props();

	const base = $derived(`/projects/${data.project.id}`);
	const selfPath = $derived(`${base}/employees`);
	const monthHref = (ym: string) => `${selfPath}?month=${encodeURIComponent(ym)}`;

	let openCards = $state<Record<string, boolean>>({});

	$effect(() => {
		if (data.teamMembers.length === 0) return;
		const first = data.teamMembers[0].peId;
		if (openCards[first] === undefined) {
			openCards = { ...openCards, [first]: true };
		}
	});

	function toggleCard(peId: string) {
		openCards = { ...openCards, [peId]: !openCards[peId] };
	}

	const money = (value: number | null | undefined) =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value ?? 0);

	function fmtPeriod(period: string): string {
		if (period.length >= 7) {
			const d = new Date(`${period.slice(0, 7)}-01`);
			if (!Number.isNaN(d.getTime())) {
				return d.toLocaleString('en-SG', { month: 'short', year: 'numeric' });
			}
		}
		return period;
	}

	function staffTypeLabel(t: string): string {
		const m: Record<string, string> = {
			fulltime: 'Full-time',
			parttime: 'Part-time',
			freelancer: 'Freelancer',
			director: 'Director'
		};
		return m[t] ?? t;
	}

	function staffTypeBadgeClass(t: string): string {
		if (t === 'freelancer') return 'bg-[#FAEEDA] text-[#633806]';
		return 'bg-[#EEEDFE] text-[#3C3489]';
	}

	function avatarStyle(hue: number): string {
		const styles = [
			'background:#E6F1FB;color:#0C447C',
			'background:#E1F5EE;color:#085041',
			'background:#FAEEDA;color:#633806',
			'background:#EEEDFE;color:#3C3489'
		];
		return styles[hue % styles.length] ?? styles[0];
	}

	function freqLabel(f: string): string {
		return f.replace(/_/g, ' ');
	}

	type RowStatus = 'paid' | 'confirmed' | 'draft' | 'pending' | 'off';

	function statusBadge(rowStatus: RowStatus) {
		if (rowStatus === 'paid')
			return { class: 'bg-emerald-50 text-emerald-800', text: 'Paid' };
		if (rowStatus === 'confirmed')
			return { class: 'bg-sky-50 text-sky-900', text: 'Confirmed' };
		if (rowStatus === 'draft')
			return { class: 'bg-amber-50 text-amber-900', text: 'Draft' };
		if (rowStatus === 'pending')
			return { class: 'bg-stone-100 text-stone-600', text: 'Pending' };
		return { class: 'bg-slate-100 text-slate-400', text: '-' };
	}

	function payoutStatusBadge(status: string) {
		if (status === 'paid') return { class: 'bg-emerald-50 text-emerald-800', text: 'Paid' };
		if (status === 'confirmed') return { class: 'bg-sky-50 text-sky-900', text: 'Confirmed' };
		if (status === 'draft') return { class: 'bg-amber-50 text-amber-900', text: 'Draft' };
		return { class: 'bg-slate-100 text-slate-600', text: status };
	}

	function scrollToAdd() {
		document.getElementById('add-member-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="space-y-5 pb-8">
	{#if form?.message}
		<p
			class="rounded-lg border px-3 py-2 text-sm {form.ok
				? 'border-emerald-200 bg-emerald-50 text-emerald-800'
				: 'border-rose-200 bg-rose-50 text-rose-700'}"
		>
			{form.message}
		</p>
	{/if}

	<!-- Header -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-xl font-semibold text-slate-900">Team &amp; Cost</h1>
			<p class="mt-1 text-sm text-slate-500">
				Staff cost breakdown &amp; settlement for {data.project.name}.
			</p>
		</div>
		<button
			type="button"
			class="inline-flex shrink-0 items-center justify-center rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
			onclick={scrollToAdd}
		>
			+ Add member
		</button>
	</div>

	<!-- Stat cards -->
	<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
		<div class="rounded-xl bg-slate-50 px-4 py-3.5">
			<p class="text-xs text-slate-500">Total staff cost</p>
			<p class="mt-1 text-[22px] font-medium text-slate-900">{money(data.summaryStats.totalStaffCost)}</p>
			<p class="mt-0.5 text-[11px] text-slate-500">
				{data.summaryStats.memberCount} member{data.summaryStats.memberCount === 1 ? '' : 's'} · confirmed + paid
			</p>
		</div>
		<div class="rounded-xl bg-slate-50 px-4 py-3.5">
			<p class="text-xs text-slate-500">Settled this month</p>
			<p class="mt-1 text-[22px] font-medium text-slate-900">{money(data.summaryStats.settledThisMonth)}</p>
			<p class="mt-0.5 text-[11px] text-slate-500">{data.monthLabel}</p>
		</div>
		<div class="rounded-xl bg-slate-50 px-4 py-3.5">
			<p class="text-xs text-slate-500">Pending settlement</p>
			<p class="mt-1 text-[22px] font-medium text-amber-800">{money(data.summaryStats.pendingSettlementAmount)}</p>
			<p class="mt-0.5 text-[11px] text-slate-500">{data.summaryStats.pendingSettlementLabel}</p>
		</div>
		<div class="rounded-xl bg-slate-50 px-4 py-3.5">
			<p class="text-xs text-slate-500">% of project cost</p>
			<p class="mt-1 text-[22px] font-medium text-slate-900">{data.summaryStats.staffPctOfTotalCost}%</p>
			<p class="mt-0.5 text-[11px] text-slate-500">Staff / total cost</p>
		</div>
	</div>

	<!-- Toolbar -->
	<div class="flex flex-wrap items-center gap-2">
		<div class="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
			<a class="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50" href={monthHref(data.prevMonthYm)}>-</a>
			<input
				type="month"
				class="rounded border-0 bg-transparent px-2 py-1 text-sm text-slate-800 focus:ring-0"
				value={data.selectedMonthYm}
				onchange={(e) => {
					const v = (e.currentTarget as HTMLInputElement).value;
					if (v) void goto(monthHref(v), { replaceState: true });
				}}
			/>
			<a class="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-50" href={monthHref(data.nextMonthYm)}>-</a>
		</div>
		<form method="POST" action="?/settleAllForMonth" class="inline-flex items-center gap-2">
			<input type="hidden" name="monthYm" value={data.selectedMonthYm} />
			<button
				type="submit"
				class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
			>
				Settle all · {data.monthLabel}
			</button>
		</form>
	</div>

	<!-- Employee cards -->
	<div class="space-y-3">
		{#if data.teamMembers.length === 0}
			<p class="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-500">
				No employees on this project yet. Use Add member below.
			</p>
		{:else}
			{#each data.teamMembers as m (m.peId)}
				{@const open = !!openCards[m.peId]}
				<div
					class="overflow-hidden rounded-xl border bg-white shadow-sm {m.hasPendingSettlement
						? 'border-amber-200/90'
						: 'border-slate-200'}"
				>
					<button
						type="button"
						class="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/90"
						onclick={() => toggleCard(m.peId)}
					>
						<div
							class="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-medium"
							style={avatarStyle(m.avatarHue)}
						>
							{m.initials}
						</div>
						<div class="min-w-0 flex-1">
							<div class="text-sm font-medium text-slate-900">{m.name}</div>
							<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
								<span class={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${staffTypeBadgeClass(m.staffType)}`}>
									{staffTypeLabel(m.staffType)}
								</span>
								<span class="text-slate-400">Allocation</span>
								<span class="inline-flex h-1 w-[60px] max-w-[60px] overflow-hidden rounded-full bg-slate-200 align-middle">
									<span
										class="h-full rounded-full bg-[var(--sf-green)]"
										style={`width:${Math.min(100, m.allocationPct)}%`}
									></span>
								</span>
								<span class="text-slate-600">{m.allocationPct}%</span>
								{#if m.hasPendingSettlement}
									<span class="text-amber-700">· Pending settlement</span>
								{/if}
							</div>
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<div class="text-right">
								<div class="text-[15px] font-medium {m.hasPendingSettlement ? 'text-amber-800' : 'text-slate-900'}">
									{money(m.hasPendingSettlement ? m.totalWithDraft : m.totalSettled)}
								</div>
								<div class="text-[11px] text-slate-500">
									{m.hasPendingSettlement ? 'incl. draft / pending' : 'total settled'}
								</div>
							</div>
							<svg
								class="h-4 w-4 shrink-0 text-slate-400 transition-transform {open ? 'rotate-90' : ''}"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								aria-hidden="true"
							>
								<path d="M6 4l4 4-4 4" />
							</svg>
						</div>
					</button>

					{#if open}
						<div class="border-t border-slate-100 px-4 pb-4">
							<p class="mb-2 mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">
								Compensation components
							</p>
							<div
								class="grid grid-cols-[1fr_5.5rem_4.5rem_5.5rem_5rem] gap-2 px-2 py-1 text-[11px] text-slate-500 max-md:hidden"
							>
								<span>Component</span>
<span class="text-right">Amount</span>
								<span class="text-center">Taxable</span>
								<span class="text-right">Period</span>
								<span class="text-right">Status</span>
							</div>
							{#if m.components.length === 0}
								<p class="py-3 text-sm text-slate-400">No project-level components. Open detail to add.</p>
							{:else}
								<div class="space-y-0.5">
									{#each m.components as c (c.id)}
										{@const b = statusBadge(c.rowStatus as RowStatus)}
										<div
											class="grid max-md:gap-1 md:grid-cols-[1fr_5.5rem_4.5rem_5.5rem_5rem] md:items-center md:gap-2 rounded-lg px-2 py-2 text-[13px] hover:bg-slate-50 {c.rowStatus === 'pending' || c.rowStatus === 'draft'
												? 'opacity-[0.85]'
												: ''}"
										>
											<span class="font-medium text-slate-800">{c.label}</span>
											<span class="text-right font-medium max-md:text-left">{money(c.amount)}</span>
											<span class="text-center text-xs max-md:hidden {c.taxable ? 'text-emerald-700' : 'text-slate-500'}">
												{c.taxable ? 'Yes' : 'No'}
											</span>
											<span class="text-right text-xs text-slate-600 max-md:hidden">{freqLabel(c.frequency)}</span>
											<div class="text-right max-md:col-span-full max-md:text-left">
												<span class={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${b.class}`}>{b.text}</span>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							<hr class="my-3 border-slate-100" />

							<p class="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Settle month</p>
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-sm text-slate-600">Use detail page for full controls:</span>
								<a
									class="rounded-lg border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-white"
									href="{base}/employees/{m.peId}?month={encodeURIComponent(data.selectedMonthYm)}"
								>
									Open {m.name.split(' ')[0] ?? 'member'} �?settlement
								</a>
								<a
									class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
									href="{base}/employees/{m.peId}"
								>
									+ Add component
								</a>
							</div>

							<hr class="my-3 border-slate-100" />

							<p class="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Payout history</p>
							{#if m.recentPayouts.length === 0}
								<p class="text-sm text-slate-400">No payouts yet.</p>
							{:else}
								<div
									class="mb-2 grid grid-cols-[5.5rem_1fr_6rem_5.5rem_4.5rem] gap-2 px-2 py-1 text-[11px] text-slate-500 max-md:hidden"
								>
									<span>Period</span>
									<span>Component</span>
									<span class="text-right">Amount</span>
									<span class="text-right">Taxable amt</span>
									<span class="text-right">Status</span>
								</div>
								<div class="space-y-0.5">
									{#each m.recentPayouts as p}
										{@const pb = payoutStatusBadge(p.status)}
										<div
											class="grid max-md:gap-1 md:grid-cols-[5.5rem_1fr_6rem_5.5rem_4.5rem] md:items-center md:gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-slate-50"
										>
											<span class="text-slate-500 max-md:text-xs">{fmtPeriod(p.period)}</span>
											<span class="text-slate-800">{p.label}</span>
											<span class="text-right font-medium max-md:text-left">{money(p.amount)}</span>
											<span class="text-right text-slate-500 max-md:hidden">{money(p.taxableAmount)}</span>
											<div class="text-right max-md:col-span-full max-md:text-left">
												<span class={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${pb.class}`}>{pb.text}</span>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							<div
								class="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 sm:grid-cols-4"
							>
								<div class="text-center">
									<p class="text-[11px] text-slate-500">Total computed</p>
									<p class="mt-0.5 text-sm font-medium">{money(m.summary.computedTotal)}</p>
								</div>
								<div class="text-center">
									<p class="text-[11px] text-slate-500">Total taxable</p>
									<p class="mt-0.5 text-sm font-medium">{money(m.summary.taxableTotal)}</p>
								</div>
								<div class="text-center">
									<p class="text-[11px] text-slate-500">Reimbursement</p>
									<p class="mt-0.5 text-sm font-medium">{money(m.summary.reimbursementTotal)}</p>
								</div>
								<div class="text-center">
									<p class="text-[11px] text-slate-500">Dividend</p>
									<p class="mt-0.5 text-sm font-medium text-slate-400">Excluded</p>
								</div>
							</div>

							<div class="mt-3 flex flex-wrap gap-2 border-t border-slate-50 pt-3">
								<form method="POST" action="?/removeFromProject" class="inline">
									<input type="hidden" name="peId" value={m.peId} />
									<button
										type="submit"
										class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800 hover:bg-rose-100"
									>
										Remove from project
									</button>
								</form>
								<a class="text-xs font-medium text-[var(--sf-green)] hover:underline" href="/hr/employees/{m.employeeId}"
									>Employee master</a
								>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<!-- Add member -->
	<section id="add-member-panel" class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
		<div class="border-b border-slate-200 px-4 py-4">
			<h2 class="text-[13px] font-medium text-slate-900">Add from employee directory</h2>
			<p class="mt-0.5 text-xs text-slate-500">
				Creates a project assignment; company-level pay and allocation stay under the employee master record.
			</p>
		</div>
		{#if data.assignableEmployees.length === 0}
			<p class="px-4 py-8 text-center text-sm text-slate-500">Every active employee is already on this project.</p>
		{:else}
			<form class="space-y-4 px-4 py-5" method="POST" action="?/addToProject">
				<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
					<label class="space-y-1 text-sm md:col-span-2">
						<span class="text-slate-700">Employee</span>
						<select name="employeeId" required class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="" disabled selected>Select</option>
							{#each data.assignableEmployees as e}
								<option value={e.id}>{e.name} ({e.type})</option>
							{/each}
						</select>
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-slate-700">Staff type</span>
						<select name="staffType" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
							<option value="fulltime">fulltime</option>
							<option value="parttime">parttime</option>
							<option value="freelancer">freelancer</option>
							<option value="director">director</option>
						</select>
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-slate-700">Date in</span>
						<input type="date" name="dateIn" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</label>
					<label class="space-y-1 text-sm">
						<span class="text-slate-700">Date out</span>
						<input type="date" name="dateOut" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</label>
					<label class="space-y-1 text-sm md:col-span-2">
						<span class="text-slate-700">Role (optional)</span>
						<input name="role" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
					</label>
				</div>
				<button
					class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]"
					type="submit"
				>
					Add to project
				</button>
			</form>
		{/if}
	</section>
</div>


