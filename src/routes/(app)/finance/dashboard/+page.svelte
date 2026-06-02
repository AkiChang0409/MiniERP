<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { onMount } from 'svelte';
	let { data } = $props();

	const money = (value: number) =>
		new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(value ?? 0);

	const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

	const pctChange = (current: number, delta: number) => {
		const prev = current - delta;
		if (prev === 0) return delta > 0 ? '+100%' : delta < 0 ? '-100%' : '0%';
		const change = (delta / Math.abs(prev)) * 100;
		return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
	};

	type ApiResult<T> = { ok: boolean; data: T; error?: string };
	type OverviewData = {
		revenue: number;
		expense: number;
		netProfit: number;
		pendingReceivable: number;
		pendingPayable: number;
		range: { start: string; end: string };
		previousRange: { start: string; end: string };
		trend: { revenueDelta: number; expenseDelta: number; netProfitDelta: number };
		details: {
			revenueItems: Array<{ id: string; date: string; ref: string; note: string; amount: number }>;
			expenseItems: Array<{
				id: string;
				source: string;
				date: string;
				ref: string;
				note: string;
				amount: number;
			}>;
		};
	};
	type RankingRow = {
		projectId: string;
		projectName: string;
		projectStatus: string;
		revenue: number;
		cost: number;
		profit: number;
		profitMargin: number;
	};
	type ChartsData = {
		pie: { supplierCost: number; staffCost: number; expenseCost: number };
		quarterly: Array<{ label: string; revenue: number; expense: number }>;
		projectBars: Array<{ projectId: string; projectName: string; revenue: number; expense: number }>;
	};
	type PnlData = {
		range: { start: string; end: string };
		revenue: {
			standardRated: number;
			zeroRated: number;
			exempt: number;
			outOfScope: number;
			total: number;
		};
		costOfSales: {
			byCategory: Array<{ category: string; total: number }>;
			staffCost: number;
			total: number;
		};
		grossProfit: number;
		grossMargin: number;
		operatingExpenses: {
			byCategory: Array<{ category: string; total: number }>;
			total: number;
		};
		netProfit: number;
		netMargin: number;
	};
	type TrialBalanceData = {
		range: { start: string; end: string };
		accounts: Array<{
			account: string;
			type: 'revenue' | 'expense';
			subType: string;
			debit: number;
			credit: number;
			count: number;
		}>;
		totalDebit: number;
		totalCredit: number;
		difference: number;
	};

	const emptyOverview: OverviewData = {
		revenue: 0,
		expense: 0,
		netProfit: 0,
		pendingReceivable: 0,
		pendingPayable: 0,
		range: { start: '', end: '' },
		previousRange: { start: '', end: '' },
		trend: { revenueDelta: 0, expenseDelta: 0, netProfitDelta: 0 },
		details: { revenueItems: [], expenseItems: [] }
	};
	const emptyCharts: ChartsData = {
		pie: { supplierCost: 0, staffCost: 0, expenseCost: 0 },
		quarterly: [],
		projectBars: []
	};
	const emptyPnl: PnlData = {
		range: { start: '', end: '' },
		revenue: { standardRated: 0, zeroRated: 0, exempt: 0, outOfScope: 0, total: 0 },
		costOfSales: { byCategory: [], staffCost: 0, total: 0 },
		grossProfit: 0,
		grossMargin: 0,
		operatingExpenses: { byCategory: [], total: 0 },
		netProfit: 0,
		netMargin: 0
	};
	const emptyTrialBalance: TrialBalanceData = {
		range: { start: '', end: '' },
		accounts: [],
		totalDebit: 0,
		totalCredit: 0,
		difference: 0
	};

	let overview = $state<OverviewData>(emptyOverview);
	let projectRanking = $state<RankingRow[]>([]);
	let charts = $state<ChartsData>(emptyCharts);
	let pnl = $state<PnlData>(emptyPnl);
	let trialBalance = $state<TrialBalanceData>(emptyTrialBalance);
	let loading = $state(true);
	let loadError = $state('');

	type MetricCardId = 'revenue' | 'expense' | 'netProfit' | 'receivablesPayables';
	type DetailRow = { date: string; source: string; ref: string; note: string; amount: number };
	let selectedCard = $state<MetricCardId | null>(null);
	let lastFilterKey = $state('');
	let initialized = $state(false);
	let activePieIndex = $state<number | null>(null);

	type DashboardTab = 'overview' | 'pnl' | 'trialBalance';
	let activeTab = $state<DashboardTab>('overview');

	const filterKey = $derived(`${data.filters.status}|${data.filters.from}|${data.filters.to}`);

	const metricCards = $derived([
		{
			id: 'revenue' as const,
			label: 'Total Revenue',
			value: money(overview.revenue),
			delta: overview.trend.revenueDelta,
			pctDelta: pctChange(overview.revenue, overview.trend.revenueDelta),
			tooltip:
				'Total sales recognized in the selected period from all customer invoices (including tax amount).'
		},
		{
			id: 'expense' as const,
			label: 'Total Expense',
			value: money(overview.expense),
			delta: overview.trend.expenseDelta,
			pctDelta: pctChange(overview.expense, overview.trend.expenseDelta),
			tooltip:
				'Total project-related costs in the selected period, including supplier invoices, staff costs, and operating expenses.'
		},
		{
			id: 'netProfit' as const,
			label: 'Net Profit',
			value: money(overview.netProfit),
			delta: overview.trend.netProfitDelta,
			pctDelta: pctChange(overview.netProfit, overview.trend.netProfitDelta),
			tooltip: 'Net result for the selected period: Total Revenue minus Total Expense.'
		},
		{
			id: 'receivablesPayables' as const,
			label: 'Gross Margin',
			value: pnl.revenue.total > 0 ? pct(pnl.grossMargin) : '--',
			delta: 0,
			pctDelta: '',
			tooltip: 'Gross profit as a percentage of total revenue. Gross Profit = Revenue − Cost of Sales.'
		}
	]);

	const trendClass = (value: number) => (value >= 0 ? 'text-emerald-700' : 'text-rose-700');
	const trendBg = (value: number) => (value >= 0 ? 'bg-emerald-50' : 'bg-rose-50');

	const pieSegments = $derived.by(() => {
		const segments = [
			{ label: 'Supplier Cost', value: charts.pie.supplierCost, color: '#387234' },
			{ label: 'Staff Cost', value: charts.pie.staffCost, color: '#eabc3c' },
			{ label: 'Operating Expense', value: charts.pie.expenseCost, color: '#7ca977' }
		];
		const total = segments.reduce((sum, item) => sum + item.value, 0);
		let offset = 0;
		return {
			total,
			segments: segments.map((item) => {
				const share = total > 0 ? item.value / total : 0;
				const start = offset;
				offset += share;
				return { ...item, share, start };
			})
		};
	});

	function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
		const angle = ((angleDeg - 90) * Math.PI) / 180;
		return {
			x: cx + radius * Math.cos(angle),
			y: cy + radius * Math.sin(angle)
		};
	}

	function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
		const start = polarToCartesian(cx, cy, radius, endAngle);
		const end = polarToCartesian(cx, cy, radius, startAngle);
		const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
		return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
	}

	const pieArcs = $derived.by(() => {
		const cx = 120;
		const cy = 120;
		const radius = 100;
		return pieSegments.segments.map((item, index) => {
			const startAngle = item.start * 360;
			const endAngle = (item.start + item.share) * 360;
			const midAngle = (startAngle + endAngle) / 2;
			const push = activePieIndex === index ? 10 : 0;
			const rad = ((midAngle - 90) * Math.PI) / 180;
			const tx = Math.cos(rad) * push;
			const ty = Math.sin(rad) * push;
			return {
				...item,
				path: describeArc(cx, cy, radius, startAngle, endAngle),
				tx,
				ty,
				scale: activePieIndex === index ? 1.06 : 1
			};
		});
	});

	const pieDetail = $derived.by(() => {
		if (activePieIndex === null) return null;
		const item = pieSegments.segments[activePieIndex];
		if (!item) return null;
		return {
			label: item.label,
			value: item.value,
			share: item.share
		};
	});

	const quarterlySeries = $derived(charts.quarterly);
	const lineChart = $derived.by(() => {
		const points = quarterlySeries;
		if (points.length === 0) {
			return { revenuePath: '', expensePath: '', maxY: 1 };
		}
		const maxY = Math.max(1, ...points.map((item) => Math.max(item.revenue, item.expense)));
		const width = 560;
		const height = 220;
		const padX = 30;
		const padY = 20;
		const spanX = Math.max(1, points.length - 1);
		const toPoint = (value: number, index: number) => {
			const x = padX + ((width - padX * 2) * index) / spanX;
			const y = height - padY - ((height - padY * 2) * value) / maxY;
			return `${x},${y}`;
		};
		const revenuePath = points.map((item, index) => toPoint(item.revenue, index)).join(' ');
		const expensePath = points.map((item, index) => toPoint(item.expense, index)).join(' ');
		return { revenuePath, expensePath, maxY };
	});

	const projectBars = $derived.by(() => {
		const bars = charts.projectBars;
		const maxVal = Math.max(1, ...bars.map((item) => Math.max(item.revenue, item.expense)));
		return bars.map((item) => ({
			...item,
			revenueWidth: `${(item.revenue / maxVal) * 100}%`,
			expenseWidth: `${(item.expense / maxVal) * 100}%`
		}));
	});

	const revenueRows = $derived.by(
		(): DetailRow[] =>
		overview.details.revenueItems.map((item) => ({
				date: item.date || '-',
				source: 'customer_invoice',
				ref: item.ref || item.id,
				note: item.note || '-',
				amount: item.amount
			}))
	);
	const expenseRows = $derived.by(
		(): DetailRow[] =>
			overview.details.expenseItems.map((item) => ({
				date: item.date || '-',
				source: item.source,
				ref: item.ref || item.id,
				note: item.note || '-',
				amount: item.amount
			}))
	);
	const netProfitRows = $derived.by(
		(): DetailRow[] =>
			[
				...revenueRows.map((row) => ({ ...row, source: `+ ${row.source}`, amount: row.amount })),
				...expenseRows.map((row) => ({ ...row, source: `- ${row.source}`, amount: -row.amount }))
			].sort((a, b) => b.date.localeCompare(a.date))
	);

	const recentTransactions = $derived.by(() => {
		const allItems = [
			...overview.details.revenueItems.map((item) => ({
				id: item.id,
				date: item.date || '',
				type: 'revenue' as const,
				ref: item.ref || item.id.slice(0, 8),
				amount: item.amount,
				label: 'Revenue'
			})),
			...overview.details.expenseItems.map((item) => ({
				id: item.id,
				date: item.date || '',
				type: 'expense' as const,
				ref: item.ref || item.id.slice(0, 8),
				amount: item.amount,
				label: item.source === 'staff_cost' ? 'Staff Cost' : item.source === 'supplier_invoice' ? 'Supplier' : 'Expense'
			}))
		];
		return allItems.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
	});

	const detailModal = $derived.by(() => {
		if (!selectedCard) return null;
		if (selectedCard === 'revenue') {
			return {
				title: 'Revenue Details',
				subtitle: 'Records inside current filter range.',
				total: overview.revenue,
				rows: revenueRows,
				empty: 'No revenue details in selected range.'
			};
		}
		if (selectedCard === 'expense') {
			return {
				title: 'Expense Details',
				subtitle: 'Supplier + staff + expense records in current range.',
				total: overview.expense,
				rows: expenseRows,
				empty: 'No expense details in selected range.'
			};
		}
		if (selectedCard === 'netProfit') {
			return {
				title: 'Net Profit Composition',
				subtitle: 'Revenue(+) and expense(-) impacts by date in current range.',
				total: overview.netProfit,
				rows: netProfitRows,
				empty: 'No net profit composition records in selected range.'
			};
		}
		return null;
	});

	async function loadDashboardData() {
		loading = true;
		loadError = '';
		try {
			const overviewQs = new URLSearchParams();
			const rankingQs = new URLSearchParams();
			if (data.filters.status) rankingQs.set('projectStatus', data.filters.status);
			if (data.filters.from) {
				overviewQs.set('from', data.filters.from);
				rankingQs.set('from', data.filters.from);
			}
			if (data.filters.to) {
				overviewQs.set('to', data.filters.to);
				rankingQs.set('to', data.filters.to);
			}

			const [overviewRes, rankingRes, chartsRes, pnlRes, tbRes] = await Promise.all([
				fetch(`/api/finance/dashboard/overview?${overviewQs.toString()}`),
				fetch(`/api/finance/dashboard/projects-profit?${rankingQs.toString()}`),
				fetch(`/api/finance/dashboard/charts?${rankingQs.toString()}`),
				fetch(`/api/finance/dashboard/profit-loss?${overviewQs.toString()}`),
				fetch(`/api/finance/dashboard/trial-balance?${overviewQs.toString()}`)
			]);

			const [overviewJson, rankingJson, chartsJson, pnlJson, tbJson] = (await Promise.all([
				overviewRes.json(),
				rankingRes.json(),
				chartsRes.json(),
				pnlRes.json(),
				tbRes.json()
			])) as [
				ApiResult<OverviewData>,
				ApiResult<RankingRow[]>,
				ApiResult<ChartsData>,
				ApiResult<PnlData>,
				ApiResult<TrialBalanceData>
			];

			overview = overviewJson.ok ? overviewJson.data : emptyOverview;
			projectRanking = rankingJson.ok ? rankingJson.data : [];
			charts = chartsJson.ok ? chartsJson.data : emptyCharts;
			pnl = pnlJson.ok ? pnlJson.data : emptyPnl;
			trialBalance = tbJson.ok ? tbJson.data : emptyTrialBalance;
		} catch {
			loadError = 'Failed to load dashboard data. Please retry.';
			overview = emptyOverview;
			projectRanking = [];
			charts = emptyCharts;
			pnl = emptyPnl;
			trialBalance = emptyTrialBalance;
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		lastFilterKey = filterKey;
		initialized = true;
		await loadDashboardData();
	});

	$effect(() => {
		if (!initialized) return;
		if (filterKey === lastFilterKey) return;
		lastFilterKey = filterKey;
		void loadDashboardData();
	});
