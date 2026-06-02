<script lang="ts">
	import { UploadCloud, FileText, Loader2, AlertTriangle } from 'lucide-svelte';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import {
		advanceWorkflow,
		startVendorInvoiceWorkflow,
		uploadDocument,
		type DocumentProcessingStatus
	} from '$app-layer/ai-panel/workflow/finance-workflow-api';
	import { preprocessImageForOcr } from '$lib/utils/preprocess-image';

	type Stage = 'idle' | 'storing' | 'extracting' | 'wiring' | 'error';

	let fileInput: HTMLInputElement | null = $state(null);
	let dragOver = $state(false);
	let stage = $state<Stage>('idle');
	let fileName = $state('');
	let error = $state('');

	const TERMINAL_BAD: DocumentProcessingStatus[] = ['needs_manual_review', 'failed'];

	async function onFile(file: File) {
		if (!file) return;
		fileName = file.name;
		error = '';
		stage = 'storing';

		try {
			// 1. Real upload to /api/documents �?server stores the blob,
			// extracts text, classifies, and returns the artifact view.
			// Only TIFF / BMP need a client-side re-encode to JPEG (OpenAI
			// Vision can't decode them). JPEG/PNG/WebP/GIF and PDFs upload
			// as-is. For TIFF/BMP we use the lightweight `'convert'` mode —
			// decode → resize → JPEG, no OpenCV warp / unsharp — so we never
			// touch the 10 MB WASM bundle on the upload critical path.
			stage = 'extracting';
			const mime = (file.type || '').toLowerCase();
			const needsClientReencode =
				/\.(tiff?|bmp)$/i.test(file.name) || /^image\/(tiff?|bmp|x-bmp)$/i.test(mime);
			const uploadFile = needsClientReencode
				? await preprocessImageForOcr(file, undefined, { mode: 'convert' }).catch(() => file)
				: file;
			const artifact = await uploadDocument(uploadFile, { uploadedFrom: 'ai_panel' });

			if (TERMINAL_BAD.includes(artifact.processingStatus)) {
				const why =
					artifact.textExtraction?.error?.message ??
					(artifact.processingStatus === 'needs_manual_review'
						? 'I could read the file but the text was too thin to use confidently.'
						: 'Something went wrong while reading the file.');
				error = why;
				stage = 'error';
				return;
			}

			// 2. Start (or reuse) the finance workflow.
			const wfState = (panel.activeWorkflow?.state as Record<string, unknown> | undefined) ?? {};
			let serverWorkflowId = wfState.serverWorkflowId as string | undefined;

			if (!serverWorkflowId) {
				const started = await startVendorInvoiceWorkflow({
					source: 'quick_action',
					intentHint: wfState.hintDocType as string | undefined
				});
				serverWorkflowId = started.workflowId;
				panel.patchState({ serverWorkflowId, serverStep: started.currentStep });
			}

			// 3. Hand the real artifact id to the workflow.
			stage = 'wiring';
			const advance = await advanceWorkflow(serverWorkflowId, {
				targetStep: 'document_intake',
				payload: { documentId: artifact.id, fileName: file.name }
			});

			panel.patchState({
				documentId: artifact.id,
				documentArtifactId: artifact.id,
				documentArtifactStatus: artifact.processingStatus,
				documentClassification: artifact.classification,
				fileName: file.name,
				fileSize: file.size,
				serverStep: advance.currentStep
			});

			panel.advanceStep();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start the workflow.';
			stage = 'error';
		}
	}

	function onInputChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void onFile(file);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) void onFile(file);
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}

	function onBrowseClick() {
		fileInput?.click();
	}

	function onRetry() {
		stage = 'idle';
		error = '';
		fileName = '';
	}
</script>

