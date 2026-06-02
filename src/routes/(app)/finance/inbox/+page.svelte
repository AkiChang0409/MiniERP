<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageShell from '$app-layer/components/PageShell.svelte';
	import type { DocumentArtifactView } from '$modules/document-intake';

	let { data } = $props();

	type Tab = 'review' | 'processing' | 'confirmed' | 'failed';

	const TAB_LABELS: Record<Tab, string> = {
		review: 'Ready for review',
		processing: 'Processing',
		confirmed: 'Recently confirmed',
		failed: 'Needs attention'
	};

	let currentTab = $state<Tab>((data.initialTab as Tab) || 'review');
	let items = $state<DocumentArtifactView[]>(data.payload.data?.items ?? []);
	let total = $state<number>(data.payload.data?.total ?? 0);
	let isLoading = $state(false);
	let loadError = $state<string | null>(null);
	let cancellingIds = $state<Set<string>>(new Set());

	const formatDateTime = (iso: string) => {
		try {
			return new Date(iso).toLocaleString('en-SG', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	};

	const formatBytes = (n: number | undefined) => {
		if (!n || n <= 0) return '';
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	};

	const documentTypeLabel: Record<string, string> = {
		supplier_invoice: 'Supplier invoice',
		customer_invoice: 'Customer invoice',
		receipt: 'Receipt',
		purchase_order: 'Purchase order',
		contract: 'Contract',
		quotation: 'Quotation',
		bank_statement: 'Bank statement',
		tax_document: 'Tax document',
		logistics_document: 'Logistics doc',
		unknown: 'Unknown type'
	};

	const statusBadge = (status: string) => {
		switch (status) {
			case 'ready_for_review':
				return { label: 'Ready', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' };
			case 'confirmed':
				return { label: 'Confirmed', tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
			case 'failed':
				return { label: 'Failed', tone: 'bg-rose-50 text-rose-700 ring-rose-200' };
			case 'needs_manual_review':
				return { label: 'Manual review', tone: 'bg-amber-50 text-amber-700 ring-amber-200' };
			case 'fields_extraction_pending':
			case 'classification_pending':
			case 'text_extraction_pending':
				return { label: 'Processing…', tone: 'bg-sky-50 text-sky-700 ring-sky-200' };
			case 'classified':
			case 'text_extracted':
				return { label: 'Working…', tone: 'bg-sky-50 text-sky-700 ring-sky-200' };
			case 'received':
			case 'stored':
				return { label: 'Queued', tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
			default:
				return { label: status, tone: 'bg-slate-50 text-slate-600 ring-slate-200' };
		}
	};

	const fieldsPreview = (item: DocumentArtifactView) => {
		const f = item.suggestedFields?.fields as Record<string, unknown> | undefined;
		if (!f) return null;
		const str = (...keys: string[]) => {
			for (const key of keys) if (typeof f[key] === 'string' && f[key]) return f[key] as string;
			return null;
		};
		const num = (...keys: string[]) => {
			for (const key of keys) if (typeof f[key] === 'number') return f[key] as number;
			return null;
		};
		const counterparty = str('supplier_name', 'vendor', 'customer_name', 'client_name', 'recipient_name', 'counterpartyName');
		const amount = num('amount', 'invoice_amount', 'totalAmount');
		const currency = str('currency', 'invoice_currency') ?? 'SGD';
		const docNum = str('invoice_number', 'receipt_number', 'po_number', 'contract_number', 'quotation_number', 'documentNumber');
		return { counterparty, amount, currency, docNum };
	};

	const lowConfidenceCount = (item: DocumentArtifactView) => {
		const conf = item.suggestedFields?.confidence;
		if (!conf) return 0;
		let n = 0;
		for (const v of Object.values(conf)) {
			if (v < 0.5) n++;
		}
		return n;
	};

	async function selectTab(tab: Tab) {
		if (tab === currentTab) return;
		currentTab = tab;
		isLoading = true;
		loadError = null;
		const url = new URL(page.url);
		if (tab === 'review') url.searchParams.delete('tab');
		else url.searchParams.set('tab', tab);
		await goto(url.pathname + url.search, { keepFocus: true, noScroll: true });
		try {
			const refreshed = await fetchInbox(tab);
			items = refreshed.items;
			total = refreshed.total;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load inbox';
		} finally {
			isLoading = false;
		}
	}

	async function refresh() {
		isLoading = true;
		loadError = null;
		try {
			const refreshed = await fetchInbox(currentTab);
			items = refreshed.items;
			total = refreshed.total;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to refresh';
		} finally {
			isLoading = false;
		}
	}

	async function fetchInbox(tab: Tab): Promise<{ items: DocumentArtifactView[]; total: number }> {
		const params = new URLSearchParams();
		const statusParam = statusParamFor(tab);
		if (statusParam) params.set('status', statusParam);
		params.set('limit', '50');
		const res = await fetch(`/api/documents/inbox?${params.toString()}`, {
			headers: { accept: 'application/json' }
		});
		if (!res.ok) throw new Error(`Inbox API ${res.status}`);
		const json = (await res.json()) as { data?: { items: DocumentArtifactView[]; total: number } };
		return json.data ?? { items: [], total: 0 };
	}

	function statusParamFor(tab: Tab): string | null {
		switch (tab) {
			case 'processing':
				return [
					'received',
					'stored',
					'text_extraction_pending',
					'text_extracted',
					'classification_pending',
					'classified',
					'fields_extraction_pending'
				].join(',');
			case 'confirmed':
				return 'confirmed';
			case 'failed':
				return ['failed', 'needs_manual_review'].join(',');
			case 'review':
				return 'ready_for_review';
		}
	}

	function rowHref(item: DocumentArtifactView) {
		return `/finance/inbox/${item.id}`;
	}

	function rowKeyDown(e: KeyboardEvent, href: string) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			void goto(href);
		}
	}

	async function cancelItem(item: DocumentArtifactView) {
		const confirmed = window.confirm(
			`Cancel processing for "${item.originalFile.fileName}"? The pipeline will stop on the next stage boundary and the item will be moved out of the inbox.`
		);
		if (!confirmed) return;
		cancellingIds = new Set(cancellingIds).add(item.id);
		try {
			const res = await fetch(`/api/documents/${item.id}/abandon`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason: 'cancelled_from_inbox_processing' })
			});
			if (!res.ok) {
				const json = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(json?.error ?? `Cancel failed (${res.status})`);
			}
			items = items.filter((it) => it.id !== item.id);
			total = Math.max(0, total - 1);
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to cancel';
		} finally {
			const next = new Set(cancellingIds);
			next.delete(item.id);
			cancellingIds = next;
		}
	}
