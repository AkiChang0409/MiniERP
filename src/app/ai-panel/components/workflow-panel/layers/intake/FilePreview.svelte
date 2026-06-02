<script lang="ts">
	import { onMount } from 'svelte';
	import { Loader2, FileText, Maximize2, Minimize2 } from 'lucide-svelte';
	import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

	let {
		fileKey,
		fileName,
		fileType,
		processedImageUrl = undefined,
		collapsible = false
	}: {
		fileKey: string | undefined;
		fileName: string | undefined;
		fileType: string | undefined;
		/**
		 * Object URL of the preprocessed image (after EXIF correction,
		 * resize, perspective warp, sharpening). When provided, the preview
		 * renders an Original / Processed toggle for visual QA.
		 */
		processedImageUrl?: string | undefined;
		/** When true, renders a collapse toggle (used in half-mode). */
		collapsible?: boolean;
	} = $props();

	let canvasEl: HTMLCanvasElement | null = $state(null);
	let loading = $state(true);
	let error = $state('');
	let collapsed = $state(false);
	let zoom = $state(1);
	/** Toggle between the original (R2) and preprocessed (in-memory blob) view. */
	let view = $state<'original' | 'processed'>('original');

	const fileUrl = $derived(fileKey ? `/api/files?key=${encodeURIComponent(fileKey)}` : null);
	const hasProcessed = $derived(Boolean(processedImageUrl));
	const showProcessed = $derived(view === 'processed' && hasProcessed);
	const isImage = $derived.by(() => {
		if (!fileType && !fileName) return false;
		const mime = (fileType ?? '').toLowerCase();
		const name = (fileName ?? '').toLowerCase();
		return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
	});
	const isPdf = $derived.by(() => {
		const mime = (fileType ?? '').toLowerCase();
		const name = (fileName ?? '').toLowerCase();
		return mime === 'application/pdf' || name.endsWith('.pdf');
	});

	// Render PDF's first page to canvas via pdfjs-dist.
	async function renderPdf(url: string) {
		if (!canvasEl) return;
		try {
			const pdfjs = await import('pdfjs-dist');
			pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
			const res = await fetch(url);
			const data = new Uint8Array(await res.arrayBuffer());
			const pdf = await pdfjs.getDocument({ data }).promise;
			if (pdf.numPages < 1) throw new Error('Empty PDF');
			const page = await pdf.getPage(1);
			const base = page.getViewport({ scale: 1 });
			const scale = Math.min(2.0, 720 / Math.max(base.width, 1));
			const viewport = page.getViewport({ scale });
			canvasEl.width = Math.ceil(viewport.width);
			canvasEl.height = Math.ceil(viewport.height);
			const ctx = canvasEl.getContext('2d');
			if (!ctx) throw new Error('Canvas 2D context unavailable');
			await page.render({ canvasContext: ctx, viewport, canvas: canvasEl }).promise;
			loading = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Preview failed';
			loading = false;
		}
	}

	$effect(() => {
		if (collapsed) return;
		loading = true;
		error = '';
		if (showProcessed) {
			// <img onload> for the processed blob URL sets loading = false
			return;
		}
		if (!fileUrl) return;
		if (isPdf) {
			// Wait one frame so <canvas> is mounted.
			requestAnimationFrame(() => {
				void renderPdf(fileUrl);
			});
		} else if (isImage) {
			// <img onload> sets loading = false
		} else {
			loading = false;
		}
	});

	onMount(() => {
		// Nothing special — $effect handles the render trigger.
	});

	function onImageLoad() {
		loading = false;
	}
	function onImageError() {
		error = 'Could not load image.';
		loading = false;
	}

	function toggleCollapsed() {
		collapsed = !collapsed;
	}

	function zoomIn() {
		zoom = Math.min(zoom + 0.15, 2);
	}
	function zoomOut() {
		zoom = Math.max(zoom - 0.15, 0.5);
	}
	function zoomReset() {
		zoom = 1;
	}
</script>

