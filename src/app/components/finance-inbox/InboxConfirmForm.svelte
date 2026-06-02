<script lang="ts">
	import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import type { DocumentArtifactView } from '$modules/document-intake';

	export interface CategoryChoice {
		id: string;
		label: string;
		sublabel?: string;
		bucket: 'expense' | 'revenue' | 'document_only';
		persistTarget: string | null;
		llmFields: readonly string[];
		userFields: readonly string[];
		requiresProject?: boolean;
	}

	type FieldKind = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'textarea';
	type Draft = Record<string, string | boolean>;
	type ReviewStep = 'category' | 'fields' | 'project';

	type ConfirmResult = {
		entityId: string;
		entityRoute: string;
		categoryId: string;
	};

	type ProjectInfo = {
		id: string;
		name: string;
		customerName: string | null;
		status: string;
		startDate: string | null;
		endDate: string | null;
	};

	interface FieldMeta {
		label: string;
		kind: FieldKind;
		aliases?: string[];
		options?: Array<{ value: string; label: string }>;
		defaultValue?: string | boolean;
		span?: 'full';
	}

	let {
		artifact: initialArtifact,
		categories,
		cancelHref = '/finance/inbox',
		onConfirmed,
		onAbandoned,
		onFieldHighlight
	}: {
		artifact: DocumentArtifactView;
		categories: CategoryChoice[];
		cancelHref?: string | null;
		onConfirmed?: (result: ConfirmResult) => void | Promise<void>;
		onAbandoned?: (artifact: DocumentArtifactView) => void | Promise<void>;
		/** Called when a field input gains or loses focus. Provides the verbatim
		 *  source quote from the LLM (if available) so the parent can highlight
		 *  the matching text in the raw-text panel. Pass null on blur. */
		onFieldHighlight?: (quote: string | null) => void;
	} = $props();

	const FIELD_META: Record<string, FieldMeta> = {
		invoice_number: { label: 'Invoice number', kind: 'text', aliases: ['documentNumber', 'invoiceNumber'] },
		receipt_number: { label: 'Receipt number', kind: 'text', aliases: ['documentNumber', 'receiptNumber'] },
		po_number: { label: 'PO number', kind: 'text', aliases: ['documentNumber', 'poNumber'] },
		contract_number: { label: 'Contract number', kind: 'text', aliases: ['documentNumber', 'contractNumber'] },
		quotation_number: { label: 'Quotation number', kind: 'text', aliases: ['documentNumber', 'quotationNumber'] },
		supplier_name: { label: 'Supplier', kind: 'text', aliases: ['counterpartyName', 'supplierName'] },
		vendor: { label: 'Vendor', kind: 'text', aliases: ['counterpartyName', 'vendor'] },
		recipient_name: { label: 'Recipient', kind: 'text', aliases: ['recipientName', 'counterpartyName'] },
		recipient: { label: 'Recipient', kind: 'text', aliases: ['recipientName'] },
		staff_name: { label: 'Staff name', kind: 'text', aliases: ['staffName'] },
		customer_name: { label: 'Customer', kind: 'text', aliases: ['counterpartyName', 'customerName'] },
		client_name: { label: 'Client', kind: 'text', aliases: ['counterpartyName', 'clientName'] },
		date: { label: 'Date', kind: 'date', aliases: ['issueDate', 'date'] },
		due_date: { label: 'Due date', kind: 'date', aliases: ['dueDate'] },
		effective_date: { label: 'Effective date', kind: 'date', aliases: ['effectiveDate'] },
		expiry_date: { label: 'Expiry date', kind: 'date', aliases: ['expiryDate'] },
		valid_until: { label: 'Valid until', kind: 'date', aliases: ['validUntil'] },
		invoice_date: { label: 'Invoice date', kind: 'date', aliases: ['issueDate', 'invoiceDate'] },
		invoice_due_date: { label: 'Invoice due date', kind: 'date', aliases: ['dueDate', 'invoiceDueDate'] },
		amount: { label: 'Amount', kind: 'number', aliases: ['totalAmount', 'amount'] },
		total: { label: 'Total', kind: 'number', aliases: ['totalAmount', 'total'] },
		gst_amount: { label: 'GST amount', kind: 'number', aliases: ['gstAmount'] },
		invoice_amount: { label: 'Invoice amount', kind: 'number', aliases: ['totalAmount', 'invoiceAmount'] },
		invoice_gst_amount: { label: 'Invoice GST amount', kind: 'number', aliases: ['gstAmount', 'invoiceGstAmount'] },
		invoice_subtotal: { label: 'Invoice subtotal', kind: 'number', aliases: ['subtotal', 'invoiceSubtotal'] },
		currency: { label: 'Currency', kind: 'text', aliases: ['currency'], defaultValue: 'SGD' },
		invoice_currency: { label: 'Invoice currency', kind: 'text', aliases: ['currency', 'invoiceCurrency'], defaultValue: 'SGD' },
		destination: { label: 'Destination', kind: 'text' },
		service_name: { label: 'Service name', kind: 'text', aliases: ['serviceName'] },
		period: { label: 'Period', kind: 'text' },
		tracking_number: { label: 'Tracking number', kind: 'text', aliases: ['trackingNumber'] },
		description: { label: 'Description', kind: 'textarea', span: 'full' },
		scope: { label: 'Scope', kind: 'textarea', span: 'full' },
		payment_terms: { label: 'Payment terms', kind: 'textarea', aliases: ['paymentTerms'], span: 'full' },
		line_items: { label: 'Line items', kind: 'textarea', aliases: ['lineItems', 'invoiceLineItems'], span: 'full' },
		reimbursement: { label: 'Reimbursement', kind: 'checkbox', defaultValue: false },
		business_trip: { label: 'Business trip', kind: 'checkbox', aliases: ['businessTrip'], defaultValue: false },
		date_start: { label: 'Start date', kind: 'date', aliases: ['dateStart'] },
		date_end: { label: 'End date', kind: 'date', aliases: ['dateEnd'] },
		days: { label: 'Days', kind: 'number' },
		daily_rate: { label: 'Daily rate', kind: 'number', aliases: ['dailyRate'] },
		invoice_type: {
			label: 'Invoice type',
			kind: 'select',
			defaultValue: 'standard',
			options: [
				{ value: 'standard', label: 'Standard' },
				{ value: 'zero_rate', label: 'Zero-rate' },
				{ value: 'tax_invoice', label: 'Tax invoice' }
			]
		},
		type: { label: 'Type', kind: 'text' },
		status: { label: 'Status', kind: 'text', defaultValue: 'active' },
		notes: { label: 'Notes', kind: 'textarea', span: 'full' }
	};

	const getInitialArtifact = () => initialArtifact;
	let artifact = $state<DocumentArtifactView>(getInitialArtifact());
	const getInitialCategoryId = () => artifact.suggestedCategoryId ?? categories[0]?.id ?? '';
	let selectedCategoryId = $state<string>(getInitialCategoryId());
	let categoryConfirmed = $state(false);
	let currentStep = $state<ReviewStep>('category');
	let isReclassifying = $state(false);
	let isConfirming = $state(false);
	let isAbandoning = $state(false);
	let actionError = $state<string | null>(null);
	let successMsg = $state<string | null>(null);
	let selectedProjectId = $state('');
	let projectOptions = $state<ProjectInfo[]>([]);
	let projectSearchQ = $state('');
	let projectSearchStatus = $state('active');
	let projectSearching = $state(false);
	let projectError = $state<string | null>(null);

	const selectedCategory = $derived(
		categories.find((c) => c.id === selectedCategoryId) ?? null
	);
	const fieldKeys = $derived(uniqueFields(selectedCategory));
	const editableFieldKeys = $derived(fieldKeys.filter((key) => key !== 'project_id' && key !== 'projectId'));
	const persistTarget = $derived(selectedCategory?.persistTarget ?? null);
	const isArchiveOnly = $derived(
		Boolean(persistTarget && persistTarget !== 'expenses' && persistTarget !== 'revenue')
	);
	const isReady = $derived(
		artifact.processingStatus === 'ready_for_review' ||
			artifact.processingStatus === 'ready_for_workflow'
	);
	const canReclassify = $derived(artifact.processingStatus === 'ready_for_review');
	const isConfirmed = $derived(artifact.processingStatus === 'confirmed');
	const isAbandoned = $derived(artifact.processingStatus === 'abandoned');
	const isClosed = $derived(isConfirmed || isAbandoned);
	const canAbandon = $derived(
		!isClosed &&
			[
				'ready_for_review',
				'ready_for_workflow',
				'needs_manual_review',
				'failed',
				// In-flight states — let the user interrupt a stuck pipeline.
				// Server's setStatusIfActive guards against the worker stomping
				// the abandoned state on the next stage boundary.
				'received',
				'stored',
				'text_extraction_pending',
				'text_extracted',
				'ocr_pending',
				'ocr_completed',
				'classification_pending',
				'classified',
				'fields_extraction_pending'
			].includes(artifact.processingStatus)
	);
	const categorySuggestions = $derived(categorySuggestionsFor(artifact));
	const selectedProject = $derived(projectOptions.find((p) => p.id === selectedProjectId) ?? null);
	const projectRequired = $derived(Boolean(selectedCategory?.requiresProject || isArchiveOnly));
	const canConfirm = $derived(
		isReady &&
			!isClosed &&
			categoryConfirmed &&
			currentStep === 'project' &&
			(!projectRequired || Boolean(selectedProjectId))
	);

	function uniqueFields(category: CategoryChoice | null): string[] {
		if (!category) return [];
		return [...new Set([...category.llmFields, ...category.userFields])];
	}

	/** Return the verbatim source quote for a given category field key, or null if unavailable.
	 *  Resolves via FIELD_META aliases (e.g. supplier_name → supplierName / counterpartyName). */
	function getFieldQuote(key: string): string | null {
		const quotes = (artifact.suggestedFields as Record<string, unknown> | null)?.sourceQuotes as
			| Record<string, string>
			| undefined;
		if (!quotes) return null;
		const meta = FIELD_META[key];
		const searchKeys = [key, ...(meta?.aliases ?? [])];
		for (const alias of searchKeys) {
			const q = quotes[alias];
			if (q) return q;
		}
		return null;
	}

	const CATEGORY_BY_DOCUMENT_TYPE: Record<string, string[]> = {
		supplier_invoice: ['expense.sales_cost.invoice'],
		customer_invoice: ['revenue.invoice_out'],
		receipt: [
			'expense.sales_cost.receipt',
			'expense.opex.meal',
			'expense.opex.transport',
			'expense.opex.accommodation',
			'expense.opex.ai_subscription',
			'expense.opex.others'
		],
		purchase_order: ['document_only.purchase_order'],
		contract: ['document_only.contract'],
		quotation: ['document_only.quotation']
	};

	function categorySuggestionsFor(a: DocumentArtifactView) {
		const seen = new Set<string>();
		const suggestions: Array<{ category: CategoryChoice; confidence?: number }> = [];
		const add = (id: string | undefined, confidence?: number) => {
			if (!id || seen.has(id)) return;
			const category = categories.find((c) => c.id === id);
			if (!category) return;
			seen.add(id);
			suggestions.push({ category, confidence });
		};
		add(a.suggestedCategoryId, a.classification?.confidence);
		for (const candidate of a.classification?.possibleTypes ?? []) {
			for (const id of CATEGORY_BY_DOCUMENT_TYPE[candidate.documentType] ?? []) {
				add(id, candidate.confidence);
			}
		}
		return suggestions.slice(0, 4);
	}

	function metaFor(key: string): FieldMeta {
		return FIELD_META[key] ?? {
			label: key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
			kind: 'text'
		};
	}

	function suggestedValue(a: DocumentArtifactView, key: string): unknown {
		const fields = (a.suggestedFields?.fields ?? {}) as Record<string, unknown>;
		const aliases = [key, ...(metaFor(key).aliases ?? [])];
		for (const alias of aliases) {
			if (fields[alias] !== undefined && fields[alias] !== null) return fields[alias];
		}
		return undefined;
	}

	function confidenceFor(a: DocumentArtifactView, key: string) {
		const confidence = a.suggestedFields?.confidence ?? {};
		const aliases = [key, ...(metaFor(key).aliases ?? [])];
		for (const alias of aliases) {
			if (confidence[alias] != null) return confidence[alias];
		}
		return undefined;
	}

	function defaultFor(key: string, category: CategoryChoice | null): string | boolean {
		if (key === 'reimbursement') {
			const id = category?.id ?? '';
			return id.includes('transport') || id.includes('meal') || id.includes('accommodation');
		}
		if (key === 'business_trip') return category?.id.includes('accommodation') ?? false;
		const meta = metaFor(key);
		if (meta.defaultValue !== undefined) return meta.defaultValue;
		return meta.kind === 'checkbox' ? false : '';
	}

	function initialDraftFor(a: DocumentArtifactView, category: CategoryChoice | null): Draft {
		const next: Draft = {};
		for (const key of uniqueFields(category)) {
			const meta = metaFor(key);
			const confidence = confidenceFor(a, key);
			const value = confidence != null && confidence < 0.5 ? undefined : suggestedValue(a, key);
			if (meta.kind === 'checkbox') {
				next[key] = typeof value === 'boolean' ? value : Boolean(defaultFor(key, category));
			} else if (Array.isArray(value)) {
				next[key] = value.map((item) => JSON.stringify(item)).join('\n');
			} else if (typeof value === 'number') {
				next[key] = String(value);
			} else if (typeof value === 'string') {
				next[key] = value;
			} else {
				next[key] = defaultFor(key, category) as string;
			}
		}
		return next;
	}

	const getInitialDraft = () => initialDraftFor(artifact, selectedCategory);
	const initialDraft = getInitialDraft();
	let draft = $state<Draft>(initialDraft);
	selectedProjectId = projectValueFromDraft(initialDraft);

	function stepToIndex(step: ReviewStep) {
		if (step === 'fields') return 1;
		if (step === 'project') return 2;
		return 0;
	}

	function indexToStep(index: number): ReviewStep {
		if (index === 1) return 'fields';
		if (index === 2) return 'project';
		return 'category';
	}

	function goToStep(step: ReviewStep) {
		currentStep = step;
		if (step !== 'category') categoryConfirmed = true;
		if (step === 'project' && projectOptions.length === 0) void searchProjects();
		if (panel.activeWorkflow?.workflowId === 'finance-inbox') {
			panel.setStep(stepToIndex(step));
		}
	}

	$effect(() => {
		const wf = panel.activeWorkflow;
		if (wf?.workflowId !== 'finance-inbox') return;
		const next = indexToStep(wf.stepIndex);
		if (next === currentStep) return;
		currentStep = next;
		if (next !== 'category') categoryConfirmed = true;
		if (next === 'project' && projectOptions.length === 0) void searchProjects();
	});

	function confidenceClass(key: string) {
		const c = confidenceFor(artifact, key);
		if (c == null) return 'border-slate-300';
		if (c >= 0.85) return 'border-emerald-300 bg-emerald-50/30';
		if (c >= 0.5) return 'border-amber-300 bg-amber-50/30';
		return 'border-slate-300';
	}

	function confidenceBadge(key: string) {
		const c = confidenceFor(artifact, key);
		if (c == null) return null;
		if (c >= 0.85) return { tone: 'text-emerald-700', label: 'high' };
		if (c >= 0.5) return { tone: 'text-amber-700', label: 'check' };
		return { tone: 'text-slate-400', label: 'low' };
	}

	function coerceValue(key: string, value: string | boolean): unknown {
		const meta = metaFor(key);
		if (meta.kind === 'checkbox') return Boolean(value);
		if (meta.kind === 'number') {
			const n = Number(value);
			return Number.isFinite(n) ? n : null;
		}
		return typeof value === 'string' ? value.trim() : value;
	}

	function payloadFields(): Record<string, unknown> {
		const fields: Record<string, unknown> = {};
		for (const key of fieldKeys) fields[key] = coerceValue(key, draft[key] ?? '');
		fields.project_id = selectedProjectId;
		return fields;
	}

	async function handleCategoryChange(newId: string) {
		if (newId === selectedCategoryId) return;
		const previousId = selectedCategoryId;
		selectedCategoryId = newId;
		categoryConfirmed = false;
		goToStep('category');
		isReclassifying = true;
		actionError = null;
		try {
			const res = await fetch(`/api/documents/${encodeURIComponent(artifact.id)}/reclassify`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ categoryId: newId })
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(err?.error ?? `Reclassify failed (${res.status})`);
			}
			const json = (await res.json()) as { data?: DocumentArtifactView };
			if (json.data) {
				artifact = json.data;
				selectedCategoryId = json.data.suggestedCategoryId ?? newId;
				const nextCategory = categories.find((c) => c.id === (json.data?.suggestedCategoryId ?? newId)) ?? null;
				draft = initialDraftFor(json.data, nextCategory);
				selectedProjectId = projectValueFromDraft(draft);
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Reclassify failed';
			selectedCategoryId = previousId;
			const previousCategory = categories.find((c) => c.id === previousId) ?? null;
			draft = initialDraftFor(artifact, previousCategory);
			selectedProjectId = projectValueFromDraft(draft);
		} finally {
			isReclassifying = false;
		}
	}

	function projectValueFromDraft(nextDraft: Draft) {
		const value = nextDraft.project_id ?? nextDraft.projectId;
		return typeof value === 'string' ? value : '';
	}

	function confirmCategory() {
		goToStep('fields');
	}

	function confirmFields() {
		goToStep('project');
	}

	async function searchProjects() {
		projectSearching = true;
		projectError = null;
		try {
			const params = new URLSearchParams();
			if (projectSearchQ.trim()) params.set('q', projectSearchQ.trim());
			if (projectSearchStatus) params.set('status', projectSearchStatus);
			const res = await fetch(`/api/projects?${params.toString()}`);
			const json = (await res.json().catch(() => null)) as {
				ok?: boolean;
				data?: Array<{
					project: {
						id: string;
						name: string;
						status: string;
						startDate: string | null;
						endDate: string | null;
					};
					customerName: string | null;
				}>;
				error?: string;
			} | null;
			if (!res.ok || !json?.ok || !json.data) {
				throw new Error(json?.error ?? `Project search failed (${res.status})`);
			}
			projectOptions = json.data.map((r) => ({
				id: r.project.id,
				name: r.project.name,
				customerName: r.customerName,
				status: r.project.status,
				startDate: r.project.startDate,
				endDate: r.project.endDate
			}));
			if (selectedProjectId && !projectOptions.some((p) => p.id === selectedProjectId)) {
				selectedProjectId = '';
			}
		} catch (err) {
			projectError = err instanceof Error ? err.message : 'Could not load projects';
		} finally {
			projectSearching = false;
		}
	}

	async function handleConfirm() {
		if (!selectedCategory) return;
		actionError = null;
		successMsg = null;
		isConfirming = true;

		const fields = payloadFields();
		const payload = {
			documentId: artifact.id,
			categoryId: selectedCategoryId,
			supplierId: null,
			poId: null,
			projectId: selectedProjectId || null,
			fields
		};

		try {
			const payloadHash = await hashConfirmationPayload(payload);
			const res = await fetch(`/api/documents/${encodeURIComponent(artifact.id)}/confirm`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ payload, payloadHash })
			});
			if (!res.ok) {
				const errBody = (await res.json().catch(() => null)) as
					| { error?: string; data?: { issues?: Array<{ field: string; message: string }> } }
					| null;
				const issues = errBody?.data?.issues
					?.map((i) => `${i.field}: ${i.message}`)
					.join('; ');
				throw new Error(errBody?.error ?? issues ?? `Confirm failed (${res.status})`);
			}
			const json = (await res.json()) as { data?: ConfirmResult };
			if (json.data) {
				successMsg = `Confirmed. Created ${json.data.categoryId} record.`;
				artifact = { ...artifact, processingStatus: 'confirmed' };
				await onConfirmed?.(json.data);
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Confirm failed';
		} finally {
			isConfirming = false;
		}
	}

	async function handleAbandon() {
		if (!canAbandon) return;
		const confirmed = window.confirm(
			'Abandon this intake?\n\nThis will remove the document from the active inbox.\nNo expense, revenue, or archive record will be created.\nThe uploaded file will be kept for retention and audit cleanup.'
		);
		if (!confirmed) return;

		actionError = null;
		successMsg = null;
		isAbandoning = true;
		try {
			const res = await fetch(`/api/documents/${encodeURIComponent(artifact.id)}/abandon`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ reason: 'User abandoned from inbox review.' })
			});
			if (!res.ok) {
				const err = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(err?.error ?? `Abandon failed (${res.status})`);
			}
			const json = (await res.json()) as { data?: DocumentArtifactView };
			if (json.data) {
				artifact = json.data;
				successMsg = 'Intake abandoned. No financial or archive record was created.';
				await onAbandoned?.(json.data);
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Abandon failed';
		} finally {
			isAbandoning = false;
		}
	}
