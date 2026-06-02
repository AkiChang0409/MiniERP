<script lang="ts">
	import { UploadCloud, FileText, Loader2, AlertTriangle } from 'lucide-svelte';
	import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import {
		uploadDocument,
		type DocumentArtifactPostResponse,
		type DocumentProcessingStatus
	} from '$app-layer/ai-panel/workflow/finance-workflow-api';
	import { extractEmlClientText } from '$app-layer/ai-panel/workflow/extract-eml-client';
	import { preprocessImageForOcr } from '$lib/utils/preprocess-image';

	type Stage = 'idle' | 'expanding' | 'parsing' | 'storing' | 'queued' | 'error';

	let fileInput: HTMLInputElement | null = $state(null);
	let dragOver = $state(false);
	let stage = $state<Stage>('idle');
	let fileName = $state('');
	let batchTotal = $state(0);
	let batchIndex = $state(0);
	let error = $state('');

	const TERMINAL_BAD: DocumentProcessingStatus[] = ['needs_manual_review', 'failed'];
	const MIN_USEFUL_CLIENT_TEXT = 48;
	const MAX_BATCH_FILES = 25;
	const SUPPORTED_DOCUMENT_EXT_RE = /\.(pdf|docx|doc|eml|png|jpe?g|webp|gif|bmp|tiff?)$/i;
	const ZIP_EXT_RE = /\.zip$/i;

	// ---------------------------------------------------------------------------
	// Client-side text extraction (Ship 1 of upload pipeline redesign).
	// Same pattern as src/app/ai-panel/components/workflow-panel/layers/intake/DropZone.svelte.
	// PDF: pdfjs text layer; if too thin, render page 1 → JPEG → server vision OCR.
	// Image: skip client extraction, server runs vision OCR.
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

	async function renderPdfFirstPageJpeg(file: File): Promise<File | null> {
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
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88)
			);
			if (!blob) return null;
			const baseName = file.name.replace(/\.pdf$/i, '') || 'document';
			return new File([blob], `${baseName}-p1.jpg`, { type: 'image/jpeg' });
		} catch {
			return null;
		}
	}

	type ClientExtraction = {
		text: string;
		method: 'pdfjs' | 'vision_first_page' | 'manual';
		uploadFile: File;
	};

	function isZipFile(file: File): boolean {
		const mime = (file.type || '').toLowerCase();
		return (
			mime === 'application/zip' ||
			mime === 'application/x-zip-compressed' ||
			ZIP_EXT_RE.test(file.name)
		);
	}

	function inferMimeType(fileName: string, fallback = 'application/octet-stream'): string {
		if (/\.pdf$/i.test(fileName)) return 'application/pdf';
		if (/\.docx$/i.test(fileName))
			return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		if (/\.doc$/i.test(fileName)) return 'application/msword';
		if (/\.eml$/i.test(fileName)) return 'message/rfc822';
		if (/\.png$/i.test(fileName)) return 'image/png';
		if (/\.jpe?g$/i.test(fileName)) return 'image/jpeg';
		if (/\.webp$/i.test(fileName)) return 'image/webp';
		if (/\.gif$/i.test(fileName)) return 'image/gif';
		if (/\.bmp$/i.test(fileName)) return 'image/bmp';
		if (/\.tiff?$/i.test(fileName)) return 'image/tiff';
		return fallback;
	}

	function isSupportedDocument(file: File): boolean {
		const mime = (file.type || '').toLowerCase();
		return (
			mime === 'application/pdf' ||
			mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
			mime === 'application/msword' ||
			mime === 'message/rfc822' ||
			mime.startsWith('image/') ||
			SUPPORTED_DOCUMENT_EXT_RE.test(file.name)
		);
	}

	function displayNameForBatch(files: File[]): string {
		if (files.length === 0) return '';
		if (files.length === 1) return files[0].name;
		return `${files.length} files`;
	}

	async function expandInputFiles(files: File[]): Promise<File[]> {
		const expanded: File[] = [];

		for (const file of files) {
			if (!isZipFile(file)) {
				if (isSupportedDocument(file)) expanded.push(file);
				continue;
			}

			const { unzipSync } = await import('fflate');
			const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
			for (const [entryName, entryBytes] of Object.entries(entries)) {
				if (entryName.endsWith('/') || entryName.startsWith('__MACOSX/')) continue;
				if (!SUPPORTED_DOCUMENT_EXT_RE.test(entryName)) continue;

				const cleanName =
					entryName
						.split(/[\\/]/)
						.filter(Boolean)
						.pop() ?? entryName;
				const bytes = entryBytes.slice();
				const body = bytes.buffer.slice(
					bytes.byteOffset,
					bytes.byteOffset + bytes.byteLength
				) as ArrayBuffer;
				expanded.push(
					new File([body], cleanName, {
						type: inferMimeType(cleanName),
						lastModified: file.lastModified
					})
				);
			}
		}

		return expanded.slice(0, MAX_BATCH_FILES);
	}

	async function extractDocxTextClient(file: File): Promise<string> {
		try {
			const { unzipSync, strFromU8 } = await import('fflate');
			const bytes = new Uint8Array(await file.arrayBuffer());
			const files = unzipSync(bytes);
			const docXmlBytes = files['word/document.xml'];
			if (!docXmlBytes) return '';
			const xml = strFromU8(docXmlBytes, false);
			const parts: string[] = [];
			const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
			let m: RegExpExecArray | null;
			while ((m = pRe.exec(xml)) !== null) {
				const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
				const ts: string[] = [];
				let tm: RegExpExecArray | null;
				while ((tm = tRe.exec(m[0])) !== null) {
					ts.push(
						tm[1]
							.replace(/&amp;/g, '&')
							.replace(/&lt;/g, '<')
							.replace(/&gt;/g, '>')
							.replace(/&quot;/g, '"')
							.replace(/&apos;/g, "'")
					);
				}
				const line = ts.join('').replace(/\s+/g, ' ').trim();
				if (line) parts.push(line);
			}
			return parts.join('\n');
		} catch {
			return '';
		}
	}

	async function buildClientExtraction(file: File): Promise<ClientExtraction> {
		const mime = (file.type || '').toLowerCase();
		const name = file.name.toLowerCase();
		const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
		const isImage =
			mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name);
		const isDocx =
			mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
			name.endsWith('.docx');

		if (isImage) {
			// OpenAI Vision handles JPEG/PNG/WebP/GIF natively — upload as-is so
			// we don't pay the OpenCV.js (~10 MB WASM) first-load cost on the
			// critical path. Only TIFF and BMP need a client-side re-encode to
			// JPEG (the vision API can't decode them), and we use the lightweight
			// `'convert'` mode which skips the OpenCV warp + unsharp steps —
			// pure format conversion only.
			const needsClientReencode =
				/\.(tiff?|bmp)$/i.test(name) || /^image\/(tiff?|bmp|x-bmp)$/i.test(mime);
			const uploadFile = needsClientReencode
				? await preprocessImageForOcr(file, undefined, { mode: 'convert' }).catch(() => file)
				: file;
			return { text: '', method: 'manual', uploadFile };
		}

		if (isDocx) {
			const text = await extractDocxTextClient(file).catch(() => '');
			if (text.length >= MIN_USEFUL_CLIENT_TEXT) {
				return { text, method: 'manual', uploadFile: file };
			}
			// Extraction failed (e.g. scanned/image DOCX); server will handle.
			return { text: '', method: 'manual', uploadFile: file };
		}

		// EML: parse client-side, extract text from the financial attachment inside
		// (PDF via pdfjs, DOCX via XML parse). The email body is just context.
		if (mime === 'message/rfc822' || name.endsWith('.eml')) {
			const result = await extractEmlClientText(file, {
				pdf: extractPdfText,
				pdfPageRender: renderPdfFirstPageJpeg,
				docx: extractDocxTextClient
			}).catch(() => null);
			if (result && result.text.length >= MIN_USEFUL_CLIENT_TEXT) {
				return {
					text: result.text,
					method: result.method,
					uploadFile: result.overrideUploadFile ?? file
				};
			}
			return { text: '', method: 'manual', uploadFile: file };
		}

		// Legacy .doc: server handles extraction.
		if (mime === 'application/msword' || name.endsWith('.doc')) {
			return { text: '', method: 'manual', uploadFile: file };
		}

		if (isPdf) {
			const text = await extractPdfText(file).catch(() => '');
			if (text.length >= MIN_USEFUL_CLIENT_TEXT) {
				return { text, method: 'pdfjs', uploadFile: file };
			}
			// Scanned PDF: rasterize first page → JPEG, upload that as the artifact.
			// Server-side vision OCR handles it from there.
			const jpeg = await renderPdfFirstPageJpeg(file);
			if (jpeg) {
				return { text: '', method: 'vision_first_page', uploadFile: jpeg };
			}
			// Last-resort: upload the original PDF; server will mark needs_manual_review.
			return { text: '', method: 'manual', uploadFile: file };
		}

		return { text: '', method: 'manual', uploadFile: file };
	}

	async function uploadOne(file: File): Promise<DocumentArtifactPostResponse> {
		fileName = file.name;
		stage = 'parsing';

		const extraction = await buildClientExtraction(file);

		stage = 'storing';
		return await uploadDocument(extraction.uploadFile, {
			uploadedFrom: 'ai_panel',
			clientExtractedText: extraction.text || undefined,
			clientExtractionMethod: extraction.method
		});
	}

	async function onFiles(inputFiles: File[]) {
		if (inputFiles.length === 0) return;
		fileName = displayNameForBatch(inputFiles);
		batchIndex = 0;
		batchTotal = inputFiles.length;
		error = '';
		stage = 'expanding';

		try {
			const files = await expandInputFiles(inputFiles);
			if (files.length === 0) {
				throw new Error('No supported files were found. Accepted: PDF, Word (.docx), email (.eml), and images.');
			}

			batchTotal = files.length;
			const artifacts: DocumentArtifactPostResponse[] = [];
			const uploadErrors: string[] = [];

			for (const [index, file] of files.entries()) {
				batchIndex = index + 1;
				try {
					artifacts.push(await uploadOne(file));
				} catch (err) {
					uploadErrors.push(
						`${file.name}: ${err instanceof Error ? err.message : 'Upload failed'}`
					);
				}
			}

			if (artifacts.length === 0) {
				throw new Error(uploadErrors[0] ?? 'No files could be added to Inbox.');
			}

			const preferred =
				artifacts.find((a) => a.processingStatus === 'ready_for_review') ??
				artifacts.find((a) => !TERMINAL_BAD.includes(a.processingStatus)) ??
				artifacts[0];
			const initialTab = TERMINAL_BAD.includes(preferred.processingStatus)
				? 'failed'
				: preferred.processingStatus === 'ready_for_review'
					? 'review'
					: 'processing';

			stage = 'queued';
			panel.startWorkflow('finance-inbox');
			panel.patchState({
				initialTab,
				justUploadedDocumentId: preferred.id,
				batchDocumentIds: artifacts.map((a) => a.id),
				documentId: preferred.id,
				documentArtifactId: preferred.id,
				documentArtifactStatus: preferred.processingStatus,
				documentClassification: preferred.classification,
				suggestedDocumentType: preferred.documentType,
				fileName: artifacts.length === 1 ? preferred.originalFile.fileName : `${artifacts.length} files`,
				fileSize: artifacts.reduce((sum, a) => sum + a.originalFile.sizeBytes, 0)
			});
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not start the workflow.';
			stage = 'error';
		}
	}

	function onInputChange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (files.length > 0) void onFiles(files);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const files = Array.from(e.dataTransfer?.files ?? []);
		if (files.length > 0) void onFiles(files);
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
		batchIndex = 0;
		batchTotal = 0;
	}
