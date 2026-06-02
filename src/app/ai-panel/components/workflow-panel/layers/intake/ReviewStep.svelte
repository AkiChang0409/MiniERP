<script lang="ts">
	import { Check, Pencil, Loader2, AlertTriangle, Sparkles, RefreshCcw } from 'lucide-svelte';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import FilePreview from './FilePreview.svelte';
	import {
		BUCKET_OPTIONS,
		getFieldSpecs,
		getKindOptions,
		resolveKindSelection,
		type Bucket,
		type FieldSpec
	} from '$modules/document-intake/schemas/intake-field-specs';

	type ProjectMatch = {
		id: string;
		name: string;
		customerName: string | null;
		score: number;
	};
	type ClassifyResult = {
		bucket: Bucket;
		docType: string;
		category: string | null;
		expenseType: 'opex' | 'sales_cost' | null;
		categoryDocType: 'invoice' | 'receipt' | 'po' | null;
		fields: Record<string, unknown>;
		projectMatches: ProjectMatch[];
		narration: string;
	};

	const wfState = $derived((panel.activeWorkflow?.state as Record<string, unknown>) ?? {});
	const classifyResult = $derived(wfState.classifyResult as ClassifyResult | undefined);

	// Current selections (pulled from state, seeded from AI picks if absent).
	const selectedBucket = $derived<Bucket>(
		(wfState.selectedBucket as Bucket | undefined) ?? classifyResult?.bucket ?? 'expense'
	);
	const selectedKind = $derived<string | null>(
		(wfState.selectedKind as string | undefined) ??
			(classifyResult ? inferKindFromClassify(selectedBucket, classifyResult) : null)
	);
	const selectedProjectId = $derived<string | null>(
		(wfState.selectedProjectId as string | null | undefined) ?? null
	);

	const fileKey = $derived(wfState.fileKey as string | undefined);
	const fileName = $derived(wfState.fileName as string | undefined);
	const fileType = $derived(wfState.fileType as string | undefined);
	const processedImageUrl = $derived(wfState.processedImageUrl as string | undefined);

	const mode = $derived(panel.mode);

	function inferKindFromClassify(bucket: Bucket, r: ClassifyResult): string {
		if (bucket === 'revenue') return 'invoice_out';
		if (bucket === 'expense') return r.category ?? 'others';
		return r.docType;
	}

	// The resolved doctype/category triple for save + field rendering.
	const resolved = $derived(
		selectedKind
			? resolveKindSelection(selectedBucket, selectedKind)
			: { docType: 'other', category: null, expenseType: null, docTypeForDocs: null }
	);

	const specs = $derived(
		getFieldSpecs({
			bucket: selectedBucket,
			docType: resolved.docType,
			category: resolved.category,
			expenseType: resolved.expenseType
		})
	);

	// Form values �?initialised from classifyResult.fields, then mutated by user.
	let values = $state<Record<string, string | number | boolean>>({});
	let initialisedFor = $state<string>('');

	$effect(() => {
		if (!classifyResult) return;
		// Re-seed when specs change (bucket/kind switch mid-review).
		const seedKey = `${selectedBucket}:${resolved.docType}:${resolved.category ?? ''}`;
		if (initialisedFor === seedKey) return;
		const seed: Record<string, string | number | boolean> = {};
		for (const spec of specs) {
			const prior = values[spec.id];
			const incoming = classifyResult.fields[spec.id];
			// Preserve user's edits across spec changes when the key still exists
			if (prior !== undefined && prior !== '' && initialisedFor !== '') {
				seed[spec.id] = prior;
				continue;
			}
			if (spec.type === 'boolean') {
				seed[spec.id] =
					typeof incoming === 'boolean'
						? incoming
						: typeof spec.defaultValue === 'boolean'
							? spec.defaultValue
							: false;
			} else if (spec.type === 'number') {
				seed[spec.id] = typeof incoming === 'number' ? incoming : '';
			} else {
				seed[spec.id] =
					typeof incoming === 'string'
						? incoming
						: incoming == null
							? typeof spec.defaultValue === 'string'
								? spec.defaultValue
								: ''
							: String(incoming);
			}
		}
		values = seed;
		initialisedFor = seedKey;
	});

	function setValue(id: string, v: string | number | boolean) {
		values = { ...values, [id]: v };
	}

	function hasOcrValue(spec: FieldSpec): boolean {
		if (!classifyResult) return false;
		const v = classifyResult.fields[spec.id];
		return v !== null && v !== undefined && v !== '';
	}

	// -------------------------------------------------------------------
	// Top pill row �?"Bucket · Kind · Project" as editable chips. Tapping
	// any pill jumps back to the relevant step via panel.setStep.
	// -------------------------------------------------------------------
	const bucketLabel = $derived(
		BUCKET_OPTIONS.find((o) => o.id === selectedBucket)?.label ?? 'Expense'
	);
	const kindLabel = $derived.by(() => {
		if (!selectedKind) return '-';
		const opts = getKindOptions(selectedBucket);
		return opts.find((o) => o.id === selectedKind)?.label ?? selectedKind;
	});
	const projectLabel = $derived.by(() => {
		if (selectedProjectId === null) return 'Company overhead';
		const all = [
			...(classifyResult?.projectMatches ?? []),
			...(wfState.extraProjectMatch ? [wfState.extraProjectMatch as ProjectMatch] : [])
		];
		return all.find((p) => p.id === selectedProjectId)?.name ?? selectedProjectId ?? 'No project';
	});

	function editBucket() {
		panel.setStep(2);
	}
	function editKind() {
		panel.setStep(3);
	}
	function editProject() {
		panel.setStep(4);
	}

	// -------------------------------------------------------------------
	// Re-check �?forces a re-run of extraction + narration under the
	// user's currently-selected bucket/kind. Useful when the first-pass
	// classifier picked the wrong kind and the user wants the downstream
	// data to reflect their override.
	// -------------------------------------------------------------------
	let recheckStage = $state<'idle' | 'running' | 'error'>('idle');
	let recheckError = $state('');

	async function onRecheck() {
		if (!classifyResult || !selectedKind) return;
		recheckStage = 'running';
		recheckError = '';
		try {
			const rawText = wfState.rawText as string | undefined;
			const fileName = wfState.fileName as string | undefined;
			const res = await fetch('/api/intake/reclassify', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					rawText,
					fileName,
					bucket: selectedBucket,
					kind: selectedKind,
					projectId: selectedProjectId
				})
			});
			const json = (await res.json()) as {
				ok?: boolean;
				data?: typeof classifyResult;
				error?: string;
			};
			if (!res.ok || !json.ok || !json.data) {
				throw new Error(json.error ?? `Re-check failed (${res.status})`);
			}
			// Overwrite classifyResult so narration + fields refresh. Force
			// a re-seed by resetting initialisedFor.
			panel.patchState({ classifyResult: json.data });
			initialisedFor = '';
			recheckStage = 'idle';
		} catch (e) {
			recheckError = e instanceof Error ? e.message : 'Re-check failed';
			recheckStage = 'error';
			// Auto-clear error after 3s so it doesn't stick around.
			setTimeout(() => {
				if (recheckStage === 'error') {
					recheckStage = 'idle';
					recheckError = '';
				}
			}, 3000);
		}
	}

	// -------------------------------------------------------------------
	// Save flow �?inline states on this step.
	// -------------------------------------------------------------------
	let saveStage = $state<'idle' | 'saving' | 'done' | 'error'>('idle');
	let saveError = $state('');
	let saveMessage = $state('');

	async function onSave() {
		if (!classifyResult) return;
		saveStage = 'saving';
		saveError = '';
		try {
			const res = await fetch('/api/intake/save', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					fileKey,
					fileName,
					fileType,
					bucket: selectedBucket,
					docType: resolved.docType,
					category: resolved.category,
					expenseType: resolved.expenseType,
					categoryDocType: resolved.docTypeForDocs,
					fields: values,
					projectId: selectedProjectId
				})
			});
			const json = (await res.json()) as {
				ok?: boolean;
				data?: { message?: string };
				error?: string;
			};
			if (!res.ok || !json.ok) {
				throw new Error(json.error ?? `Save failed (${res.status})`);
			}
			saveMessage = json.data?.message ?? 'Saved.';
			saveStage = 'done';
		} catch (e) {
			saveError = e instanceof Error ? e.message : 'Save failed';
			saveStage = 'error';
		}
	}

	function onBackToToday() {
		panel.endWorkflow();
	}

	function onAnother() {
		const hintDocType = wfState.hintDocType;
		panel.endWorkflow();
		setTimeout(() => {
			panel.startWorkflow(
				'document-intake',
				typeof hintDocType === 'string' ? { docType: hintDocType } : undefined
			);
		}, 60);
	}

	function onBackToProject() {
		panel.setStep(4);
	}
