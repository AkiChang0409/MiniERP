<script lang="ts">
	import { onMount } from 'svelte';
	import type { DocumentArtifactView, DocumentClassificationResult } from '$modules/document-intake';

	interface IntakeDiagnostics {
		id: string;
		processingStatus: string;
		documentType: string;
		originalFile: {
			fileName: string;
			mimeType: string;
			sizeBytes: number;
		};
		textExtraction: {
			method: string;
			status: string;
			confidence?: number;
			language?: string;
			provider?: string;
			pageCount: number | null;
			textLength: number;
			rawText: string;
			error?: { code: string; message: string };
		} | null;
		classification: DocumentClassificationResult | null;
		securityFlags: string[];
		updatedAt: string;
	}

	let { artifact }: { artifact: DocumentArtifactView } = $props();

	let diagnostics = $state<IntakeDiagnostics | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

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
		unknown: 'Unknown'
	};

	const pct = (value?: number) => (value == null ? 'n/a' : `${(value * 100).toFixed(0)}%`);

	async function loadDiagnostics() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/documents/${encodeURIComponent(artifact.id)}/intake`);
			const json = (await res.json()) as { ok?: boolean; data?: IntakeDiagnostics; error?: string };
			if (!res.ok || json.ok === false || !json.data) {
				throw new Error(json.error ?? `Request failed (${res.status})`);
			}
			diagnostics = json.data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load intake diagnostics';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadDiagnostics();
	});
</script>

<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-sm font-semibold text-slate-950">Document intake</h2>
			<p class="mt-1 text-xs text-slate-500">Raw text extraction and coarse document classification.</p>
		</div>
		<button
			type="button"
			class="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
			disabled={loading}
			onclick={loadDiagnostics}
		>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	{#if error}
		<div class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
			{error}
		</div>
	{:else if !diagnostics}
		<div class="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
			Loading intake diagnostics...
		</div>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-2">
			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
				<h3 class="text-xs font-semibold uppercase text-slate-500">Text extraction</h3>
				<dl class="mt-2 space-y-1 text-xs">
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Status</dt>
						<dd class="font-medium text-slate-900">{diagnostics.textExtraction?.status ?? 'not started'}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Method</dt>
						<dd class="text-slate-700">{diagnostics.textExtraction?.method ?? 'n/a'}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Provider</dt>
						<dd class="text-slate-700">{diagnostics.textExtraction?.provider ?? 'n/a'}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Confidence</dt>
						<dd class="font-mono text-slate-700">{pct(diagnostics.textExtraction?.confidence)}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Raw text length</dt>
						<dd class="font-mono text-slate-700">{diagnostics.textExtraction?.textLength ?? 0}</dd>
					</div>
				</dl>
			</div>

			<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
				<h3 class="text-xs font-semibold uppercase text-slate-500">Classification</h3>
				<dl class="mt-2 space-y-1 text-xs">
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Detected type</dt>
						<dd class="font-medium text-slate-900">
							{documentTypeLabel[diagnostics.documentType] ?? diagnostics.documentType}
						</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Confidence</dt>
						<dd class="font-mono text-slate-700">{pct(diagnostics.classification?.confidence)}</dd>
					</div>
					<div class="flex justify-between gap-3">
						<dt class="text-slate-500">Model</dt>
						<dd class="text-slate-700">{diagnostics.classification?.modelId ?? 'n/a'}</dd>
					</div>
				</dl>
				{#if diagnostics.classification?.reason}
					<p class="mt-2 text-xs text-slate-600">{diagnostics.classification.reason}</p>
				{/if}
				{#if diagnostics.classification?.possibleTypes?.length}
					<div class="mt-3 flex flex-wrap gap-1.5">
						{#each diagnostics.classification.possibleTypes as candidate}
							<span class="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700">
								{documentTypeLabel[candidate.documentType] ?? candidate.documentType}
								<span class="font-mono text-slate-500">{pct(candidate.confidence)}</span>
							</span>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if diagnostics.textExtraction?.error}
			<div class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
				<span class="font-medium">{diagnostics.textExtraction.error.code}</span>:
				{diagnostics.textExtraction.error.message}
			</div>
		{/if}

		<div class="mt-4">
			<div class="flex items-center justify-between gap-3">
				<h3 class="text-xs font-semibold uppercase text-slate-500">Raw text</h3>
				<span class="font-mono text-[11px] text-slate-400">
					{diagnostics.textExtraction?.textLength ?? 0} chars
				</span>
			</div>
			<pre class="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100">{diagnostics.textExtraction?.rawText || 'No raw text available.'}</pre>
		</div>
	{/if}
</section>