<div class="intake-drop">
	<button
		type="button"
		class="drop-area"
		class:is-dragging={dragOver}
		class:is-busy={stage === 'storing' || stage === 'extracting' || stage === 'wiring'}
		class:is-error={stage === 'error'}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={stage === 'error' ? onRetry : onBrowseClick}
		disabled={stage === 'storing' || stage === 'extracting' || stage === 'wiring'}
	>
		<span class="drop-glow" aria-hidden="true"></span>

		<span class="drop-icon">
			{#if stage === 'storing' || stage === 'extracting' || stage === 'wiring'}
				<Loader2 size={30} strokeWidth={1.6} />
			{:else if stage === 'error'}
				<AlertTriangle size={30} strokeWidth={1.6} />
			{:else if fileName}
				<FileText size={30} strokeWidth={1.6} />
			{:else}
				<UploadCloud size={30} strokeWidth={1.6} />
			{/if}
		</span>

		<span class="drop-heading">
			{#if stage === 'storing'}
				Storing {fileName}�?			{:else if stage === 'extracting'}
				Reading {fileName}�?			{:else if stage === 'wiring'}
				Wiring it into the workflow�?			{:else if stage === 'error'}
				Couldn't start
			{:else}
				Drop the supplier invoice here
			{/if}
		</span>

		<span class="drop-sub">
			{#if stage === 'error'}
				{error}
			{:else}
				PDF or photo. I'll extract the supplier, amount, GST, and look for a matching PO.
			{/if}
		</span>

		<span class="drop-footnote">
			{#if stage === 'idle' && !fileName}
				Click or drop �?real OCR + classify, then finance agent
			{:else if stage === 'storing'}
				Stashing in object storage
			{:else if stage === 'extracting'}
				OCR + document classification
			{:else if stage === 'wiring'}
				Handing off to vendor invoice intake
			{/if}
		</span>
	</button>

	<input
		bind:this={fileInput}
		type="file"
		accept="application/pdf,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff"
		onchange={onInputChange}
		hidden
	/>
</div>

<style>
	.intake-drop {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.drop-area {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 48px 28px 42px;
		background: var(--panel-surface);
		border: 1.5px dashed rgba(234, 188, 60, 0.28);
		border-radius: 20px;
		color: inherit;
		font-family: inherit;
		cursor: pointer;
		overflow: hidden;
		text-align: center;
		transition:
			transform var(--panel-dur-fast) var(--panel-ease),
			border-color var(--panel-dur-fast) var(--panel-ease),
			background var(--panel-dur-fast) var(--panel-ease),
			box-shadow var(--panel-dur-fast) var(--panel-ease);
	}
	.drop-area:hover:not(.is-busy) {
		transform: translateY(-1px);
		border-color: var(--panel-gold);
		background: var(--panel-surface-raised);
		box-shadow: 0 0 28px -6px var(--panel-gold-glow);
	}
	.drop-area.is-dragging {
		border-color: var(--panel-gold-bright);
		background: var(--panel-surface-raised);
		box-shadow: 0 0 40px -4px var(--panel-gold-glow);
	}
	.drop-area.is-busy {
		cursor: progress;
		border-color: var(--panel-gold);
	}
	.drop-area.is-error {
		border-color: rgba(225, 118, 118, 0.45);
		background: rgba(225, 118, 118, 0.04);
	}

	.drop-glow {
		position: absolute;
		inset: -30% -30% auto auto;
		width: 70%;
		height: 90%;
		background: radial-gradient(circle, var(--panel-gold-soft), transparent 60%);
		pointer-events: none;
	}

	.drop-icon {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		margin-bottom: 10px;
		color: var(--panel-gold-bright);
		background: rgba(234, 188, 60, 0.08);
		border: 1px solid rgba(234, 188, 60, 0.24);
		border-radius: 18px;
		box-shadow: 0 0 28px -4px var(--panel-gold-glow);
	}
	.drop-area.is-busy .drop-icon :global(svg) {
		animation: spin 1.1s linear infinite;
	}
	.drop-area.is-error .drop-icon {
		color: var(--panel-danger);
		background: rgba(225, 118, 118, 0.08);
		border-color: rgba(225, 118, 118, 0.3);
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.drop-heading {
		position: relative;
		font-size: clamp(18px, 2.1vw, 22px);
		font-weight: 500;
		color: var(--panel-fg);
		letter-spacing: -0.005em;
	}
	.drop-sub {
		position: relative;
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--panel-fg-muted);
		max-width: 46ch;
	}
	.drop-footnote {
		position: relative;
		margin-top: 8px;
		font-size: 11px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--panel-fg-faint);
	}
</style>