</script>

<PageShell
	eyebrow="Dashboard"
	title="SmartFin Console"
	description="Financial overview with P&L, trial balance, and project profitability."
>
	<div class="relative h-1 overflow-hidden rounded-full bg-slate-200">
		{#if loading}
			<div class="progress-indicator h-full w-1/3 rounded-full bg-[var(--sf-green)]"></div>
		{/if}
	</div>

	<form method="GET" class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
		<div class="flex flex-wrap items-end gap-3">
			<label class="text-sm text-slate-600">
				Project Status
				<select
					name="status"
					value={data.filters.status}
					class="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
				>
					<option value="">All</option>
					<option value="active">active</option>
					<option value="on_hold">on_hold</option>
					<option value="completed">completed</option>
					<option value="archived">archived</option>
				</select>
			</label>
			<label class="text-sm text-slate-600">
				From
				<input
					type="date"
					lang="en-GB"
					name="from"
					value={data.filters.from}
					class="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>
			<label class="text-sm text-slate-600">
				To
				<input
					type="date"
					lang="en-GB"
					name="to"
					value={data.filters.to}
					class="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>
			<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm text-white hover:bg-[#2f5e2c]" type="submit">
				Apply
			</button>
			<p class="text-xs text-slate-500">
				Period: {overview.range.start || '--'} to {overview.range.end || '--'}
			</p>
		</div>
	</form>

	{#if loadError}
		<div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
			{loadError}
		</div>
	{/if}

	<!-- KPI Cards with trend percentages -->
	<section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
		{#each metricCards as metric}
			<div class="relative min-h-[118px] rounded-xl border border-slate-200 bg-white shadow-sm">
				<button
					type="button"
					class="h-full min-h-[118px] w-full rounded-xl p-4 pr-9 text-left transition hover:bg-slate-50"
					onclick={() => { if (metric.id !== 'receivablesPayables') selectedCard = metric.id; }}
				>
					<p class="text-sm text-slate-500">{metric.label}</p>
					{#if loading}
						<div class="mt-3 h-8 w-32 animate-pulse rounded bg-slate-200"></div>
					{:else}
						<p class="mt-3 text-2xl font-semibold text-slate-900">{metric.value}</p>
						{#if metric.pctDelta}
							<div class="mt-1.5 flex items-center gap-2">
								<span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${trendBg(metric.id === 'expense' ? -metric.delta : metric.delta)} ${trendClass(metric.id === 'expense' ? -metric.delta : metric.delta)}`}>
									{metric.pctDelta}
								</span>
								<span class="text-xs text-slate-400">vs prev period</span>
							</div>
						{/if}
					{/if}
				</button>
				<button
					type="button"
					class="absolute right-3 top-3 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500"
					aria-label={`Show ${metric.label} calculation logic`}
					title={metric.tooltip}
				>
					i
				</button>
			</div>
		{/each}
	</section>

	<!-- Tab Navigation -->
	<div class="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
		{#each [
			{ id: 'overview' as DashboardTab, label: 'Overview' },
			{ id: 'pnl' as DashboardTab, label: 'Profit & Loss' },
			{ id: 'trialBalance' as DashboardTab, label: 'Trial Balance' }
		] as tab}
			<button
				type="button"
				class={`rounded-md px-4 py-2 text-sm font-medium transition ${
					activeTab === tab.id
						? 'bg-white text-slate-900 shadow-sm'
						: 'text-slate-600 hover:text-slate-900'
				}`}
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<!-- Tab: Overview -->
	{#if activeTab === 'overview'}
		<!-- Period trend cards -->
		<section class="grid gap-4 md:grid-cols-3">
			<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<p class="text-xs text-slate-500">Revenue vs Previous Period</p>
				<p class={`mt-2 text-xl font-semibold ${trendClass(overview.trend.revenueDelta)}`}>
					{money(overview.trend.revenueDelta)}
				</p>
				<p class={`text-xs ${trendClass(overview.trend.revenueDelta)}`}>
					{pctChange(overview.revenue, overview.trend.revenueDelta)}
				</p>
			</article>
			<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<p class="text-xs text-slate-500">Expense vs Previous Period</p>
				<p class={`mt-2 text-xl font-semibold ${trendClass(-overview.trend.expenseDelta)}`}>
					{money(overview.trend.expenseDelta)}
				</p>
				<p class={`text-xs ${trendClass(-overview.trend.expenseDelta)}`}>
					{pctChange(overview.expense, overview.trend.expenseDelta)}
				</p>
			</article>
			<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
				<p class="text-xs text-slate-500">Net Profit vs Previous Period</p>
				<p class={`mt-2 text-xl font-semibold ${trendClass(overview.trend.netProfitDelta)}`}>
					{money(overview.trend.netProfitDelta)}
				</p>
				<p class={`text-xs ${trendClass(overview.trend.netProfitDelta)}`}>
					{pctChange(overview.netProfit, overview.trend.netProfitDelta)}
				</p>
			</article>
		</section>

		<!-- Charts row -->
		<section class="grid gap-4 lg:grid-cols-[0.88fr_1.12fr]">
			<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-h-[280px]">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h2 class="text-sm font-semibold text-slate-800">Cost Structure</h2>
						<p class="text-xs text-slate-500">Expense composition within current filter range.</p>
					</div>
					<span class="rounded-full bg-[var(--sf-green-soft)] px-2 py-1 text-xs font-medium text-[var(--sf-green)]">
						{money(pieSegments.total)}
					</span>
				</div>
				{#if loading}
					<div class="mt-4 h-56 animate-pulse rounded-xl bg-slate-100"></div>
				{:else}
				<div class="mt-4 flex flex-wrap items-start justify-between gap-4 chart-fade-in">
					<div class="pie-wrap pie-pop relative h-64 w-64 rounded-full">
						<svg viewBox="0 0 240 240" class="h-64 w-64">
							{#if pieSegments.total <= 0}
								<circle cx="120" cy="120" r="100" fill="#e2e8f0"></circle>
							{:else}
								{#each pieArcs as arc, idx}
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<path
										d={arc.path}
										fill={arc.color}
										class="pie-slice"
										style={`transform: translate(${arc.tx}px, ${arc.ty}px) scale(${arc.scale}); transform-origin: 120px 120px;`}
										onmouseenter={() => (activePieIndex = idx)}
										onmouseleave={() => (activePieIndex = null)}
									></path>
								{/each}
							{/if}
						</svg>
						<div class="pie-sweep-mask"></div>
					</div>
					<div class="flex min-h-[256px] w-52 flex-col justify-between">
						<div class="space-y-2">
							{#each pieSegments.segments as item, idx}
								<button
									type="button"
									class={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-sm ${
										activePieIndex === idx ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
									}`}
									aria-label={`Highlight ${item.label}`}
									onmouseenter={() => (activePieIndex = idx)}
									onmouseleave={() => (activePieIndex = null)}
								>
									<span class="h-3 w-3 rounded-full" style={`background:${item.color}`}></span>
									<span>{item.label}</span>
								</button>
							{/each}
						</div>
						<div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
							{#if pieDetail}
								<p class="font-medium text-slate-800">{pieDetail.label}</p>
								<p class="mt-1">{money(pieDetail.value)} ({(pieDetail.share * 100).toFixed(1)}%)</p>
							{:else}
								<p class="font-medium text-slate-800">Total Expense</p>
								<p class="mt-1">{money(pieSegments.total)} (100.0%)</p>
							{/if}
						</div>
					</div>
				</div>
				{/if}
			</article>

			<article class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm min-h-[320px]">
				<div>
					<h2 class="text-sm font-semibold text-slate-800">Quarterly Income vs Expense</h2>
					<p class="text-xs text-slate-500">Rolling four-quarter trend ending in current selection.</p>
				</div>
				{#if loading}
					<div class="mt-4 h-56 animate-pulse rounded-xl bg-slate-100"></div>
				{:else if quarterlySeries.length === 0}
					<p class="mt-8 text-center text-sm text-slate-500">No quarterly data yet.</p>
				{:else}
					<svg viewBox="0 0 560 220" class="mt-4 w-full rounded-lg border border-slate-100 bg-slate-50 chart-fade-in">
						<polyline class="line-draw line-revenue" points={lineChart.revenuePath} fill="none" stroke="#387234" stroke-width="3"></polyline>
						<polyline class="line-draw line-expense" points={lineChart.expensePath} fill="none" stroke="#eabc3c" stroke-width="3"></polyline>
					</svg>
					<div class="mt-3 flex flex-wrap items-center gap-4 text-xs">
						<span class="inline-flex items-center gap-1 text-slate-700">
							<span class="h-2 w-2 rounded-full bg-[var(--sf-green)]"></span>Income
						</span>
						<span class="inline-flex items-center gap-1 text-slate-700">
							<span class="h-2 w-2 rounded-full bg-[var(--sf-gold)]"></span>Expense
						</span>
						<div class="flex flex-wrap gap-2 text-slate-500">
							{#each quarterlySeries as item}
								<span class="rounded border border-slate-200 bg-white px-2 py-0.5">{item.label}</span>
							{/each}
						</div>
					</div>
				{/if}
			</article>
		</section>

		<!-- Recent Transactions Feed + Project Bars side by side -->
		<section class="grid gap-4 lg:grid-cols-[1fr_1fr]">
			<!-- Recent Transactions -->
			<article class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
					<h2 class="text-sm font-semibold text-slate-700">Recent Transactions</h2>
					<p class="text-xs text-slate-500">Latest 10 transactions in the selected period.</p>
				</div>
				<div class="divide-y divide-slate-100">
					{#if loading}
						<div class="space-y-2 p-4">
							{#each Array(5) as _}
								<div class="h-10 animate-pulse rounded bg-slate-100"></div>
							{/each}
						</div>
					{:else if recentTransactions.length === 0}
						<p class="px-4 py-8 text-center text-sm text-slate-500">No transactions in selected period.</p>
					{:else}
						{#each recentTransactions as txn}
							<div class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
								<div class="flex items-center gap-3 min-w-0">
									<span class={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
										txn.type === 'revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
									}`}>
										{txn.type === 'revenue' ? '+' : '-'}
									</span>
									<div class="min-w-0">
										<p class="truncate font-medium text-slate-800">{txn.ref}</p>
										<p class="text-xs text-slate-500">{txn.label} &middot; {txn.date || '--'}</p>
									</div>
								</div>
								<span class={`shrink-0 font-semibold tabular-nums ${txn.type === 'revenue' ? 'text-emerald-700' : 'text-slate-700'}`}>
									{txn.type === 'revenue' ? '+' : '-'}{money(txn.amount)}
								</span>
							</div>
						{/each}
					{/if}
				</div>
			</article>

			<!-- Project Income vs Expense (Bar) -->
			<article class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
					<h2 class="text-sm font-semibold text-slate-700">Project Income vs Expense</h2>
				</div>
				<div class="space-y-4 p-4 min-h-[260px]">
					{#if loading}
						<div class="space-y-3">
							<div class="h-12 animate-pulse rounded bg-slate-100"></div>
							<div class="h-12 animate-pulse rounded bg-slate-100"></div>
							<div class="h-12 animate-pulse rounded bg-slate-100"></div>
						</div>
					{:else if projectBars.length === 0}
						<p class="py-8 text-center text-sm text-slate-500">No project comparison data in current filter range.</p>
					{:else}
						{#each projectBars as item}
							<div class="space-y-2 chart-fade-in">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="text-sm font-medium text-slate-800">{item.projectName}</p>
									<p class="text-xs text-slate-500">
										{money(item.revenue)} / {money(item.expense)}
									</p>
								</div>
								<div class="space-y-1">
									<div class="h-2 rounded bg-slate-100">
										<div class="bar-grow h-2 rounded bg-[var(--sf-green)]" style={`width:${loading ? '0%' : item.revenueWidth}`}></div>
									</div>
									<div class="h-2 rounded bg-slate-100">
										<div class="bar-grow h-2 rounded bg-[var(--sf-gold)]" style={`width:${loading ? '0%' : item.expenseWidth}`}></div>
									</div>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</article>
		</section>

		<!-- Project Profit Ranking -->
		<section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			<div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
				<h2 class="text-sm font-semibold text-slate-700">Project Profit Ranking</h2>
			</div>
			<table class="min-w-full divide-y divide-slate-200 text-sm">
				<thead class="bg-white text-left text-slate-600">
					<tr>
						<th class="px-4 py-3">Project</th>
						<th class="px-4 py-3">Status</th>
						<th class="px-4 py-3 text-right">Revenue</th>
						<th class="px-4 py-3 text-right">Cost</th>
						<th class="px-4 py-3 text-right">Profit</th>
						<th class="px-4 py-3 text-right">Margin</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if projectRanking.length === 0}
						<tr>
							<td class="px-4 py-8 text-center text-slate-500" colspan="6">
								No project ranking data yet.
							</td>
						</tr>
					{:else}
						{#each projectRanking as row}
							<tr class="hover:bg-slate-50">
								<td class="px-4 py-3 font-medium text-slate-800">{row.projectName}</td>
								<td class="px-4 py-3">
									<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{row.projectStatus}</span>
								</td>
								<td class="px-4 py-3 text-right tabular-nums">{money(row.revenue)}</td>
								<td class="px-4 py-3 text-right tabular-nums">{money(row.cost)}</td>
								<td class={`px-4 py-3 text-right font-medium tabular-nums ${row.profit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
									{money(row.profit)}
								</td>
								<td class="px-4 py-3 text-right tabular-nums">{(row.profitMargin * 100).toFixed(1)}%</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>
	{/if}

	<!-- Tab: Profit & Loss -->
	{#if activeTab === 'pnl'}
		<section class="space-y-4">
			{#if loading}
				<div class="h-64 animate-pulse rounded-xl bg-slate-100"></div>
			{:else}
				<!-- P&L Summary Cards -->
				<div class="grid gap-4 md:grid-cols-4">
					<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p class="text-xs text-slate-500">Total Revenue</p>
						<p class="mt-2 text-xl font-semibold text-emerald-700">{money(pnl.revenue.total)}</p>
					</div>
					<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p class="text-xs text-slate-500">Cost of Sales</p>
						<p class="mt-2 text-xl font-semibold text-slate-900">{money(pnl.costOfSales.total)}</p>
					</div>
					<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p class="text-xs text-slate-500">Gross Profit</p>
						<p class={`mt-2 text-xl font-semibold ${pnl.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
							{money(pnl.grossProfit)}
						</p>
						<p class="text-xs text-slate-500">Margin: {pct(pnl.grossMargin)}</p>
					</div>
					<div class={`rounded-xl border p-4 shadow-sm ${pnl.netProfit >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
						<p class="text-xs text-slate-500">Net Profit</p>
						<p class={`mt-2 text-xl font-bold ${pnl.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
							{money(pnl.netProfit)}
						</p>
						<p class="text-xs text-slate-500">Margin: {pct(pnl.netMargin)}</p>
					</div>
				</div>

				<!-- P&L Detailed Table -->
				<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
					<table class="min-w-full text-sm">
						<thead class="bg-slate-50 text-left text-slate-600">
							<tr>
								<th class="px-4 py-3 font-medium" colspan="2">Account</th>
								<th class="px-4 py-3 font-medium text-right">Amount (SGD)</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							<!-- Revenue -->
							<tr class="bg-emerald-50/50 font-semibold text-slate-800">
								<td class="px-4 py-2.5" colspan="2">Revenue</td>
								<td class="px-4 py-2.5 text-right tabular-nums">{money(pnl.revenue.total)}</td>
							</tr>
							{#if pnl.revenue.standardRated > 0}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2">Standard Rated (incl. Tax Invoice)</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(pnl.revenue.standardRated)}</td>
								</tr>
							{/if}
							{#if pnl.revenue.zeroRated > 0}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2">Zero Rated</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(pnl.revenue.zeroRated)}</td>
								</tr>
							{/if}
							{#if pnl.revenue.exempt > 0}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2">Exempt</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(pnl.revenue.exempt)}</td>
								</tr>
							{/if}
							{#if pnl.revenue.outOfScope > 0}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2">Out-of-Scope</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(pnl.revenue.outOfScope)}</td>
								</tr>
							{/if}

							<!-- Cost of Sales -->
							<tr class="bg-slate-50 font-semibold text-slate-800">
								<td class="px-4 py-2.5" colspan="2">Cost of Sales</td>
								<td class="px-4 py-2.5 text-right tabular-nums">({money(pnl.costOfSales.total)})</td>
							</tr>
							{#each pnl.costOfSales.byCategory as cat}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2 capitalize">{cat.category.replace(/_/g, ' ')}</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(cat.total)}</td>
								</tr>
							{/each}
							{#if pnl.costOfSales.staffCost > 0}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2">Staff Cost (Payroll)</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(pnl.costOfSales.staffCost)}</td>
								</tr>
							{/if}

							<!-- Gross Profit -->
							<tr class={`border-t-2 border-slate-300 font-bold ${pnl.grossProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
								<td class="px-4 py-3" colspan="2">Gross Profit</td>
								<td class="px-4 py-3 text-right tabular-nums">{money(pnl.grossProfit)}</td>
							</tr>

							<!-- Operating Expenses -->
							<tr class="bg-slate-50 font-semibold text-slate-800">
								<td class="px-4 py-2.5" colspan="2">Operating Expenses</td>
								<td class="px-4 py-2.5 text-right tabular-nums">({money(pnl.operatingExpenses.total)})</td>
							</tr>
							{#each pnl.operatingExpenses.byCategory as cat}
								<tr class="text-slate-700">
									<td class="w-6"></td>
									<td class="px-4 py-2 capitalize">{cat.category.replace(/_/g, ' ')}</td>
									<td class="px-4 py-2 text-right tabular-nums">{money(cat.total)}</td>
								</tr>
							{/each}

							<!-- Net Profit -->
							<tr class={`border-t-2 border-slate-300 font-bold text-lg ${pnl.netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
								<td class="px-4 py-3" colspan="2">Net Profit / (Loss)</td>
								<td class="px-4 py-3 text-right tabular-nums">{money(pnl.netProfit)}</td>
							</tr>
						</tbody>
					</table>
				</div>

				<p class="text-xs text-slate-500">
					Period: {pnl.range.start} to {pnl.range.end}. All amounts in SGD equivalent.
				</p>
			{/if}
		</section>
	{/if}

	<!-- Tab: Trial Balance -->
	{#if activeTab === 'trialBalance'}
		<section class="space-y-4">
			{#if loading}
				<div class="h-64 animate-pulse rounded-xl bg-slate-100"></div>
			{:else}
				<!-- Trial Balance Summary -->
				<div class="grid gap-4 md:grid-cols-3">
					<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p class="text-xs text-slate-500">Total Debit</p>
						<p class="mt-2 text-xl font-semibold text-slate-900">{money(trialBalance.totalDebit)}</p>
					</div>
					<div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<p class="text-xs text-slate-500">Total Credit</p>
						<p class="mt-2 text-xl font-semibold text-slate-900">{money(trialBalance.totalCredit)}</p>
					</div>
					<div class={`rounded-xl border p-4 shadow-sm ${
						Math.abs(trialBalance.difference) < 0.01 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
					}`}>
						<p class="text-xs text-slate-500">Difference</p>
						<p class={`mt-2 text-xl font-semibold ${Math.abs(trialBalance.difference) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}`}>
							{money(trialBalance.difference)}
						</p>
						{#if Math.abs(trialBalance.difference) < 0.01}
							<p class="text-xs text-emerald-600">Balanced</p>
						{/if}
					</div>
				</div>

				<!-- Trial Balance Table -->
				<div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
					<table class="min-w-full divide-y divide-slate-200 text-sm">
						<thead class="bg-slate-50 text-left text-slate-600">
							<tr>
								<th class="px-4 py-3 font-medium">Account</th>
								<th class="px-4 py-3 font-medium">Type</th>
								<th class="px-4 py-3 font-medium text-right">Debit (SGD)</th>
								<th class="px-4 py-3 font-medium text-right">Credit (SGD)</th>
								<th class="px-4 py-3 font-medium text-right">Txn Count</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#if trialBalance.accounts.length === 0}
								<tr>
									<td class="px-4 py-8 text-center text-slate-500" colspan="5">No accounts with activity in selected period.</td>
								</tr>
							{:else}
								{#each trialBalance.accounts as acct}
									<tr class="hover:bg-slate-50">
										<td class="px-4 py-3 font-medium text-slate-800">{acct.account}</td>
										<td class="px-4 py-3">
											<span class={`rounded-full px-2 py-0.5 text-xs font-medium ${
												acct.type === 'revenue' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
											}`}>
												{acct.type === 'revenue' ? 'Revenue' : 'Expense'}
											</span>
										</td>
										<td class="px-4 py-3 text-right tabular-nums">{acct.debit > 0 ? money(acct.debit) : '-'}</td>
										<td class="px-4 py-3 text-right tabular-nums">{acct.credit > 0 ? money(acct.credit) : '-'}</td>
										<td class="px-4 py-3 text-right tabular-nums text-slate-500">{acct.count > 0 ? acct.count : '-'}</td>
									</tr>
								{/each}
								<tr class="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-800">
									<td class="px-4 py-3" colspan="2">Total</td>
									<td class="px-4 py-3 text-right tabular-nums">{money(trialBalance.totalDebit)}</td>
									<td class="px-4 py-3 text-right tabular-nums">{money(trialBalance.totalCredit)}</td>
									<td class="px-4 py-3 text-right"></td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>

				<p class="text-xs text-slate-500">
					Period: {trialBalance.range.start} to {trialBalance.range.end}. Revenue accounts appear as credits; expense accounts as debits.
				</p>
			{/if}
		</section>
	{/if}
</PageShell>

{#if detailModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			class="absolute inset-0 bg-[var(--sf-green)]/40"
			aria-label="Close detail dialog"
			onclick={() => (selectedCard = null)}
		></button>
		<div class="relative max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
				<div class="flex items-start justify-between gap-4">
					<div>
						<h3 class="text-base font-semibold text-slate-900">{detailModal.title}</h3>
						<p class="text-xs text-slate-500">{detailModal.subtitle}</p>
					</div>
					<div class="text-right">
						<p class="text-xs text-slate-500">Current Total</p>
						<p class="text-sm font-semibold text-slate-900">{money(detailModal.total)}</p>
					</div>
				</div>
			</div>
			<div class="max-h-[60vh] overflow-auto">
				<table class="min-w-full divide-y divide-slate-200 text-sm">
					<thead class="bg-white text-left text-slate-600">
						<tr>
							<th class="px-4 py-3">Date</th>
							<th class="px-4 py-3">Source</th>
							<th class="px-4 py-3">Ref</th>
							<th class="px-4 py-3">Note</th>
							<th class="px-4 py-3 text-right">Amount</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#if detailModal.rows.length === 0}
							<tr>
								<td class="px-4 py-8 text-center text-slate-500" colspan="5">{detailModal.empty}</td>
							</tr>
						{:else}
							{#each detailModal.rows as row}
								<tr class="hover:bg-slate-50">
									<td class="px-4 py-3 text-slate-700">{row.date}</td>
									<td class="px-4 py-3 text-slate-700">{row.source}</td>
									<td class="px-4 py-3 font-medium text-slate-800">{row.ref}</td>
									<td class="px-4 py-3 text-slate-700">{row.note}</td>
									<td class="px-4 py-3 text-right text-slate-800">{money(row.amount)}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>
	</div>
{/if}

<style>
	.progress-indicator {
		animation: progressSlide 1.2s ease-in-out infinite;
	}

	.chart-fade-in {
		animation: chartFadeIn 0.45s ease-out;
	}

	.pie-pop {
		animation: piePop 0.5s ease-out;
	}

	.pie-wrap {
		position: relative;
	}

	.pie-sweep-mask {
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		background: conic-gradient(from -90deg, transparent calc(var(--sweep) * 1turn), #ffffff 0);
		animation: pieSweepReveal 1s ease-out forwards;
		pointer-events: none;
	}

	.pie-slice {
		transition: transform 0.22s ease-out, filter 0.22s ease-out;
	}

	.pie-slice:hover {
		filter: brightness(1.05);
	}

	.line-draw {
		stroke-dasharray: 1200;
		stroke-dashoffset: 1200;
		animation: lineDraw 0.9s ease-out forwards;
	}

	.line-expense {
		animation-delay: 0.08s;
	}

	.bar-grow {
		transform-origin: left center;
		animation: barGrow 0.65s ease-out both;
	}

	@keyframes progressSlide {
		0% { transform: translateX(-120%); }
		100% { transform: translateX(420%); }
	}

	@keyframes chartFadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	@keyframes piePop {
		from { opacity: 0; transform: scale(0.88); }
		to { opacity: 1; transform: scale(1); }
	}

	@property --sweep {
		syntax: '<number>';
		inherits: false;
		initial-value: 0;
	}

	@keyframes pieSweepReveal {
		from { --sweep: 0; opacity: 1; }
		to { --sweep: 1; opacity: 0; }
	}

	@keyframes lineDraw {
		to { stroke-dashoffset: 0; }
	}

	@keyframes barGrow {
		from { transform: scaleX(0); }
		to { transform: scaleX(1); }
	}
</style>
