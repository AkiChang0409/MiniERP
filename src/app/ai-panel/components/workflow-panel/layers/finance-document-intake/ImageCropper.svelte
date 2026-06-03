<script lang="ts">
	// Lightweight draggable/resizable crop rectangle over an image. Emits the
	// crop as fractions (0–1) of the image so the caller can crop the full-res
	// original. No dependency on OpenCV — manual crop is preferred over auto
	// corner detection for financial documents.
	export interface CropRect {
		x: number;
		y: number;
		w: number;
		h: number;
	}

	let {
		src,
		disabled = false,
		onApply,
		onCancel
	}: {
		src: string;
		disabled?: boolean;
		onApply: (rect: CropRect) => void;
		onCancel: () => void;
	} = $props();

	const MIN = 0.08;
	let container: HTMLDivElement | null = $state(null);
	let rect = $state<CropRect>({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 });

	type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
	let dragMode: Handle | null = null;
	let startFx = 0;
	let startFy = 0;
	let startRect: CropRect = { x: 0, y: 0, w: 1, h: 1 };

	function clamp01(v: number): number {
		return v < 0 ? 0 : v > 1 ? 1 : v;
	}

	function fractionFromEvent(e: PointerEvent): { fx: number; fy: number } {
		if (!container) return { fx: 0, fy: 0 };
		const r = container.getBoundingClientRect();
		return {
			fx: clamp01((e.clientX - r.left) / Math.max(1, r.width)),
			fy: clamp01((e.clientY - r.top) / Math.max(1, r.height))
		};
	}

	function onMove(e: PointerEvent) {
		if (!dragMode) return;
		const { fx, fy } = fractionFromEvent(e);
		const dx = fx - startFx;
		const dy = fy - startFy;

		if (dragMode === 'move') {
			const nx = clamp01(startRect.x + dx);
			const ny = clamp01(startRect.y + dy);
			rect = {
				x: Math.min(nx, 1 - startRect.w),
				y: Math.min(ny, 1 - startRect.h),
				w: startRect.w,
				h: startRect.h
			};
			return;
		}

		let { x, y, w, h } = startRect;
		const right = x + w;
		const bottom = y + h;
		if (dragMode === 'nw') {
			x = clamp01(Math.min(startRect.x + dx, right - MIN));
			y = clamp01(Math.min(startRect.y + dy, bottom - MIN));
			w = right - x;
			h = bottom - y;
		} else if (dragMode === 'ne') {
			y = clamp01(Math.min(startRect.y + dy, bottom - MIN));
			w = clamp01(Math.max(MIN, startRect.w + dx));
			h = bottom - y;
			if (x + w > 1) w = 1 - x;
		} else if (dragMode === 'sw') {
			x = clamp01(Math.min(startRect.x + dx, right - MIN));
			w = right - x;
			h = clamp01(Math.max(MIN, startRect.h + dy));
			if (y + h > 1) h = 1 - y;
		} else if (dragMode === 'se') {
			w = clamp01(Math.max(MIN, startRect.w + dx));
			h = clamp01(Math.max(MIN, startRect.h + dy));
			if (x + w > 1) w = 1 - x;
			if (y + h > 1) h = 1 - y;
		}
		rect = { x, y, w, h };
	}

	function endDrag() {
		dragMode = null;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', endDrag);
	}

	function startDrag(mode: Handle, e: PointerEvent) {
		if (disabled) return;
		e.preventDefault();
		e.stopPropagation();
		dragMode = mode;
		const { fx, fy } = fractionFromEvent(e);
		startFx = fx;
		startFy = fy;
		startRect = { ...rect };
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', endDrag);
	}

	function reset() {
		rect = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
	}

	const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
</script>

<div class="cropper">
	<div class="stage" bind:this={container}>
		<img {src} alt="Crop the document" draggable="false" />
		<!-- dim overlay outside the crop via 4 shades -->
		<div class="shade" style="inset:0 0 {pct(1 - rect.y)} 0;"></div>
		<div class="shade" style="inset:{pct(rect.y + rect.h)} 0 0 0;"></div>
		<div class="shade" style="top:{pct(rect.y)}; height:{pct(rect.h)}; left:0; width:{pct(rect.x)};"></div>
		<div class="shade" style="top:{pct(rect.y)}; height:{pct(rect.h)}; right:0; width:{pct(1 - rect.x - rect.w)};"></div>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="crop-box"
			style="left:{pct(rect.x)}; top:{pct(rect.y)}; width:{pct(rect.w)}; height:{pct(rect.h)};"
			onpointerdown={(e) => startDrag('move', e)}
		>
			<span class="handle nw" onpointerdown={(e) => startDrag('nw', e)}></span>
			<span class="handle ne" onpointerdown={(e) => startDrag('ne', e)}></span>
			<span class="handle sw" onpointerdown={(e) => startDrag('sw', e)}></span>
			<span class="handle se" onpointerdown={(e) => startDrag('se', e)}></span>
		</div>
	</div>

	<div class="crop-actions">
		<button type="button" class="quality-btn is-primary" disabled={disabled} onclick={() => onApply(rect)}>
			Apply crop
		</button>
		<button type="button" class="quality-btn" disabled={disabled} onclick={reset}>Reset box</button>
		<button type="button" class="quality-btn" disabled={disabled} onclick={onCancel}>Cancel</button>
	</div>
</div>

<style>
	.cropper {
		display: flex;
		flex-direction: column;
		align-items: center; /* center the shrink-wrapped stage */
		gap: 12px;
		width: 100%;
	}
	/* Shrink-wrap the image so the stage box === the rendered image box. The
	   crop overlay is positioned in fractions of the stage, so any letterboxing
	   (object-fit/contain) here would misalign the crop with what the user sees.
	   Sizing the stage to the image eliminates that. */
	.stage {
		position: relative;
		display: inline-block;
		max-width: 100%;
		overflow: hidden;
		border-radius: 10px;
		background: #111;
		line-height: 0;
		user-select: none;
		touch-action: none;
	}
	.stage img {
		display: block;
		max-width: 100%;
		max-height: 440px;
		width: auto;
		height: auto;
		pointer-events: none;
	}
	.shade {
		position: absolute;
		background: rgba(0, 0, 0, 0.5);
		pointer-events: none;
	}
	.crop-box {
		position: absolute;
		border: 1.5px solid var(--panel-gold-bright, #eabc3c);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
		cursor: move;
		touch-action: none;
	}
	.handle {
		position: absolute;
		width: 16px;
		height: 16px;
		background: var(--panel-gold-bright, #eabc3c);
		border: 2px solid #fff;
		border-radius: 3px;
		touch-action: none;
	}
	.handle.nw { left: -9px; top: -9px; cursor: nwse-resize; }
	.handle.ne { right: -9px; top: -9px; cursor: nesw-resize; }
	.handle.sw { left: -9px; bottom: -9px; cursor: nesw-resize; }
	.handle.se { right: -9px; bottom: -9px; cursor: nwse-resize; }
	.crop-actions {
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
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
	.quality-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.quality-btn.is-primary {
		background: rgba(234, 188, 60, 0.14);
		border-color: var(--panel-gold);
		color: var(--panel-gold-bright);
	}
</style>
