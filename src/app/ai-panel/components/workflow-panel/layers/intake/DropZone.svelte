<script lang="ts">
	import { onMount } from 'svelte';
	import { UploadCloud, FileText, Loader2, AlertTriangle } from 'lucide-svelte';
	import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import { preprocessImageForOcr } from '$lib/utils/preprocess-image';

	let fileInput: HTMLInputElement | null = $state(null);
	let dragOver = $state(false);
	let stage = $state<'idle' | 'reading' | 'uploading' | 'error'>('idle');
	let fileName = $state('');
	let error = $state('');

	// ---------------------------------------------------------------------------
	// Client-side text extraction �?pdfjs for PDF, server-side vision for image.
	// Same pattern as finance/doc-hub/upload/project/+page.svelte; kept inline
	// because Phase 1B only needs it in this one place (先具体后抽象).
	// ---------------------------------------------------------------------------
	type PdfJs = typeof import('pdfjs-dist');
	let _pdfJsCache: PdfJs | null = null;

	async function loadPdfJs(): Promise<PdfJs> {
		if (_pdfJsCache) return _pdfJsCache;
		const lib = await import('pdfjs-dist');
		lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
		_pdfJsCache = lib;
		return lib;
	}

	async function extractPdfText(file: File): Promise<string> {
		const pdfjs = await loadPdfJs();
		const data = new Uint8Array(await file.arrayBuffer());
		const pdf = await Promise.race([
			pdfjs.getDocument({ data }).promise,
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('PDF parse timeout')), 15000)
			)
		]);
		const maxPages = Math.min(pdf.numPages, 8);
		const chunks: string[] = [];
		for (let i = 1; i <= maxPages; i++) {
			const page = await pdf.getPage(i);
			const content = await page.getTextContent();
			const line = content.items
				.map((item) => ('str' in item ? item.str : ''))
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
			if (line) chunks.push(line);
		}
		return chunks.join('\n').trim();
	}

	async function renderPdfFirstPageJpeg(file: File): Promise<Blob | null> {
		try {
			const pdfjs = await loadPdfJs();
			const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
				.promise;
			if (pdf.numPages < 1) return null;
			const page = await pdf.getPage(1);
			const base = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({
				scale: Math.min(2.5, 1600 / Math.max(base.width, 1))
			});
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			await page.render({ canvasContext: ctx, viewport, canvas }).promise;
			return await new Promise((resolve) =>
				canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88)
			);
		} catch {
			return null;
		}
	}

	async function runWorkersVision(blob: Blob, name: string): Promise<string> {
		const fd = new FormData();
		fd.append('file', blob, name);
		const res = await fetch('/api/ocr/workers-vision', { method: 'POST', body: fd });
		const payload = (await res.json()) as {
			ok?: boolean;
			data?: { text?: string };
			error?: string;
		};
		if (!res.ok || !payload.ok || typeof payload.data?.text !== 'string') {
			throw new Error(payload.error ?? `Vision OCR failed (${res.status})`);
		}
		return payload.data.text;
	}

	async function extractRawText(file: File): Promise<{ rawText: string; processed?: File }> {
		const mime = file.type.toLowerCase();
		const name = file.name.toLowerCase();
		const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
		const isImage =
			mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name);

		if (isImage) {
			const processed = await preprocessImageForOcr(file);
			const rawText = await runWorkersVision(processed, processed.name);
			return { rawText, processed };
		}
		if (isPdf) {
			const text = await extractPdfText(file);
			if (text.trim().length >= 48) return { rawText: text };
			// Scanned PDF fallback: rasterize first page + vision OCR
			const jpeg = await renderPdfFirstPageJpeg(file);
			if (jpeg) {
				const base = name.replace(/\.pdf$/i, '') || 'document';
				const processed = await preprocessImageForOcr(jpeg);
				const rawText = await runWorkersVision(processed, `${base}-p1.jpg`);
				return { rawText, processed };
			}
			return { rawText: text };
		}
		// Fallback: let server try as PDF (best-effort)
		return { rawText: '' };
	}

	// ---------------------------------------------------------------------------
	// Presigned upload �?R2 direct PUT. Runs in parallel with text extraction
	// so the round-trip is bounded by the slower of the two.
	// ---------------------------------------------------------------------------
	async function uploadToR2(file: File): Promise<{ key: string }> {
		const entityId = crypto.randomUUID();
		const presignRes = await fetch('/api/upload/presign', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				fileName: file.name,
				contentType: file.type || 'application/octet-stream',
				// Panel intake isn't project-scoped at upload time �?the user picks
				// project in step 3. 'intake' bucket keeps R2 keys namespaced.
				projectId: 'intake',
				entityType: 'document',
				entityId
			})
		});
		const presignJson = (await presignRes.json()) as {
			ok?: boolean;
			data?: { key: string; uploadUrl: string };
			error?: string;
		};
		if (!presignRes.ok || !presignJson.ok || !presignJson.data) {
			throw new Error(presignJson.error ?? 'Could not create upload target');
		}
		const putRes = await fetch(presignJson.data.uploadUrl, {
			method: 'PUT',
			headers: { 'content-type': file.type || 'application/octet-stream' },
			body: file
		});
		if (!putRes.ok) throw new Error('Upload to storage failed');
		return { key: presignJson.data.key };
	}

	async function onFile(file: File) {
		if (!file) return;
		if (file.size > 20 * 1024 * 1024) {
			error = 'File is larger than 20 MB.';
			stage = 'error';
			return;
		}
		fileName = file.name;
		error = '';
		stage = 'reading';

		try {
			// Extract text + upload in parallel
			const [extract, uploadResult] = await Promise.all([
				extractRawText(file).catch(() => ({ rawText: '' as string, processed: undefined as File | undefined })),
				uploadToR2(file)
			]);

			// Expose the preprocessed image via blob URL so the FilePreview can
			// offer an "Original / Processed" toggle for visual QA. The URL is
			// retained for the page lifetime (auto-revoked on unload).
			const processedImageUrl = extract.processed
				? URL.createObjectURL(extract.processed)
				: undefined;

			panel.patchState({
				fileKey: uploadResult.key,
				fileName: file.name,
				fileType: file.type || 'application/octet-stream',
				rawText: extract.rawText,
				processedImageUrl
			});

			// Step 2 will kick off the classify call immediately on mount.
			panel.advanceStep();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Something went wrong.';
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

	onMount(() => {
		// No-op; just here to reserve lifecycle for future pdfjs preload if needed.
	});

	const hintDocType = $derived(
		(panel.activeWorkflow?.state as Record<string, unknown> | undefined)?.hintDocType as
			| string
			| undefined
	);
	const hintLabel = $derived.by(() => {
		switch (hintDocType) {
			case 'invoice_in':
				return 'Supplier invoice';
			case 'invoice_out':
				return 'Customer invoice';
			case 'expense':
				return 'Expense receipt';
			case 'contract':
				return 'Contract';
			case 'quotation':
				return 'Quotation';
			case 'purchase_order':
				return 'Purchase order';
			default:
				return null;
		}
	});
</script>

<div class="intake-drop">
	<!-- eslint-disable-next-line svelte/valid-compile -->
	<button
		type="button"
		class="drop-area"
		class:is-dragging={dragOver}
		class:is-busy={stage === 'reading'}
		class:is-error={stage === 'error'}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={onBrowseClick}
		disabled={stage === 'reading'}
	>
		<span class="drop-glow" aria-hidden="true"></span>

		<span class="drop-icon">
			{#if stage === 'reading'}
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
			{#if stage === 'reading'}
				Reading {fileName}�?			{:else if stage === 'error'}
				Couldn't read that file
			{:else}
				Drop a file here
			{/if}
		</span>

		<span class="drop-sub">
			{#if stage === 'error'}
				{error}
			{:else if hintLabel}
				I'm expecting a <b>{hintLabel}</b>. PDF or photo works.
			{:else}
				PDF, photo, or screenshot �?invoice, receipt, contract, quote.
			{/if}
		</span>

		<span class="drop-footnote">
			{#if stage === 'idle' && !fileName}
				Click or drop �?I figure out the rest
			{:else if stage === 'reading'}
				Uploading and extracting text
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
		color: var(--panel-fg);
	}

	.drop-glow {
		position: absolute;
		inset: -30% -30% auto auto;
		width: 70%;
		height: 90%;
		background: radial-gradient(
			circle,
			var(--panel-gold-soft),
			transparent 60%
		);
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
	.drop-sub :global(b) {
		color: var(--panel-gold-bright);
		font-weight: 500;
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
