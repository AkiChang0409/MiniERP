<script lang="ts">
	import { onDestroy } from 'svelte';
	import { UploadCloud, FileText, Loader2, AlertTriangle } from 'lucide-svelte';
	import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import {
		uploadDocument,
		type DocumentArtifactPostResponse,
		type DocumentProcessingStatus
	} from '$app-layer/ai-panel/workflow/finance-workflow-api';
	import { extractEmlClientText } from '$app-layer/ai-panel/workflow/extract-eml-client';
	import {
		buildFinancialVersions,
		cropImageToFractions,
		toDisplayImage
	} from '$lib/utils/preprocess-image';
	import { assessImageQuality, type QualityFinding } from '$lib/utils/image-quality';
	import ImageCropper, { type CropRect } from './ImageCropper.svelte';

	type Stage =
		| 'idle'
		| 'expanding'
		| 'parsing'
		| 'storing'
		| 'queued'
		| 'quality_gate'
		| 'preprocess_preview'
		| 'error';

	let fileInput: HTMLInputElement | null = $state(null);
	let dragOver = $state(false);
	let stage = $state<Stage>('idle');
	let fileName = $state('');
	let batchTotal = $state(0);
	let batchIndex = $state(0);
	let error = $state('');
	// Pre-upload quality gate (single-image capture flow).
	let pendingFiles = $state<File[]>([]);
	let qualityFindings = $state<QualityFinding[]>([]);
	// Dev preprocessing-preview gate: inspect original vs vision-enhanced
	// BEFORE anything is uploaded / sent to AI (single-image flow only).
	let previewFiles = $state<File[]>([]);
	let previewExtraction = $state<ClientExtraction | null>(null);
	let previewOriginalUrl = $state<string | null>(null);
	let previewEnhancedUrl = $state<string | null>(null);
	let previewMetrics = $state<Record<string, unknown> | null>(null);
	// Optional OpenCV perspective de-warp (off by default — keeps the pipeline
	// pure-Canvas and fast; lazy-loads the 10 MB WASM only when toggled on).
	let previewDewarp = $state(false);
	let previewBusy = $state(false);
	// Manual crop: `previewSourceFile` is the untouched original we always crop
	// FROM (so re-cropping never compounds quality loss).
	let previewSourceFile = $state<File | null>(null);
	let previewSourceUrl = $state<string | null>(null);
	let previewCropOpen = $state(false);
	let previewCropped = $state(false);

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
		/** Client-preprocessed sibling. `uploadFile` stays the untouched original;
		 *  the vision-enhanced image (if any) is uploaded as the derived ref. */
		derived?: { file: File; preprocessing?: Record<string, unknown> };
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

	async function buildClientExtraction(
		file: File,
		opts: { dewarp?: boolean } = {}
	): Promise<ClientExtraction> {
		const mime = (file.type || '').toLowerCase();
		const name = file.name.toLowerCase();
		const isPdf = mime === 'application/pdf' || name.endsWith('.pdf');
		const isImage =
			mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name);
		const isDocx =
			mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
			name.endsWith('.docx');

		if (isImage) {
			// Financial photo: build TWO versions. `original` is uploaded as the
			// artifact's untouched primary (audit / human review / vision
			// fallback); `visionEnhanced` is illumination-normalised, contrast-
			// stretched and gently sharpened (pure Canvas2D, fast — no OpenCV
			// unless `dewarp` is requested), and is uploaded as the derived ref
			// that server-side OCR/vision reads. Best-effort — any failure falls
			// back to uploading the original alone.
			try {
				const { original, visionEnhanced, metrics } = await buildFinancialVersions(
					file,
					undefined,
					{ dewarp: opts.dewarp }
				);
				if (visionEnhanced !== original) {
					return {
						text: '',
						method: 'manual',
						uploadFile: original,
						derived: { file: visionEnhanced, preprocessing: metrics as unknown as Record<string, unknown> }
					};
				}
				return { text: '', method: 'manual', uploadFile: original };
			} catch {
				return { text: '', method: 'manual', uploadFile: file };
			}
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

	async function uploadOne(
		file: File,
		prebuilt?: ClientExtraction
	): Promise<DocumentArtifactPostResponse> {
		fileName = file.name;
		stage = 'parsing';

		const extraction = prebuilt ?? (await buildClientExtraction(file));

		stage = 'storing';
		return await uploadDocument(extraction.uploadFile, {
			uploadedFrom: 'ai_panel',
			clientExtractedText: extraction.text || undefined,
			clientExtractionMethod: extraction.method,
			derived: extraction.derived
				? {
						file: extraction.derived.file,
						kind: 'vision_enhanced',
						preprocessing: extraction.derived.preprocessing
					}
				: undefined
		});
	}

	function isImageFile(file: File): boolean {
		return (
			(file.type || '').toLowerCase().startsWith('image/') ||
			/\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(file.name)
		);
	}

	async function onFiles(inputFiles: File[]) {
		if (inputFiles.length === 0) return;
		fileName = displayNameForBatch(inputFiles);
		batchIndex = 0;
		batchTotal = inputFiles.length;
		error = '';
		qualityFindings = [];
		stage = 'expanding';

		let files: File[];
		try {
			files = await expandInputFiles(inputFiles);
			if (files.length === 0) {
				throw new Error('No supported files were found. Accepted: PDF, Word (.docx), email (.eml), and images.');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not read the files.';
			stage = 'error';
			return;
		}

		// Step 1: pre-upload quality check for the single-photo capture flow.
		// Fast, WASM-free metrics (resolution / focus / exposure). Soft reminder
		// only — the user can always upload anyway, since financial documents are
		// often one-of-a-kind and cannot be re-shot.
		if (files.length === 1 && isImageFile(files[0])) {
			stage = 'parsing';
			const quality = await assessImageQuality(files[0]).catch(() => null);
			if (quality && quality.findings.length > 0) {
				pendingFiles = files;
				qualityFindings = quality.findings;
				fileName = files[0].name;
				stage = 'quality_gate';
				return;
			}
			await buildPreview(files);
			return;
		}

		await runUpload(files);
	}

	async function proceedAfterQuality() {
		const files = pendingFiles;
		pendingFiles = [];
		qualityFindings = [];
		// Single-image flow always lands on the preprocessing preview next.
		if (files.length === 1 && isImageFile(files[0])) {
			await buildPreview(files);
		} else if (files.length > 0) {
			await runUpload(files);
		}
	}

	function cancelQuality() {
		pendingFiles = [];
		qualityFindings = [];
		onRetry();
	}

	function revokePreviewUrls() {
		if (previewOriginalUrl) URL.revokeObjectURL(previewOriginalUrl);
		if (previewEnhancedUrl) URL.revokeObjectURL(previewEnhancedUrl);
		if (previewSourceUrl) URL.revokeObjectURL(previewSourceUrl);
		previewOriginalUrl = null;
		previewEnhancedUrl = null;
		previewSourceUrl = null;
	}

	async function openCrop() {
		if (previewBusy || !previewSourceFile) return;
		const source = previewSourceFile;
		// Crop on a browser-renderable rendition (TIFF can't display in <img>);
		// cropImageToFractions still crops the real source via the TIFF decoder.
		const displaySource = await toDisplayImage(source).catch(() => source);
		if (previewSourceUrl) URL.revokeObjectURL(previewSourceUrl);
		previewSourceUrl = URL.createObjectURL(displaySource);
		previewCropOpen = true;
	}

	function closeCrop() {
		previewCropOpen = false;
		if (previewSourceUrl) URL.revokeObjectURL(previewSourceUrl);
		previewSourceUrl = null;
	}

	onDestroy(revokePreviewUrls);

	// Build the preview (original + vision-enhanced) from a given file and show
	// the URLs + metrics. Nothing is uploaded until the user confirms.
	async function renderPreviewFrom(file: File) {
		const extraction = await buildClientExtraction(file, { dewarp: previewDewarp });
		// TIFF (and other non-<img>-renderable formats) need a JPEG rendition for
		// the "Original" panel — the browser can't display the raw TIFF.
		const displayOriginal = await toDisplayImage(extraction.uploadFile).catch(
			() => extraction.uploadFile
		);
		revokePreviewUrls();
		previewFiles = [file];
		previewExtraction = extraction;
		previewOriginalUrl = URL.createObjectURL(displayOriginal);
		previewEnhancedUrl = extraction.derived
			? URL.createObjectURL(extraction.derived.file)
			: null;
		previewMetrics = extraction.derived?.preprocessing ?? null;
	}

	async function buildPreview(files: File[]) {
		fileName = files[0].name;
		stage = 'parsing';
		previewSourceFile = files[0];
		previewCropped = false;
		previewCropOpen = false;
		try {
			await renderPreviewFrom(files[0]);
			stage = 'preprocess_preview';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not build the preprocessing preview.';
			stage = 'error';
		}
	}

	// Re-run the preview with the de-warp toggle flipped. Loads OpenCV the first
	// time de-warp is turned on.
	async function togglePreviewDewarp() {
		if (previewBusy || previewFiles.length === 0) return;
		previewDewarp = !previewDewarp;
		previewBusy = true;
		try {
			await renderPreviewFrom(previewFiles[0]);
		} catch {
			/* keep previous preview */
		} finally {
			previewBusy = false;
		}
	}

	// Crop the untouched original by the chosen rectangle, then rebuild the
	// preview from the crop. Always crops FROM `previewSourceFile` so repeated
	// crops don't compound quality loss.
	async function applyCrop(rect: CropRect) {
		if (previewBusy || !previewSourceFile) return;
		previewBusy = true;
		const sourceFile = previewSourceFile;
		closeCrop();
		try {
			const cropped = await cropImageToFractions(sourceFile, rect, sourceFile.name);
			previewCropped = cropped !== sourceFile;
			await renderPreviewFrom(cropped);
		} catch {
			/* keep previous preview */
		} finally {
			previewBusy = false;
		}
	}

	async function resetCrop() {
		if (previewBusy || !previewSourceFile) return;
		previewBusy = true;
		closeCrop();
		previewCropped = false;
		try {
			await renderPreviewFrom(previewSourceFile);
		} catch {
			/* keep */
		} finally {
			previewBusy = false;
		}
	}

	async function continuePreview() {
		const files = previewFiles;
		const extraction = previewExtraction;
		revokePreviewUrls();
		previewFiles = [];
		previewExtraction = null;
		previewMetrics = null;
		previewSourceFile = null;
		previewCropOpen = false;
		if (files.length > 0) await runUpload(files, extraction ?? undefined);
	}

	function cancelPreview() {
		revokePreviewUrls();
		previewFiles = [];
		previewExtraction = null;
		previewMetrics = null;
		previewSourceFile = null;
		previewCropOpen = false;
		previewCropped = false;
		onRetry();
	}

	async function runUpload(files: File[], prebuiltForSingle?: ClientExtraction) {
		try {
			batchTotal = files.length;
			const artifacts: DocumentArtifactPostResponse[] = [];
			const uploadErrors: string[] = [];

			for (const [index, file] of files.entries()) {
				batchIndex = index + 1;
				try {
					const prebuilt =
						files.length === 1 && prebuiltForSingle ? prebuiltForSingle : undefined;
					artifacts.push(await uploadOne(file, prebuilt));
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

	function previewMetricRows(): { label: string; value: string }[] {
		const m = previewMetrics;
		if (!m) return [];
		const fmtBool = (v: unknown) => (v ? 'yes' : 'no');
		const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
		const rows: { label: string; value: string }[] = [];
		const brightness = num(m.brightness);
		if (brightness !== undefined) rows.push({ label: 'Brightness', value: `${Math.round(brightness)}` });
		const contrast = num(m.contrast);
		if (contrast !== undefined) rows.push({ label: 'Contrast', value: `${Math.round(contrast)}` });
		rows.push({ label: 'Illumination fix', value: fmtBool(m.normalized) });
		const gamma = num(m.gamma) ?? 1;
		rows.push({ label: 'Gamma', value: gamma === 1 ? 'none' : gamma.toFixed(2) });
		rows.push({ label: 'Contrast stretch', value: fmtBool(m.contrastApplied) });
		rows.push({ label: 'Sharpen', value: fmtBool(m.sharpened) });
		if (m.warped) {
			rows.push({ label: 'De-warp', value: 'yes' });
			const area = num(m.areaRatio);
			if (area !== undefined) rows.push({ label: 'Doc coverage', value: `${Math.round(area * 100)}%` });
		}
		const deskew = num(m.deskewedDeg) ?? 0;
		if (deskew) rows.push({ label: 'Deskew', value: `${deskew.toFixed(1)}°` });
		const w = num(m.outputWidth);
		const h = num(m.outputHeight);
		if (w && h) rows.push({ label: 'Output size', value: `${w}×${h}px` });
		return rows;
	}
</script>

<div class="intake-drop">
	{#if stage === 'quality_gate'}
		<div class="quality-gate" role="alert">
			<span class="drop-icon quality-icon">
				<AlertTriangle size={30} strokeWidth={1.6} />
			</span>
			<span class="drop-heading">Check this photo before uploading</span>
			<span class="drop-sub">{fileName}</span>
			<ul class="quality-list">
				{#each qualityFindings as finding (finding.metric + finding.message)}
					<li class="quality-item is-{finding.severity}">{finding.message}</li>
				{/each}
			</ul>
			<div class="quality-actions">
				<button type="button" class="quality-btn is-primary" onclick={proceedAfterQuality}>
					Upload anyway
				</button>
				<button type="button" class="quality-btn" onclick={cancelQuality}>
					Choose another
				</button>
			</div>
		</div>
	{:else if stage === 'preprocess_preview'}
		<div class="preview-gate">
			<span class="drop-heading">Preprocessing preview</span>
			<span class="drop-sub">Inspect the result before sending to AI · {fileName}</span>
			{#if previewCropOpen && previewSourceUrl}
				<span class="drop-sub">Drag the box to keep only the document — tighter crops read much better.</span>
				<ImageCropper
					src={previewSourceUrl}
					disabled={previewBusy}
					onApply={applyCrop}
					onCancel={closeCrop}
				/>
			{:else}
			<div class="preview-grid">
				<figure class="preview-cell">
					<figcaption>Original {previewCropped ? '(cropped)' : ''}</figcaption>
					{#if previewOriginalUrl}
						<img src={previewOriginalUrl} alt="Original upload" />
					{/if}
				</figure>
				<figure class="preview-cell">
					<figcaption>Vision-enhanced {previewEnhancedUrl ? '' : '(none — passed through)'}</figcaption>
					{#if previewEnhancedUrl}
						<img src={previewEnhancedUrl} alt="Vision-enhanced result" />
					{:else if previewOriginalUrl}
						<img src={previewOriginalUrl} alt="No enhancement; original used" />
					{/if}
				</figure>
			</div>
			<div class="preview-crop-bar">
				<button type="button" class="quality-btn" disabled={previewBusy} onclick={openCrop}>
					Crop document
				</button>
				{#if previewCropped}
					<button type="button" class="quality-btn" disabled={previewBusy} onclick={resetCrop}>
						Undo crop
					</button>
				{/if}
			</div>
			{#if previewMetricRows().length > 0}
				<dl class="preview-metrics">
					{#each previewMetricRows() as row (row.label)}
						<div class="preview-metric">
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						</div>
					{/each}
				</dl>
			{/if}
			<label class="preview-toggle">
				<input
					type="checkbox"
					checked={previewDewarp}
					disabled={previewBusy}
					onchange={togglePreviewDewarp}
				/>
				<span>Perspective de-warp {previewBusy ? '(processing…)' : '(slower, loads OpenCV)'}</span>
			</label>
			<div class="quality-actions">
				<button
					type="button"
					class="quality-btn is-primary"
					disabled={previewBusy}
					onclick={continuePreview}
				>
					Looks good — send to AI
				</button>
				<button type="button" class="quality-btn" disabled={previewBusy} onclick={cancelPreview}>
					Cancel
				</button>
			</div>
			{/if}
		</div>
	{:else}
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
	{/if}

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

	.quality-gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 32px 28px;
		background: var(--panel-surface);
		border: 1.5px solid rgba(234, 188, 60, 0.35);
		border-radius: 20px;
		text-align: center;
	}
	.quality-icon {
		color: var(--panel-gold-bright);
		background: rgba(234, 188, 60, 0.08);
		border: 1px solid rgba(234, 188, 60, 0.24);
	}
	.quality-list {
		list-style: none;
		margin: 4px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		max-width: 46ch;
	}
	.quality-item {
		font-size: 13px;
		line-height: 1.5;
		padding: 8px 12px;
		border-radius: 10px;
		text-align: left;
	}
	.quality-item.is-warn {
		color: var(--panel-fg-muted);
		background: rgba(234, 188, 60, 0.08);
		border: 1px solid rgba(234, 188, 60, 0.22);
	}
	.quality-item.is-reshoot {
		color: var(--panel-fg);
		background: rgba(225, 118, 118, 0.08);
		border: 1px solid rgba(225, 118, 118, 0.3);
	}
	.quality-actions {
		display: flex;
		gap: 10px;
		margin-top: 6px;
	}
	.quality-btn {
		padding: 9px 18px;
		border-radius: 10px;
		font-family: inherit;
		font-size: 13px;
		cursor: pointer;
		background: var(--panel-surface-raised);
		border: 1px solid rgba(234, 188, 60, 0.28);
		color: var(--panel-fg);
		transition: border-color var(--panel-dur-fast) var(--panel-ease);
	}
	.quality-btn:hover {
		border-color: var(--panel-gold);
	}
	.quality-btn.is-primary {
		background: rgba(234, 188, 60, 0.14);
		border-color: var(--panel-gold);
		color: var(--panel-gold-bright);
	}

	.preview-gate {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 24px 20px;
		background: var(--panel-surface);
		border: 1.5px solid rgba(234, 188, 60, 0.3);
		border-radius: 20px;
		text-align: center;
	}
	.preview-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		width: 100%;
		margin-top: 6px;
	}
	.preview-cell {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.preview-cell figcaption {
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--panel-fg-faint);
	}
	.preview-cell img {
		width: 100%;
		height: auto;
		max-height: 360px;
		object-fit: contain;
		border-radius: 10px;
		border: 1px solid rgba(234, 188, 60, 0.18);
		background: #ffffff;
	}
	.preview-metrics {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px 10px;
		margin: 4px 0 0;
		width: 100%;
	}
	.preview-metric {
		display: flex;
		gap: 6px;
		align-items: baseline;
		font-size: 12px;
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--panel-surface-raised);
		border: 1px solid rgba(234, 188, 60, 0.18);
	}
	.preview-metric dt {
		color: var(--panel-fg-faint);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 10.5px;
	}
	.preview-metric dd {
		margin: 0;
		color: var(--panel-fg);
		font-variant-numeric: tabular-nums;
	}
	.preview-crop-bar {
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.preview-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
		color: var(--panel-fg-muted);
		cursor: pointer;
		margin-top: 2px;
	}
	.preview-toggle input {
		accent-color: var(--panel-gold);
		cursor: pointer;
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