</script>

<div class="space-y-4">
	{#if actionError}
		<div class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
			{actionError}
		</div>
	{/if}
	{#if successMsg}
		<div class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
			{successMsg}
		</div>
	{/if}

	<form
		class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
		onsubmit={(e) => {
			e.preventDefault();
			void handleConfirm();
		}}
	>
		{#if currentStep === 'category'}
			<section>
				<div class="flex items-center justify-between gap-3">
					<div>
						<h3 class="text-sm font-semibold text-slate-900">Confirm category</h3>
						<p class="text-xs text-slate-500">
							Start here. Suggested fields stay hidden until the document category is right.
						</p>
					</div>
					{#if isReclassifying}
						<span class="text-xs text-slate-500">Re-extracting...</span>
					{/if}
				</div>

				{#if categorySuggestions.length > 0}
					<div class="mt-4 grid gap-2">
						{#each categorySuggestions as suggestion}
							<button
								type="button"
								class="rounded-lg border px-3 py-2 text-left text-sm {selectedCategoryId === suggestion.category.id ? 'border-[var(--sf-green)] bg-emerald-50 text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}"
								style="--sf-green: #387234;"
								onclick={() => handleCategoryChange(suggestion.category.id)}
								disabled={isReclassifying || isConfirming || isAbandoning || isClosed || !canReclassify}
							>
								<span class="flex items-center justify-between gap-3">
									<span class="font-medium">{suggestion.category.label}</span>
									{#if suggestion.confidence != null}
										<span class="font-mono text-[11px] text-slate-500">{(suggestion.confidence * 100).toFixed(0)}%</span>
									{/if}
								</span>
								{#if suggestion.category.sublabel}
									<span class="mt-1 block text-xs text-slate-500">{suggestion.category.sublabel}</span>
								{/if}
							</button>
						{/each}
					</div>
				{/if}

				<label class="mt-4 block text-sm">
					<span class="font-medium text-slate-700">Choose another category</span>
					<select
						class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-[var(--sf-green)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)] disabled:bg-slate-50 disabled:text-slate-500"
						style="--sf-green: #387234;"
						value={selectedCategoryId}
						onchange={(e) => handleCategoryChange((e.currentTarget as HTMLSelectElement).value)}
						disabled={isReclassifying || isConfirming || isAbandoning || isClosed || !canReclassify}
					>
						{#each ['expense', 'revenue', 'document_only'] as bucket}
							<optgroup label={bucket === 'expense' ? 'Expense' : bucket === 'revenue' ? 'Revenue' : 'Archive only'}>
								{#each categories.filter((c) => c.bucket === bucket) as cat}
									<option value={cat.id}>{cat.label}{cat.sublabel ? ` - ${cat.sublabel}` : ''}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>

				{#if isArchiveOnly}
					<p class="mt-2 text-xs text-amber-700">
						Archive-only categories do not write to expenses/revenue yet.
					</p>
				{/if}

				<div class="mt-5 flex justify-end">
					<button
						type="button"
						class="inline-flex items-center rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--sf-green-dark)] disabled:opacity-50"
						style="--sf-green: #387234; --sf-green-dark: #2e5d2a;"
						onclick={confirmCategory}
						disabled={!selectedCategory || isReclassifying || isConfirming || isAbandoning || isClosed}
					>
						Category is correct
					</button>
				</div>
			</section>
		{:else if currentStep === 'fields'}
			<section class="mt-5">
				<h3 class="text-sm font-semibold text-slate-900">Check core fields</h3>
				<p class="text-xs text-slate-500">
					Fields are driven by the confirmed category. Low-confidence values are left blank.
				</p>

				<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
					{#each editableFieldKeys as key}
						{@const meta = metaFor(key)}
						<label class="block text-sm {meta.span === 'full' ? 'sm:col-span-2' : ''}">
							<span class="font-medium text-slate-700">{meta.label}</span>
							{#if confidenceBadge(key)}
								<span class="ml-1 text-[10px] {confidenceBadge(key)?.tone}">
									{confidenceBadge(key)?.label}
								</span>
							{/if}

							{#if meta.kind === 'checkbox'}
								<input
									type="checkbox"
									bind:checked={draft[key] as boolean}
									class="mt-2 h-4 w-4 rounded border-slate-300 text-[var(--sf-green)] focus:ring-[var(--sf-green)]"
									style="--sf-green: #387234;"
									disabled={isConfirming || isAbandoning || isClosed}
									onfocus={() => onFieldHighlight?.(getFieldQuote(key))}
									onblur={() => onFieldHighlight?.(null)}
								/>
							{:else if meta.kind === 'textarea'}
								<textarea
									bind:value={draft[key] as string}
									rows="3"
									class="mt-1 w-full rounded-md border px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 shadow-sm focus:border-[var(--sf-green)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)] disabled:bg-slate-50 disabled:text-slate-600 {confidenceClass(key)}"
									style="--sf-green: #387234;"
									disabled={isConfirming || isAbandoning || isClosed}
									onfocus={() => onFieldHighlight?.(getFieldQuote(key))}
									onblur={() => onFieldHighlight?.(null)}
								></textarea>
							{:else if meta.kind === 'select'}
								<select
									bind:value={draft[key] as string}
									class="mt-1 w-full rounded-md border px-3 py-2 text-sm text-slate-950 shadow-sm focus:border-[var(--sf-green)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)] disabled:bg-slate-50 disabled:text-slate-600 {confidenceClass(key)}"
									style="--sf-green: #387234;"
									disabled={isConfirming || isAbandoning || isClosed}
									onfocus={() => onFieldHighlight?.(getFieldQuote(key))}
									onblur={() => onFieldHighlight?.(null)}
								>
									{#each meta.options ?? [] as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							{:else}
								<input
									type={meta.kind === 'number' ? 'number' : meta.kind === 'date' ? 'date' : 'text'}
									step={meta.kind === 'number' ? '0.01' : undefined}
									bind:value={draft[key] as string}
									class="mt-1 w-full rounded-md border px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 shadow-sm focus:border-[var(--sf-green)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)] disabled:bg-slate-50 disabled:text-slate-600 {confidenceClass(key)}"
									style="--sf-green: #387234;"
									disabled={isConfirming || isAbandoning || isClosed}
									onfocus={() => onFieldHighlight?.(getFieldQuote(key))}
									onblur={() => onFieldHighlight?.(null)}
								/>
							{/if}
						</label>
					{/each}
				</div>

				<div class="mt-5 flex justify-between gap-2 border-t border-slate-100 pt-4">
					<button type="button" class="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onclick={() => goToStep('category')}>
						Back
					</button>
					<button type="button" class="inline-flex items-center rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--sf-green-dark)]" style="--sf-green: #387234; --sf-green-dark: #2e5d2a;" onclick={confirmFields}>
						Fields look right
					</button>
				</div>
			</section>
		{:else}
			<section class="mt-5">
				<h3 class="text-sm font-semibold text-slate-900">Link project</h3>
				<p class="text-xs text-slate-500">
					Choose the project by name. This replaces manual project ID entry.
				</p>

				<div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
					<label class="block text-sm">
						<span class="font-medium text-slate-700">Search project</span>
						<input
							class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 placeholder:text-slate-400 shadow-sm"
							placeholder="Project name, ID, or customer"
							bind:value={projectSearchQ}
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									void searchProjects();
								}
							}}
						/>
					</label>
					<label class="block text-sm">
						<span class="font-medium text-slate-700">Status</span>
						<select class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm" bind:value={projectSearchStatus}>
							<option value="">All</option>
							<option value="active">Active</option>
							<option value="on_hold">On hold</option>
							<option value="completed">Completed</option>
							<option value="archived">Archived</option>
						</select>
					</label>
					<button type="button" class="self-end rounded-md border border-[var(--sf-green)] bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" style="--sf-green: #387234;" onclick={() => void searchProjects()}>
						{projectSearching ? 'Searching...' : 'Search'}
					</button>
				</div>

				{#if projectError}
					<div class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{projectError}</div>
				{/if}

				<div class="mt-4">
					<label class="block text-sm">
						<span class="font-medium text-slate-700">Project</span>
						<select
							class="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm disabled:bg-slate-50 disabled:text-slate-500"
							bind:value={selectedProjectId}
							disabled={projectSearching || isConfirming || isAbandoning || isClosed}
						>
							<option value="">{projectRequired ? 'Select a project' : 'No project / company-level'}</option>
							{#each projectOptions as project (project.id)}
								<option value={project.id}>
									{project.name}{project.customerName ? ` - ${project.customerName}` : ''} ({project.status})
								</option>
							{/each}
						</select>
					</label>
					{#if selectedProject}
						<p class="mt-2 text-xs text-slate-500">
							Linked to <span class="font-medium text-slate-700">{selectedProject.name}</span>{selectedProject.customerName ? ` · ${selectedProject.customerName}` : ''}
						</p>
					{:else if projectRequired}
						<p class="mt-2 text-xs text-amber-700">This category requires a project before confirming.</p>
					{/if}
				</div>
			</section>
		{/if}

		<div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
			<button
				type="button"
				disabled={!canAbandon || isConfirming || isReclassifying || isAbandoning}
				class="inline-flex items-center rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
				onclick={() => void handleAbandon()}
			>
				{isAbandoning ? 'Abandoning...' : 'Abandon this intake'}
			</button>
			<div class="flex items-center justify-end gap-2">
				{#if cancelHref}
					<a
						href={cancelHref}
						class="inline-flex items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</a>
				{/if}
				<button
					type="submit"
					disabled={isConfirming || isReclassifying || isAbandoning || !canConfirm}
					class="inline-flex items-center gap-2 rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[var(--sf-green-dark)] disabled:opacity-50"
					style="--sf-green: #387234; --sf-green-dark: #2e5d2a;"
				>
					{#if isConfirming}
						Confirming...
					{:else if persistTarget === 'expenses'}
						Confirm & create expense
					{:else if persistTarget === 'revenue'}
						Confirm & create revenue
					{:else}
						Confirm
					{/if}
				</button>
			</div>
		</div>
	</form>
</div>