</script>

{#if classifyResult}
	<div class="review-cockpit" class:is-full={mode === 'full'} class:is-half={mode === 'half'}>
		<!-- ============ LEFT / MAIN: form ============ -->
		<div class="review-main">
			<!-- Narration + re-check -->
			<div class="narration">
				<span class="narration-dot"></span>
				<span class="narration-eyebrow">Review</span>
				<span class="narration-text">{classifyResult.narration}</span>
				<button
					type="button"
					class="recheck-btn"
					class:is-running={recheckStage === 'running'}
					class:is-err={recheckStage === 'error'}
					onclick={onRecheck}
					disabled={recheckStage === 'running'}
					title={recheckStage === 'error'
						? recheckError
						: 'Re-run extraction with your current kind as the hint'}
				>
					{#if recheckStage === 'running'}
						<Loader2 size={11} strokeWidth={2} class="recheck-spin" />
						<span>Re-checking...</span>
					{:else if recheckStage === 'error'}
						<AlertTriangle size={11} strokeWidth={2} />
						<span>Retry</span>
					{:else}
						<RefreshCcw size={11} strokeWidth={2} />
						<span>Re-check</span>
					{/if}
				</button>
			</div>

			<!-- Edit pills �?tap to jump back to that step -->
			<div class="pill-row">
				<button type="button" class="pill" onclick={editBucket}>
					<span class="pill-label">Where</span>
					<span class="pill-value">{bucketLabel}</span>
					<Pencil size={10} strokeWidth={2} class="pill-edit" />
				</button>
				<button type="button" class="pill" onclick={editKind}>
					<span class="pill-label">Kind</span>
					<span class="pill-value">{kindLabel}</span>
					<Pencil size={10} strokeWidth={2} class="pill-edit" />
				</button>
				<button type="button" class="pill" onclick={editProject}>
					<span class="pill-label">Project</span>
					<span class="pill-value">{projectLabel}</span>
					<Pencil size={10} strokeWidth={2} class="pill-edit" />
				</button>
			</div>

			<!-- Half-mode: preview collapses above fields -->
			{#if mode === 'half'}
				<div class="preview-half-wrap">
					<FilePreview {fileKey} {fileName} {fileType} {processedImageUrl} collapsible />
				</div>
			{/if}

			<!-- Field form -->
			<div class="fields">
				{#each specs as spec (spec.id)}
					<label
						class="field"
						class:is-wide={spec.type === 'textarea'}
						class:is-bool={spec.type === 'boolean'}
					>
						<span class="field-label">
							<span>{spec.label}</span>
							{#if spec.required}<span class="req">*</span>{/if}
							{#if hasOcrValue(spec) && spec.type !== 'boolean'}
								<span class="ocr-tag" title="Pre-filled from OCR">
									<Sparkles size={9} strokeWidth={2.2} />
								</span>
							{/if}
						</span>

						{#if spec.type === 'text'}
							<input
								type="text"
								class="field-input"
								value={(values[spec.id] as string) ?? ''}
								oninput={(e) =>
									setValue(spec.id, (e.currentTarget as HTMLInputElement).value)}
								disabled={saveStage !== 'idle' && saveStage !== 'error'}
							/>
						{:else if spec.type === 'number'}
							<input
								type="number"
								class="field-input num"
								step="0.01"
								value={values[spec.id] === '' ? '' : (values[spec.id] as number | '')}
								oninput={(e) => {
									const v = (e.currentTarget as HTMLInputElement).value;
									setValue(spec.id, v === '' ? '' : Number(v));
								}}
								disabled={saveStage !== 'idle' && saveStage !== 'error'}
							/>
						{:else if spec.type === 'date'}
							<input
								type="date"
								class="field-input"
								value={(values[spec.id] as string) ?? ''}
								oninput={(e) =>
									setValue(spec.id, (e.currentTarget as HTMLInputElement).value)}
								disabled={saveStage !== 'idle' && saveStage !== 'error'}
							/>
						{:else if spec.type === 'select'}
							<!-- Select fields become chip rows �?vision §5.2 everywhere. -->
							<div class="select-chips">
								{#each spec.options ?? [] as opt (opt)}
									<button
										type="button"
										class="select-chip"
										class:is-on={(values[spec.id] as string) === opt}
										onclick={() => setValue(spec.id, opt)}
										disabled={saveStage !== 'idle' && saveStage !== 'error'}
									>
										{opt}
									</button>
								{/each}
							</div>
						{:else if spec.type === 'textarea'}
							<textarea
								class="field-input is-textarea"
								rows="2"
								value={(values[spec.id] as string) ?? ''}
								oninput={(e) =>
									setValue(spec.id, (e.currentTarget as HTMLTextAreaElement).value)}
								disabled={saveStage !== 'idle' && saveStage !== 'error'}
							></textarea>
						{:else if spec.type === 'boolean'}
							<button
								type="button"
								class="field-toggle"
								class:is-on={values[spec.id] === true}
								onclick={() => setValue(spec.id, !values[spec.id])}
								disabled={saveStage !== 'idle' && saveStage !== 'error'}
							>
								<span class="toggle-dot"></span>
								<span class="toggle-state">
									{values[spec.id] === true ? 'Yes' : 'No'}
								</span>
							</button>
						{/if}
					</label>
				{/each}
			</div>

			<!-- Save bar -->
			<div class="save-bar" class:is-done={saveStage === 'done'} class:is-err={saveStage === 'error'}>
				{#if saveStage === 'idle'}
					<button type="button" class="btn-ghost" onclick={onBackToProject}>Back</button>
					<button type="button" class="btn-save" onclick={onSave}>
						Save it -></button>
				{:else if saveStage === 'saving'}
					<div class="save-feedback">
						<span class="save-spinner" aria-hidden="true">
							<Loader2 size={16} strokeWidth={1.8} />
						</span>
						<span>Writing to books...</span>
					</div>
				{:else if saveStage === 'done'}
					<div class="save-feedback save-done">
						<span class="check-ring" aria-hidden="true">
							<Check size={14} strokeWidth={2.4} />
						</span>
						<span>{saveMessage}</span>
					</div>
					<div class="save-actions">
						<button type="button" class="btn-ghost" onclick={onBackToToday}>Back to today</button>
						<button type="button" class="btn-save" onclick={onAnother}>Another one</button>
					</div>
				{:else}
					<div class="save-feedback save-err">
						<span class="err-ring" aria-hidden="true">
							<AlertTriangle size={14} strokeWidth={2} />
						</span>
						<span>{saveError}</span>
					</div>
					<button type="button" class="btn-save" onclick={onSave}>Try again</button>
				{/if}
			</div>
		</div>

		<!-- ============ RIGHT: preview (full-mode only) ============ -->
		{#if mode === 'full'}
			<aside class="review-aside">
				<FilePreview {fileKey} {fileName} {fileType} {processedImageUrl} />
			</aside>
		{/if}
	</div>
{/if}

<style>
	.review-cockpit {
		display: flex;
		flex-direction: row;
		gap: 18px;
		min-height: 0;
	}
	.review-cockpit.is-half {
		flex-direction: column;
	}

	.review-main {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.review-aside {
		flex: 0 0 auto;
		width: min(42%, 440px);
		min-height: 420px;
		display: flex;
		flex-direction: column;
	}
	.review-aside :global(.preview) {
		flex: 1 1 auto;
	}

	.preview-half-wrap {
		margin-top: -4px;
	}
	.preview-half-wrap :global(.preview) {
		max-height: 240px;
	}

	/* ---------------- Narration ---------------- */
	.narration {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		background: var(--panel-surface);
		border: 1px solid var(--panel-border);
		border-radius: 12px;
		font-size: 13px;
	}
	.narration-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--panel-gold);
		box-shadow: 0 0 8px var(--panel-gold-glow);
		flex-shrink: 0;
	}
	.narration-eyebrow {
		flex-shrink: 0;
		font-size: 10px;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--panel-gold);
	}
	.narration-text {
		flex: 1;
		color: var(--panel-fg-muted);
		line-height: 1.45;
	}

	.recheck-btn {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		background: transparent;
		border: 1px solid var(--panel-border-strong);
		border-radius: 999px;
		color: var(--panel-fg-muted);
		font-family: inherit;
		font-size: 11px;
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.recheck-btn:hover:not(:disabled) {
		color: var(--panel-gold-bright);
		border-color: var(--panel-gold);
		background: rgba(234, 188, 60, 0.04);
	}
	.recheck-btn:disabled {
		cursor: progress;
		opacity: 0.85;
	}
	.recheck-btn.is-running {
		color: var(--panel-gold);
		border-color: var(--panel-gold);
	}
	.recheck-btn.is-err {
		color: var(--panel-danger);
		border-color: rgba(225, 118, 118, 0.4);
	}
	.recheck-btn :global(.recheck-spin) {
		animation: spin 0.9s linear infinite;
	}

	/* ---------------- Edit pills ---------------- */
	.pill-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 7px 12px;
		background: var(--panel-surface);
		border: 1px solid var(--panel-border);
		border-radius: 999px;
		color: var(--panel-fg);
		font-family: inherit;
		font-size: 11.5px;
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.pill:hover {
		border-color: var(--panel-gold);
		background: var(--panel-surface-raised);
	}
	.pill-label {
		font-size: 10px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--panel-fg-muted);
	}
	.pill-value {
		font-weight: 500;
		color: var(--panel-fg);
	}
	.pill :global(.pill-edit) {
		color: var(--panel-fg-faint);
		transition: color var(--panel-dur-fast) var(--panel-ease);
	}
	.pill:hover :global(.pill-edit) {
		color: var(--panel-gold);
	}

	/* ---------------- Fields ---------------- */
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 14px 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.field.is-wide {
		grid-column: 1 / -1;
	}

	.field-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11.5px;
		font-weight: 500;
		letter-spacing: 0.04em;
		color: var(--panel-fg-muted);
	}
	.field-label .req {
		color: var(--panel-danger);
	}
	.ocr-tag {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		background: var(--panel-gold);
		border-radius: 4px;
		color: #2d1f08;
	}

	.field-input {
		padding: 9px 12px;
		background: var(--panel-surface-deep);
		border: 1px solid var(--panel-border);
		border-radius: 10px;
		color: var(--panel-fg);
		font-family: inherit;
		font-size: 13px;
		outline: none;
		transition:
			border-color var(--panel-dur-fast) var(--panel-ease),
			box-shadow var(--panel-dur-fast) var(--panel-ease);
	}
	.field-input:focus {
		border-color: var(--panel-gold);
		box-shadow: 0 0 0 3px rgba(234, 188, 60, 0.08);
	}
	.field-input:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.field-input.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.field-input.is-textarea {
		resize: vertical;
		min-height: 60px;
	}

	.select-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.select-chip {
		padding: 6px 11px;
		background: var(--panel-surface-deep);
		border: 1px solid var(--panel-border);
		border-radius: 999px;
		color: var(--panel-fg-muted);
		font-family: inherit;
		font-size: 11.5px;
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.select-chip:hover {
		border-color: var(--panel-border-strong);
		color: var(--panel-fg);
	}
	.select-chip.is-on {
		background: rgba(234, 188, 60, 0.12);
		border-color: var(--panel-gold);
		color: var(--panel-gold-bright);
	}
	.select-chip:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.field-toggle {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px 8px 8px;
		background: var(--panel-surface-deep);
		border: 1px solid var(--panel-border);
		border-radius: 999px;
		color: var(--panel-fg-muted);
		font-family: inherit;
		font-size: 12.5px;
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
		align-self: flex-start;
	}
	.toggle-dot {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--panel-fg-faint);
		transition: background var(--panel-dur-fast) var(--panel-ease);
	}
	.field-toggle.is-on {
		background: rgba(234, 188, 60, 0.1);
		border-color: var(--panel-gold);
		color: var(--panel-gold-bright);
	}
	.field-toggle.is-on .toggle-dot {
		background: var(--panel-gold);
		box-shadow: 0 0 10px -1px var(--panel-gold-glow);
	}
	.field-toggle:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	/* ---------------- Save bar ---------------- */
	.save-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px;
		margin-top: 6px;
		background: var(--panel-surface);
		border: 1px solid var(--panel-border);
		border-radius: 12px;
		transition:
			background var(--panel-dur-base) var(--panel-ease),
			border-color var(--panel-dur-base) var(--panel-ease);
	}
	.save-bar.is-done {
		background: rgba(95, 181, 94, 0.06);
		border-color: rgba(95, 181, 94, 0.3);
	}
	.save-bar.is-err {
		background: rgba(225, 118, 118, 0.06);
		border-color: rgba(225, 118, 118, 0.3);
	}

	.save-feedback {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: var(--panel-fg);
	}
	.save-spinner {
		display: inline-flex;
		color: var(--panel-gold);
	}
	.save-spinner :global(svg) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.save-done .check-ring {
		display: inline-flex;
		width: 24px;
		height: 24px;
		align-items: center;
		justify-content: center;
		background: var(--panel-green);
		color: #0c1a09;
		border-radius: 50%;
		box-shadow: 0 0 10px -2px rgba(95, 181, 94, 0.5);
	}
	.save-err .err-ring {
		display: inline-flex;
		width: 24px;
		height: 24px;
		align-items: center;
		justify-content: center;
		background: rgba(225, 118, 118, 0.2);
		border: 1px solid rgba(225, 118, 118, 0.5);
		border-radius: 50%;
		color: var(--panel-danger);
	}
	.save-actions {
		display: inline-flex;
		gap: 10px;
	}

	.btn-ghost {
		padding: 9px 14px;
		background: transparent;
		border: 1px solid var(--panel-border-strong);
		border-radius: 10px;
		color: var(--panel-fg-muted);
		font-family: inherit;
		font-size: 12.5px;
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.btn-ghost:hover {
		color: var(--panel-gold-bright);
		border-color: var(--panel-gold);
	}
	.btn-save {
		padding: 10px 20px;
		background: var(--panel-gold);
		border: 1px solid var(--panel-gold-bright);
		border-radius: 10px;
		color: #2d1f08;
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		box-shadow: 0 0 18px -4px var(--panel-gold-glow);
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.btn-save:hover {
		background: var(--panel-gold-bright);
		transform: translateY(-1px);
	}
</style>
