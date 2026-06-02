<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw, Inbox, FileText, AlertTriangle, CheckCircle2, Clock } from 'lucide-svelte';
	import InboxConfirmForm from '$app-layer/components/finance-inbox/InboxConfirmForm.svelte';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import type { DocumentArtifactView, DocumentProcessingStatus } from '$modules/document-intake';

	type Tab = 'review' | 'processing' | 'confirmed' | 'failed';

	interface CategoryChoice {
		id: string;
		label: string;
		sublabel?: string;
		bucket: 'expense' | 'revenue' | 'document_only';
		persistTarget: string | null;
		llmFields: readonly string[];
		userFields: readonly string[];
		requiresProject?: boolean;
	}

	interface Envelope<T> {
		ok?: boolean;
		data?: T;
		error?: string;
	}

	interface IntakeDiagnostics {
		id: string;
		processingStatus: string;
		documentType: string;
		originalFile: {
			fileName: string;
			mimeType: string;
			sizeBytes: number;
		};
		filePreview?: {
			url: string;
			kind: 'pdf' | 'image' | 'text' | 'none' | 'other';
		};
		textExtraction: {
			method: string;
			status: string;
			confidence?: number;
			provider?: string;
			pageCount: number | null;
			textLength: number;
			rawText: string;
			error?: { code: string; message: string };
		} | null;
		classification: {
			confidence?: number;
			reason?: string;
			modelId?: string;
		} | null;
		securityFlags: string[];
		updatedAt: string;
	}

	const panelState = (panel.activeWorkflow?.state as Record<string, unknown> | undefined) ?? {};
	let currentTab = $state<Tab>((panelState.initialTab as Tab | undefined) ?? 'review');
	let items = $state<DocumentArtifactView[]>([]);
	let total = $state(0);
	let categories = $state<CategoryChoice[]>([]);
	let selectedArtifact = $state<DocumentArtifactView | null>(null);
	let diagnostics = $state<IntakeDiagnostics | null>(null);
	let isLoading = $state(false);
	let isLoadingDetail = $state(false);
	let isLoadingDiagnostics = $state(false);
	let loadError = $state<string | null>(null);
	let diagnosticsError = $state<string | null>(null);
	let activeQuote = $state<string | null>(null);
	let markEl = $state<HTMLElement | null>(null);

	type HighlightSegments = { before: string; match: string; after: string } | null;

	const highlightSegments = $derived(
		(() => {
			const rawText = diagnostics?.textExtraction?.rawText;
			if (!rawText || !activeQuote) return null as HighlightSegments;
			// Try exact match first, then case-insensitive.
			let idx = rawText.indexOf(activeQuote);
			if (idx === -1) idx = rawText.toLowerCase().indexOf(activeQuote.toLowerCase());
			if (idx === -1) return null as HighlightSegments;
			return {
				before: rawText.slice(0, idx),
				match: rawText.slice(idx, idx + activeQuote.length),
				after: rawText.slice(idx + activeQuote.length)
			} satisfies Exclude<HighlightSegments, null>;
		})()
	);

	$effect(() => {
		if (markEl) markEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	const TAB_LABELS: Record<Tab, string> = {
		review: 'Ready',
		processing: 'Processing',
		confirmed: 'Confirmed',
		failed: 'Attention'
	};

	const PROCESSING_STATUSES: DocumentProcessingStatus[] = [
		'received',
		'stored',
		'text_extraction_pending',
		'text_extracted',
		'ocr_pending',
		'ocr_completed',
		'classification_pending',
		'classified',
		'fields_extraction_pending'
	];

	const READY_STATUSES: DocumentProcessingStatus[] = ['ready_for_review', 'ready_for_workflow'];

	const DOCUMENT_TYPE_LABELS: Record<string, string> = {
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

	function formatBytes(bytes: number) {
		if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unit = 0;
		while (size >= 1024 && unit < units.length - 1) {
			size /= 1024;
			unit += 1;
		}
		return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
	}

	function statusParamFor(tab: Tab): string {
		switch (tab) {
			case 'processing':
				return PROCESSING_STATUSES.join(',');
			case 'confirmed':
				return 'confirmed';
			case 'failed':
				return 'failed,needs_manual_review';
			case 'review':
				return 'ready_for_review';
		}
	}

	async function getJson<T>(url: string): Promise<T> {
		const res = await fetch(url, { headers: { accept: 'application/json' } });
		const json = (await res.json().catch(() => null)) as Envelope<T> | null;
		if (!res.ok || !json?.ok || json.data === undefined) {
			throw new Error(json?.error ?? `Request failed (${res.status})`);
		}
		return json.data;
	}

	async function loadCategories() {
		if (categories.length > 0) return;
		const data = await getJson<{ categories: CategoryChoice[] }>('/api/documents/categories');
		categories = data.categories;
	}

	async function loadInbox(tab = currentTab) {
		isLoading = true;
		loadError = null;
		try {
			const params = new URLSearchParams({
				status: statusParamFor(tab),
				limit: '50'
			});
			const data = await getJson<{ items: DocumentArtifactView[]; total: number }>(
				`/api/documents/inbox?${params.toString()}`
			);
			items = data.items;
			total = data.total;
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Could not load inbox';
		} finally {
			isLoading = false;
		}
	}

	async function selectTab(tab: Tab) {
		currentTab = tab;
		selectedArtifact = null;
		await loadInbox(tab);
	}

	async function openArtifact(id: string) {
		isLoadingDetail = true;
		loadError = null;
		diagnostics = null;
		diagnosticsError = null;
		// Reset the inbox sub-flow step so the new artifact starts from
		// 'category' instead of inheriting the previous artifact's stepIndex
		// (the InboxConfirmForm $effect would otherwise jump to 'project').
		if (panel.activeWorkflow?.workflowId === 'finance-inbox') {
			panel.setStep(0);
		}
		try {
			await loadCategories();
			selectedArtifact = await getJson<DocumentArtifactView>(`/api/documents/${encodeURIComponent(id)}`);
			void loadDiagnostics(id);
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Could not load document';
		} finally {
			isLoadingDetail = false;
		}
	}

	async function loadDiagnostics(id: string) {
		isLoadingDiagnostics = true;
		diagnosticsError = null;
		try {
			diagnostics = await getJson<IntakeDiagnostics>(
				`/api/documents/${encodeURIComponent(id)}/intake`
			);
		} catch (err) {
			diagnosticsError = err instanceof Error ? err.message : 'Could not load document review';
		} finally {
			isLoadingDiagnostics = false;
		}
	}

	async function refreshSelected() {
		if (!selectedArtifact) return;
		await openArtifact(selectedArtifact.id);
	}

	function backToList() {
		selectedArtifact = null;
		// Reset sub-flow step so the TaskLine indicator returns to the start.
		if (panel.activeWorkflow?.workflowId === 'finance-inbox') {
			panel.setStep(0);
		}
	}

	async function handleConfirmed() {
		selectedArtifact = null;
		currentTab = 'confirmed';
		// Reset the inbox sub-flow step so the TaskLine indicator returns
		// to the start while the user picks the next document.
		if (panel.activeWorkflow?.workflowId === 'finance-inbox') {
			panel.setStep(0);
		}
		await loadInbox('confirmed');
	}

	const statusTone = (status: DocumentProcessingStatus) => {
		if (status === 'ready_for_review' || status === 'ready_for_workflow') return 'ready';
		if (status === 'confirmed') return 'confirmed';
		if (status === 'failed' || status === 'needs_manual_review') return 'failed';
		return 'processing';
	};

	const statusLabel = (status: DocumentProcessingStatus) => {
		switch (status) {
			case 'ready_for_review':
			case 'ready_for_workflow':
				return 'Ready';
			case 'confirmed':
				return 'Confirmed';
			case 'needs_manual_review':
				return 'Manual';
			case 'failed':
				return 'Failed';
			case 'stored':
			case 'received':
				return 'Queued';
			default:
				return 'Working';
		}
	};

	const fieldsPreview = (item: DocumentArtifactView) => {
		const f = item.suggestedFields?.fields as Record<string, unknown> | undefined;
		if (!f) return '';
		const str = (...keys: string[]) => {
			for (const key of keys) if (typeof f[key] === 'string' && f[key]) return f[key] as string;
			return '';
		};
		const num = (...keys: string[]) => {
			for (const key of keys) if (typeof f[key] === 'number') return f[key] as number;
			return null;
		};
		const counterparty = str('supplier_name', 'vendor', 'customer_name', 'client_name', 'recipient_name', 'counterpartyName');
		const amount = num('amount', 'invoice_amount', 'totalAmount');
		const currency = str('currency', 'invoice_currency') || 'SGD';
		if (counterparty && amount != null) return `${counterparty} · ${currency} ${amount.toFixed(2)}`;
		if (counterparty) return counterparty;
		if (amount != null) return `${currency} ${amount.toFixed(2)}`;
		return '';
	};

	onMount(() => {
		void loadInbox();
		// Poll every 5s while the user is watching the Processing tab — but
		// only if the page is actually visible. If the tab is backgrounded
		// (other browser tab focused / window minimized), skip the fetch so
		// we don't churn the worker for an audience of nobody. The interval
		// itself stays armed so refresh resumes the moment the user comes
		// back without waiting for the next mount.
		const timer = window.setInterval(() => {
			if (currentTab !== 'processing' || selectedArtifact) return;
			if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
			void loadInbox('processing');
		}, 5000);
		return () => window.clearInterval(timer);
	});
</script>

<div class="inbox-layer">
	{#if selectedArtifact}
		<div class="detail-header">
			<button type="button" class="ghost-button" onclick={backToList}>
				Back
			</button>
			<button type="button" class="icon-button" onclick={refreshSelected} disabled={isLoadingDetail} title="Refresh">
				<RefreshCw size={15} />
			</button>
		</div>

		<div class="document-summary">
			<FileText size={18} />
			<div>
				<h3>{selectedArtifact.originalFile.fileName}</h3>
				<p>{statusLabel(selectedArtifact.processingStatus)} · {selectedArtifact.documentType ?? 'unknown'}</p>
			</div>
		</div>

		{#if READY_STATUSES.includes(selectedArtifact.processingStatus)}
			{#if categories.length > 0}
				<div class="review-grid">
					<div class="review-main">
						<InboxConfirmForm
							artifact={selectedArtifact}
							{categories}
							cancelHref={null}
							onConfirmed={handleConfirmed}
							onFieldHighlight={(q) => { activeQuote = q; }}
						/>
					</div>
					<aside class="review-side">
						<section class="review-card">
							<div class="review-card-head">
								<div>
									<h3>Document review</h3>
									<p>File preview and extracted source text.</p>
								</div>
								<button
									type="button"
									class="icon-button"
									onclick={() => loadDiagnostics(selectedArtifact!.id)}
									disabled={isLoadingDiagnostics}
									title="Refresh document review"
								>
									<RefreshCw size={14} />
								</button>
							</div>

							{#if isLoadingDiagnostics && !diagnostics}
								<div class="review-message">Loading document review...</div>
							{:else if diagnosticsError}
								<div class="review-message error">{diagnosticsError}</div>
							{:else if diagnostics}
								<dl class="doc-facts">
									<div>
										<dt>Detected type</dt>
										<dd>{DOCUMENT_TYPE_LABELS[diagnostics.documentType] ?? diagnostics.documentType}</dd>
									</div>
									<div>
										<dt>Text extraction</dt>
										<dd>{diagnostics.textExtraction?.method ?? 'n/a'} · {pct(diagnostics.textExtraction?.confidence)}</dd>
									</div>
									<div>
										<dt>File</dt>
										<dd>{formatBytes(diagnostics.originalFile.sizeBytes)}</dd>
									</div>
								</dl>

								<div class="file-preview">
									{#if diagnostics.filePreview?.kind === 'pdf'}
										<iframe src={diagnostics.filePreview.url} title="Document file preview"></iframe>
									{:else if diagnostics.filePreview?.kind === 'image'}
										<img src={diagnostics.filePreview.url} alt="Document file preview" />
									{:else}
										<div class="preview-placeholder">
											<FileText size={22} />
											<span>{diagnostics.originalFile.mimeType || 'No inline preview'}</span>
										</div>
									{/if}
								</div>

								<div class="raw-text-head">
									<h3>Raw text</h3>
									<span>{diagnostics.textExtraction?.textLength ?? 0} chars</span>
								</div>
								<div class="raw-text" role="region" aria-label="Raw extracted text">
									{#if diagnostics.textExtraction?.rawText}
										{#if highlightSegments}
											{highlightSegments.before}<mark bind:this={markEl} class="raw-text-mark">{highlightSegments.match}</mark>{highlightSegments.after}
										{:else}
											{diagnostics.textExtraction.rawText}
										{/if}
									{:else}
										No raw text available.
									{/if}
								</div>
							{:else}
								<div class="review-message">Open a document to load review data.</div>
							{/if}
						</section>
					</aside>
				</div>
			{/if}
		{:else if selectedArtifact.processingStatus === 'confirmed'}
			<div class="state-panel confirmed">
				<CheckCircle2 size={18} />
				This document has already been confirmed.
			</div>
		{:else if selectedArtifact.processingStatus === 'failed' || selectedArtifact.processingStatus === 'needs_manual_review'}
			<div class="state-panel failed">
				<AlertTriangle size={18} />
				This document needs manual attention. Open the full inbox page for fallback handling.
			</div>
		{:else}
			<div class="state-panel processing">
				<Clock size={18} />
				The worker is still extracting and classifying this document.
			</div>
		{/if}
	{:else}
		<div class="list-header">
			<div>
				<div class="eyebrow"><Inbox size={14} /> Finance Inbox</div>
				<h2>Documents waiting for review</h2>
			</div>
			<button type="button" class="icon-button" onclick={() => loadInbox()} disabled={isLoading} title="Refresh">
				<RefreshCw size={15} />
			</button>
		</div>

		<div class="tabs">
			{#each (['review', 'processing', 'confirmed', 'failed'] as Tab[]) as tab}
				<button
					type="button"
					class:active={currentTab === tab}
					onclick={() => selectTab(tab)}
				>
					{TAB_LABELS[tab]}
					{#if currentTab === tab}
						<span>{total}</span>
					{/if}
				</button>
			{/each}
		</div>

		{#if loadError}
			<div class="state-panel failed">
				<AlertTriangle size={18} />
				{loadError}
			</div>
		{/if}

		{#if isLoading && items.length === 0}
			<div class="state-panel processing">
				<Clock size={18} />
				Loading inbox...
			</div>
		{:else if items.length === 0}
			<div class="empty-state">
				<Inbox size={28} />
				<h3>{currentTab === 'review' ? 'No documents ready' : 'Nothing here'}</h3>
				<p>
					{currentTab === 'processing'
						? 'New uploads appear here while the worker extracts fields.'
						: 'Upload a document from the record flow to add it to the inbox.'}
				</p>
			</div>
		{:else}
			<ul class="document-list">
				{#each items as item (item.id)}
					<li>
						<button type="button" onclick={() => openArtifact(item.id)}>
							<span class="doc-icon"><FileText size={17} /></span>
							<span class="doc-main">
								<span class="doc-title">{item.originalFile.fileName}</span>
								<span class="doc-meta">
									{item.documentType ?? 'unknown'}
									{#if fieldsPreview(item)}
										· {fieldsPreview(item)}
									{/if}
								</span>
							</span>
							<span class="status-pill {statusTone(item.processingStatus)}">
								{statusLabel(item.processingStatus)}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.inbox-layer {
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 0;
	}
	.list-header,
	.detail-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.eyebrow {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		margin-bottom: 6px;
		color: var(--panel-gold);
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	h2 {
		font-size: 22px;
		font-weight: 500;
		color: var(--panel-fg);
	}
	.icon-button,
	.ghost-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--panel-border);
		background: var(--panel-surface);
		color: var(--panel-fg-muted);
		font: inherit;
		cursor: pointer;
	}
	.icon-button {
		width: 34px;
		height: 34px;
		border-radius: 9px;
	}
	.ghost-button {
		height: 34px;
		padding: 0 12px;
		border-radius: 9px;
	}
	.icon-button:hover,
	.ghost-button:hover {
		color: var(--panel-fg);
		border-color: var(--panel-border-strong);
	}
	.tabs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 34px;
		border: 1px solid var(--panel-border);
		border-radius: 9px;
		background: var(--panel-surface);
		color: var(--panel-fg-muted);
		font: inherit;
		font-size: 12px;
		cursor: pointer;
	}
	.tabs button.active {
		color: #2d1f08;
		background: var(--panel-gold);
		border-color: var(--panel-gold-bright);
	}
	.tabs span {
		min-width: 18px;
		padding: 1px 5px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.12);
		font-size: 10px;
	}
	.document-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	.document-list button {
		display: grid;
		grid-template-columns: 38px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px;
		border: 1px solid var(--panel-border);
		border-radius: 12px;
		background: var(--panel-surface);
		color: inherit;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.document-list button:hover {
		background: var(--panel-surface-raised);
		border-color: var(--panel-border-strong);
	}
	.doc-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: 10px;
		background: rgba(234, 188, 60, 0.08);
		color: var(--panel-gold);
	}
	.doc-main {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.doc-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--panel-fg);
		font-size: 13px;
		font-weight: 500;
	}
	.doc-meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--panel-fg-muted);
		font-size: 11.5px;
	}
	.status-pill {
		padding: 4px 7px;
		border-radius: 999px;
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
	}
	.status-pill.ready {
		color: #166534;
		background: #dcfce7;
	}
	.status-pill.confirmed {
		color: #475569;
		background: #f1f5f9;
	}
	.status-pill.processing {
		color: #075985;
		background: #e0f2fe;
	}
	.status-pill.failed {
		color: #9f1239;
		background: #ffe4e6;
	}
	.document-summary,
	.state-panel,
	.empty-state {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--panel-border);
		border-radius: 12px;
		background: var(--panel-surface);
		color: var(--panel-fg-muted);
	}
	.document-summary h3 {
		color: var(--panel-fg);
		font-size: 14px;
		font-weight: 600;
	}
	.document-summary p {
		margin-top: 2px;
		color: var(--panel-fg-muted);
		font-size: 12px;
	}
	.state-panel.confirmed {
		color: #166534;
		background: #dcfce7;
	}
	.state-panel.failed {
		color: #9f1239;
		background: #ffe4e6;
	}
	.state-panel.processing {
		color: #075985;
		background: #e0f2fe;
	}
	.empty-state {
		flex-direction: column;
		justify-content: center;
		padding: 42px 18px;
		text-align: center;
	}
	.empty-state h3 {
		color: var(--panel-fg);
		font-size: 15px;
	}
	.empty-state p {
		max-width: 34ch;
		color: var(--panel-fg-muted);
		font-size: 12.5px;
		line-height: 1.5;
	}
	.review-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
		align-items: start;
	}
	.review-main {
		min-width: 0;
	}
	.review-side {
		min-width: 0;
	}
	.review-card {
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		background: #ffffff;
		padding: 16px;
		color: #0f172a;
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
	}
	.review-card-head,
	.raw-text-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.review-card h3,
	.raw-text-head h3 {
		margin: 0;
		color: #0f172a;
		font-size: 13px;
		font-weight: 650;
	}
	.review-card p {
		margin-top: 3px;
		color: #64748b;
		font-size: 11.5px;
		line-height: 1.4;
	}
	.review-message {
		margin-top: 14px;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		background: #f8fafc;
		padding: 10px;
		color: #475569;
		font-size: 12px;
	}
	.review-message.error {
		border-color: #fecdd3;
		background: #fff1f2;
		color: #9f1239;
	}
	.doc-facts {
		display: grid;
		gap: 8px;
		margin: 14px 0;
		font-size: 12px;
	}
	.doc-facts div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	.doc-facts dt {
		color: #64748b;
	}
	.doc-facts dd {
		margin: 0;
		color: #1e293b;
		font-weight: 550;
		text-align: right;
	}
	.file-preview {
		overflow: hidden;
		height: 240px;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: #f8fafc;
	}
	.file-preview iframe,
	.file-preview img {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: #ffffff;
	}
	.file-preview img {
		object-fit: contain;
	}
	.preview-placeholder {
		display: flex;
		height: 100%;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #64748b;
		font-size: 12px;
		text-align: center;
	}
	.raw-text-head {
		margin-top: 14px;
		align-items: center;
	}
	.raw-text-head span {
		color: #64748b;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
		font-size: 11px;
	}
	.raw-text {
		overflow: auto;
		max-height: 260px;
		margin: 8px 0 0;
		white-space: pre-wrap;
		word-break: break-word;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		background: #f8fafc;
		padding: 12px;
		color: #334155;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
		font-size: 11.5px;
		line-height: 1.55;
		scroll-behavior: smooth;
	}
	.raw-text-mark {
		background: #fef08a;
		color: #1e293b;
		border-radius: 3px;
		padding: 1px 0;
		outline: 2px solid #facc15;
		outline-offset: 1px;
	}
	@media (min-width: 980px) {
		.review-grid {
			grid-template-columns: minmax(0, 1.18fr) minmax(300px, 0.82fr);
		}
		.review-side {
			position: sticky;
			top: 0;
		}
	}
</style>