</script>

<div class="intake-drop">
	<button
		type="button"
		class="drop-area"
		class:is-dragging={dragOver}
		class:is-busy={stage === 'expanding' ||
			stage === 'parsing' ||
			stage === 'storing' ||
			stage === 'queued'}
		class:is-error={stage === 'error'}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		onclick={stage === 'error' ? onRetry : onBrowseClick}
		disabled={stage === 'expanding' ||
			stage === 'parsing' ||
			stage === 'storing' ||
			stage === 'queued'}
	>
		<span class="drop-glow" aria-hidden="true"></span>

		<span class="drop-icon">
			{#if stage === 'expanding' || stage === 'parsing' || stage === 'storing' || stage === 'queued'}
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
			{#if stage === 'expanding'}
				Preparing {fileName}…
			{:else if stage === 'parsing'}
				Reading {fileName} locally{batchTotal > 1 ? ` (${batchIndex}/${batchTotal})` : ''}…
			{:else if stage === 'storing'}
				Storing {fileName}{batchTotal > 1 ? ` (${batchIndex}/${batchTotal})` : ''}…
			{:else if stage === 'queued'}
				Added {batchTotal > 1 ? `${batchTotal} files` : fileName} to Inbox…
			{:else if stage === 'error'}
				Couldn't start
			{:else}
				Drop financial documents here
			{/if}
		</span>

		<span class="drop-sub">
			{#if stage === 'error'}
				{error}
			{:else}
				PDF, Word, email (.eml), photo, or ZIP. Invoice, receipt, PO, customer invoice - I'll figure out the rest.
			{/if}
		</span>

		<span class="drop-footnote">
			{#if stage === 'idle' && !fileName}
				Click or drop multiple files · each document becomes one Inbox item
			{:else if stage === 'expanding'}
				Expanding archives and filtering supported document files
			{:else if stage === 'parsing'}
				Extracting text in browser (pdf.js)
			{:else if stage === 'storing'}
				Stashing each file in object storage
			{:else if stage === 'queued'}
				The async worker will extract, classify, and prefill fields
			{/if}
		</span>
	</button>

	<input
		bind:this={fileInput}
		type="file"
		accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,message/rfc822,image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,application/zip,.pdf,.docx,.doc,.eml,.zip,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff"
		multiple
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