<section class="preview" class:is-collapsed={collapsed}>
	<header class="preview-head">
		<div class="preview-title">
			<FileText size={13} strokeWidth={2} />
			<span class="preview-name" title={fileName}>{fileName ?? 'Preview'}</span>
		</div>
		<div class="preview-ctrls">
			{#if !collapsed && hasProcessed}
				<div class="view-toggle" role="tablist" aria-label="Preview source">
					<button
						type="button"
						class="ctrl seg"
						class:is-active={view === 'original'}
						onclick={() => (view = 'original')}
						title="Show original upload"
						role="tab"
						aria-selected={view === 'original'}
					>
						<span class="z-text">Original</span>
					</button>
					<button
						type="button"
						class="ctrl seg"
						class:is-active={view === 'processed'}
						onclick={() => (view = 'processed')}
						title="Show preprocessed image sent to OCR"
						role="tab"
						aria-selected={view === 'processed'}
					>
						<span class="z-text">Processed</span>
					</button>
				</div>
			{/if}
			{#if !collapsed && fileKey}
				<button type="button" class="ctrl" onclick={zoomOut} title="Zoom out">
					<span class="z-text">−</span>
				</button>
				<button type="button" class="ctrl" onclick={zoomReset} title="Reset zoom">
					<span class="z-text num">{Math.round(zoom * 100)}%</span>
				</button>
				<button type="button" class="ctrl" onclick={zoomIn} title="Zoom in">
					<span class="z-text">+</span>
				</button>
			{/if}
			{#if collapsible}
				<button type="button" class="ctrl" onclick={toggleCollapsed} title={collapsed ? 'Show' : 'Hide'}>
					{#if collapsed}
						<Maximize2 size={12} strokeWidth={2} />
					{:else}
						<Minimize2 size={12} strokeWidth={2} />
					{/if}
				</button>
			{/if}
		</div>
	</header>

	{#if !collapsed}
		<div class="preview-body">
			{#if !fileKey}
				<div class="preview-empty">
					<FileText size={24} strokeWidth={1.5} />
					<span>No file yet.</span>
				</div>
			{:else if error}
				<div class="preview-error">
					<span>Couldn't render preview.</span>
					<span class="err-msg">{error}</span>
					<a class="err-link" href={fileUrl} target="_blank" rel="noopener">
						Open in new tab
					</a>
				</div>
			{:else}
				{#if loading}
					<div class="preview-loading" aria-hidden="true">
						<Loader2 size={20} strokeWidth={1.6} />
					</div>
				{/if}
				<div class="preview-scroll">
					<div class="preview-scale" style={`--zoom: ${zoom};`}>
						{#if showProcessed}
							<img
								class="preview-img"
								src={processedImageUrl}
								alt={`${fileName ?? 'document'} (preprocessed)`}
								onload={onImageLoad}
								onerror={onImageError}
							/>
						{:else if isPdf}
							<canvas bind:this={canvasEl} class="preview-canvas"></canvas>
						{:else if isImage}
							<img
								class="preview-img"
								src={fileUrl}
								alt={fileName ?? 'document'}
								onload={onImageLoad}
								onerror={onImageError}
							/>
						{:else}
							<div class="preview-placeholder">
								<FileText size={32} strokeWidth={1.4} />
								<span>{fileName}</span>
								<a class="err-link" href={fileUrl} target="_blank" rel="noopener">
									Open in new tab
								</a>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		background: var(--panel-surface-deep);
		border: 1px solid var(--panel-border);
		border-radius: 14px;
		overflow: hidden;
	}
	.preview.is-collapsed {
		min-height: 0;
	}

	.preview-head {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px 8px 12px;
		background: var(--panel-surface);
		border-bottom: 1px solid var(--panel-divider);
	}
	.preview-title {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		color: var(--panel-fg-muted);
		font-size: 11.5px;
	}
	.preview-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 220px;
	}
	.preview-ctrls {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.view-toggle {
		display: inline-flex;
		gap: 1px;
		padding: 2px;
		background: var(--panel-surface-deep);
		border: 1px solid var(--panel-border);
		border-radius: 8px;
	}
	.ctrl.seg {
		min-width: 64px;
		height: 18px;
		padding: 0 8px;
		border-radius: 5px;
		font-size: 10.5px;
		letter-spacing: 0.04em;
	}
	.ctrl.seg.is-active {
		background: var(--panel-gold-soft);
		color: var(--panel-gold-bright);
		border-color: var(--panel-gold);
	}
	.ctrl.seg:not(.is-active):hover {
		background: rgba(234, 188, 60, 0.04);
	}
	.ctrl {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 24px;
		height: 22px;
		padding: 0 6px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 6px;
		color: var(--panel-fg-muted);
		font-family: inherit;
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.ctrl:hover {
		color: var(--panel-gold-bright);
		background: rgba(234, 188, 60, 0.06);
		border-color: var(--panel-border);
	}
	.z-text {
		font-size: 11px;
		line-height: 1;
	}
	.z-text.num {
		font-variant-numeric: tabular-nums;
	}

	.preview-body {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		overflow: hidden;
	}
	.preview-scroll {
		width: 100%;
		height: 100%;
		overflow: auto;
		padding: 14px;
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}
	.preview-scale {
		transform: scale(var(--zoom, 1));
		transform-origin: top center;
		transition: transform 150ms ease-out;
	}

	.preview-canvas,
	.preview-img {
		display: block;
		max-width: 100%;
		height: auto;
		background: white;
		border: 1px solid var(--panel-border);
		border-radius: 6px;
		box-shadow: 0 4px 20px -6px rgba(0, 0, 0, 0.5);
	}
	.preview-canvas {
		width: auto;
	}

	.preview-loading {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--panel-gold);
	}
	.preview-loading :global(svg) {
		animation: spin 1s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.preview-empty,
	.preview-placeholder,
	.preview-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 40px 20px;
		text-align: center;
		color: var(--panel-fg-muted);
		font-size: 12.5px;
	}
	.err-msg {
		font-size: 11px;
		color: var(--panel-fg-faint);
	}
	.err-link {
		font-size: 12px;
		color: var(--panel-gold-bright);
		text-decoration: none;
		border-bottom: 1px dashed rgba(234, 188, 60, 0.4);
	}
	.err-link:hover {
		border-bottom-color: var(--panel-gold);
	}
</style>