</script>

<PageShell
	eyebrow="Finance"
	title="Document Inbox"
	description="Documents waiting for review. Drop a file to add. The system extracts text, classifies, and pre-fills fields automatically."
>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onclick={refresh}
				class="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
				disabled={isLoading}
			>
				{isLoading ? 'Refreshing…' : 'Refresh'}
			</button>
			<a
				href="/finance/expenses/upload"
				class="inline-flex items-center gap-1.5 rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[var(--sf-green-dark)]"
				style="--sf-green: #387234; --sf-green-dark: #2e5d2a;"
			>
				+ Upload document
			</a>
		</div>
	{/snippet}

	<!-- Tabs -->
	<div class="border-b border-slate-200">
		<nav class="-mb-px flex gap-6" aria-label="Inbox tabs">
			{#each (['review', 'processing', 'confirmed', 'failed'] as Tab[]) as tab}
				<button
					type="button"
					onclick={() => selectTab(tab)}
					class="border-b-2 px-1 py-3 text-sm font-medium transition {currentTab === tab
						? 'border-[var(--sf-green)] text-[var(--sf-green)]'
						: 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}"
					style="--sf-green: #387234;"
					aria-current={currentTab === tab ? 'page' : undefined}
				>
					{TAB_LABELS[tab]}
					{#if currentTab === tab}
						<span class="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
							>{total}</span
						>
					{/if}
				</button>
			{/each}
		</nav>
	</div>

	<!-- Error banner -->
	{#if loadError}
		<div
			class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
			role="alert"
		>
			{loadError}
		</div>
	{/if}

	<!-- Empty state -->
	{#if !isLoading && items.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"
		>
			<div class="text-4xl">📥</div>
			<h3 class="mt-4 text-base font-semibold text-slate-900">
				{currentTab === 'review' ? 'No documents waiting for review' : 'Nothing here'}
			</h3>
			<p class="mt-2 max-w-sm text-sm text-slate-500">
				{currentTab === 'review'
					? 'Upload a supplier invoice, receipt, or PO to start. The AI will extract fields and bring it here for confirmation.'
					: currentTab === 'processing'
						? 'Documents currently being processed will appear here.'
						: currentTab === 'confirmed'
							? 'Documents you have confirmed are kept here for 30 days.'
							: 'Documents that the AI could not auto-classify will appear here.'}
			</p>
			{#if currentTab === 'review'}
				<a
					href="/finance/expenses/upload"
					class="mt-6 inline-flex items-center gap-1.5 rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--sf-green-dark)]"
					style="--sf-green: #387234; --sf-green-dark: #2e5d2a;"
				>
					Upload document
				</a>
			{/if}
		</div>
	{/if}

	<!-- List -->
	{#if items.length > 0}
		<ul class="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
			{#each items as item (item.id)}
				{@const badge = statusBadge(item.processingStatus)}
				{@const preview = fieldsPreview(item)}
				{@const lowN = lowConfidenceCount(item)}
				{@const href = rowHref(item)}
				{@const isCancelling = cancellingIds.has(item.id)}
				<li class="flex items-stretch">
					<a
						{href}
						onkeydown={(e) => rowKeyDown(e, href)}
						class="flex flex-1 items-center gap-4 px-4 py-3 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-green)] focus-visible:ring-offset-2"
						style="--sf-green: #387234;"
					>
						<!-- Icon column -->
						<div
							class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-slate-100 text-base text-slate-500"
							aria-hidden="true"
						>
							📄
						</div>

						<!-- Main column -->
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<p class="truncate text-sm font-medium text-slate-900">
									{item.originalFile.fileName}
								</p>
								<span
									class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset {badge.tone}"
								>
									{badge.label}
								</span>
								{#if lowN > 0 && currentTab === 'review'}
									<span
										class="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-200"
										title="{lowN} field(s) below 0.5 confidence"
									>
										{lowN} low-conf
									</span>
								{/if}
							</div>
							<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
								<span>{documentTypeLabel[item.documentType ?? 'unknown'] ?? 'Document'}</span>
								{#if preview?.counterparty}
									<span>· {preview.counterparty}</span>
								{/if}
								{#if preview?.amount !== null && preview?.amount !== undefined}
									<span class="font-medium text-slate-700"
										>· {preview.currency} {preview.amount.toLocaleString('en-SG', {
											minimumFractionDigits: 2
										})}</span
									>
								{/if}
								{#if preview?.docNum}
									<span class="font-mono">· {preview.docNum}</span>
								{/if}
							</div>
						</div>

						<!-- Right column -->
						<div class="hidden flex-none items-end gap-1 text-right text-xs text-slate-400 sm:flex sm:flex-col">
							<span>{formatDateTime(item.updatedAt)}</span>
							<span class="font-mono">{formatBytes(item.originalFile.sizeBytes)}</span>
						</div>
					</a>
					{#if currentTab === 'processing'}
						<div class="flex items-center pr-3">
							<button
								type="button"
								onclick={() => cancelItem(item)}
								disabled={isCancelling}
								title="Stop this processing job and remove it from the inbox"
								class="inline-flex items-center rounded-md border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-50"
							>
								{isCancelling ? 'Cancelling…' : 'Cancel'}
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if isLoading && items.length === 0}
		<div class="flex justify-center py-12 text-sm text-slate-400">Loading…</div>
	{/if}
</PageShell>
