<script lang="ts">
	import { page } from '$app/stores';

	const flow = [
		{ href: '/procurement/rfqs', label: 'RFQs' },
		{ href: '/procurement/purchase-orders', label: 'Purchase Orders' },
		{ href: '/procurement/receiving', label: 'Receiving · QC' },
		{ href: '/procurement/supplier-invoices', label: 'Supplier Invoices' }
	];
	const utilities = [
		{ href: '/procurement', label: 'Overview' },
		{ href: '/procurement/suppliers', label: 'Suppliers' }
	];

	function isActive(href: string, pathname: string) {
		if (href === '/procurement') return pathname === '/procurement';
		return pathname === href || pathname.startsWith(href + '/');
	}

	const activeStep = $derived(flow.findIndex((s) => isActive(s.href, $page.url.pathname)));
</script>

<nav class="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
	<!-- Utility links: Overview + Suppliers, sit above the flow -->
	<div class="mb-4 flex items-center gap-1 text-xs">
		{#each utilities as u}
			{@const active = isActive(u.href, $page.url.pathname)}
			<a
				href={u.href}
				class={active
					? 'rounded-full bg-[var(--sf-green,#387234)] px-3 py-1 font-semibold text-white'
					: 'rounded-full px-3 py-1 text-slate-600 hover:bg-slate-100'}
			>
				{u.label}
			</a>
		{/each}
		<span class="ml-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">Procure to Pay</span>
	</div>

	<!-- Stepper: 4 round-numbered steps connected by hairlines -->
	<ol class="flex flex-wrap items-center gap-y-3">
		{#each flow as step, i}
			{@const active = activeStep === i}
			{@const completed = activeStep > i}
			<li class="flex items-center">
				<a
					href={step.href}
					class="group flex items-center gap-2.5 rounded-full px-2 py-1 transition hover:bg-slate-50"
					aria-current={active ? 'step' : undefined}
				>
					<span
						class={
							active
								? 'flex h-7 w-7 items-center justify-center rounded-full bg-[var(--sf-green,#387234)] text-xs font-semibold text-white shadow ring-4 ring-[var(--sf-green,#387234)]/15'
								: completed
									? 'flex h-7 w-7 items-center justify-center rounded-full border border-[var(--sf-green,#387234)] bg-[var(--sf-green,#387234)]/10 text-xs font-semibold text-[var(--sf-green,#387234)]'
									: 'flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-500 group-hover:border-slate-400'
						}
					>
						{#if completed}
							<svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2.5"
								><path d="M3.5 8.5l3 3 6-7" stroke-linecap="round" stroke-linejoin="round" /></svg
							>
						{:else}
							{i + 1}
						{/if}
					</span>
					<span
						class={
							active
								? 'text-sm font-semibold text-slate-900'
								: 'text-sm text-slate-600 group-hover:text-slate-900'
						}
					>
						{step.label}
					</span>
				</a>
				{#if i < flow.length - 1}
					<span
						class={
							completed
								? 'mx-2 h-px w-8 bg-[var(--sf-green,#387234)]/40 sm:w-12'
								: 'mx-2 h-px w-8 bg-slate-200 sm:w-12'
						}
						aria-hidden="true"
					></span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
