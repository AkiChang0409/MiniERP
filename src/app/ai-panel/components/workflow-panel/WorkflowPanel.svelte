<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Maximize2, Minimize2 } from 'lucide-svelte';
	import { panel } from '$app-layer/ai-panel/workflow/panel.svelte';
	import TodayBrief from './layers/TodayBrief.svelte';
	import ActiveFlow from './layers/ActiveFlow.svelte';
	import QuickActions from './layers/QuickActions.svelte';
	import TaskLine from './layers/TaskLine.svelte';
	import AgentChat from './layers/AgentChat.svelte';

	let scrimEl: HTMLDivElement | null = $state(null);
	let bodyTab: 'brief' | 'ask' = $state('brief');

	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && panel.isOpen) {
				e.preventDefault();
				panel.close();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	function onScrimClick(e: MouseEvent) {
		if (e.target === scrimEl) panel.close();
	}
</script>

{#if panel.isVisible}
	<div
		bind:this={scrimEl}
		class="sf-panel-scrim"
		class:is-open={panel.openState === 'open'}
		class:is-half={panel.mode === 'half'}
		class:is-full={panel.mode === 'full'}
		onclick={onScrimClick}
		role="presentation"
	>
		<aside
			class="sf-panel sf-panel-shell"
			class:is-open={panel.openState === 'open'}
			class:is-half={panel.mode === 'half'}
			class:is-full={panel.mode === 'full'}
			aria-label="AI task panel"
		>
			<!-- Left edge: animated wave ribbon. It IS the panel's visual left
			     boundary �?there is no straight border-left beneath it. The two
			     paths drift at different periods so the boundary breathes. -->
			<svg
				class="wave-edge"
				aria-hidden="true"
				preserveAspectRatio="none"
				viewBox="0 0 60 800"
			>
				<defs>
					<linearGradient id="waveGradient" x1="0" x2="0" y1="0" y2="1">
						<stop offset="0%" stop-color="var(--panel-gold)" stop-opacity="0.0" />
						<stop offset="28%" stop-color="var(--panel-gold)" stop-opacity="0.7" />
						<stop offset="60%" stop-color="var(--panel-green-bright)" stop-opacity="0.55" />
						<stop offset="100%" stop-color="var(--panel-gold)" stop-opacity="0.0" />
					</linearGradient>
					<filter id="waveBlur" x="-50%" y="-10%" width="200%" height="120%">
						<feGaussianBlur stdDeviation="1.6" />
					</filter>
				</defs>
				<g filter="url(#waveBlur)">
					<!-- Period = 320 (endpoints 160 apart, Q/T reflects). Animation
					     offset is also 320 so the loop is seamless. -->
					<path
						class="wave wave-a"
						d="M 12,-50 Q 42,30 12,110 T 12,270 T 12,430 T 12,590 T 12,750 T 12,910 L 0,910 L 0,-50 Z"
						fill="url(#waveGradient)"
					/>
					<path
						class="wave wave-b"
						d="M 22,-50 Q 52,50 22,150 T 22,350 T 22,550 T 22,750 T 22,950 L 0,950 L 0,-50 Z"
						fill="url(#waveGradient)"
						opacity="0.45"
					/>
				</g>
			</svg>
			<!-- Soft gold glow bleeding out of the left edge so the portal seam
			     reads as luminous rather than as a straight border. -->
			<div class="edge-bleed" aria-hidden="true"></div>

			<header class="sf-panel-header">
				<div class="sf-panel-header-left">
					<span class="sf-panel-badge">
						<span class="sf-panel-badge-dot"></span>
						Task mode
					</span>
				</div>
				<div class="sf-panel-header-right">
					<button
						type="button"
						class="sf-panel-iconbtn"
						title={panel.mode === 'half' ? 'Expand' : 'Compact'}
						onclick={() => panel.toggleMode()}
					>
						{#if panel.mode === 'half'}
							<Maximize2 size={14} strokeWidth={1.75} />
						{:else}
							<Minimize2 size={14} strokeWidth={1.75} />
						{/if}
					</button>
					<button
						type="button"
						class="sf-panel-iconbtn"
						title="Close (Esc)"
						onclick={() => panel.close()}
					>
						<X size={14} strokeWidth={1.75} />
					</button>
				</div>
			</header>

			<div class="sf-panel-body">
				<div class="sf-panel-body-content">
					{#if panel.activeWorkflow}
						<ActiveFlow />
					{:else}
						<div class="sf-body-tabs">
							<button
								type="button"
								class="sf-body-tab"
								class:is-active={bodyTab === 'brief'}
								onclick={() => (bodyTab = 'brief')}
							>
								Today
							</button>
							<button
								type="button"
								class="sf-body-tab"
								class:is-active={bodyTab === 'ask'}
								onclick={() => (bodyTab = 'ask')}
							>
								Ask
							</button>
						</div>
						{#if bodyTab === 'brief'}
							<TodayBrief />
						{:else}
							<AgentChat />
						{/if}
					{/if}
				</div>
				<TaskLine />
			</div>

			<footer class="sf-panel-footer">
				<QuickActions />
			</footer>
		</aside>
	</div>
{/if}

<style>
	/* Scrim: dims main app while panel is open. */
	.sf-panel-scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: transparent;
		pointer-events: none;
		transition: background-color var(--panel-dur-portal) var(--panel-ease);
	}
	.sf-panel-scrim.is-open {
		pointer-events: auto;
	}
	.sf-panel-scrim.is-open.is-half {
		background-color: rgba(6, 12, 5, 0.32);
	}
	.sf-panel-scrim.is-open.is-full {
		background-color: rgba(6, 12, 5, 0.66);
	}

	/* Panel shell �?opens as a portal from the bottom-right orb.
	 * clip-path circle() is set relative to the orb's position. */
	.sf-panel-shell {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		background: var(--panel-bg);
		background:
			radial-gradient(circle at 100% 0%, rgba(234, 188, 60, 0.14) 0%, transparent 48%),
			radial-gradient(circle at 0% 100%, rgba(95, 181, 94, 0.11) 0%, transparent 54%),
			var(--panel-bg);
		color: var(--panel-fg);
		/* No border-left �?the wave ribbon IS the left edge. */
		box-shadow: -30px 0 70px -22px rgba(0, 0, 0, 0.6);
		transition:
			clip-path var(--panel-dur-portal) var(--panel-ease),
			width var(--panel-dur-base) var(--panel-ease);
		will-change: clip-path, width;
		/* Closed state: circle clipped down to the orb's position. */
		clip-path: circle(0% at calc(100% - 54px) calc(100% - 54px));
	}
	.sf-panel-shell.is-open {
		clip-path: circle(150vmax at calc(100% - 54px) calc(100% - 54px));
	}
	.sf-panel-shell.is-half {
		width: min(58vw, 720px);
	}
	.sf-panel-shell.is-full {
		width: min(92vw, 1280px);
	}
	@media (max-width: 900px) {
		.sf-panel-shell.is-half,
		.sf-panel-shell.is-full {
			width: 100vw;
		}
	}

	/* Wave edge ribbon �?this IS the panel's left boundary. Wider than
	   before and positioned so the gold curve reads as luminous rather
	   than as a straight vertical border. */
	.wave-edge {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -10px;
		width: 56px;
		height: 100%;
		pointer-events: none;
		z-index: 2;
		opacity: 1;
	}
	.wave {
		transform-origin: center;
		animation: wave-rise 18s cubic-bezier(0.45, 0, 0.55, 1) infinite;
	}
	.wave-b {
		animation-duration: 26s;
		animation-direction: reverse;
	}
	/* Shift by exactly one wave period (320 units in viewBox space) so
	   the loop is seamless �?no visible reset/snap. */
	@keyframes wave-rise {
		0% {
			transform: translateY(0);
		}
		100% {
			transform: translateY(-320px);
		}
	}

	/* Gold bleed that softens the boundary between panel and main app so
	   the left edge feels luminous, not sharp. */
	.edge-bleed {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -60px;
		width: 120px;
		pointer-events: none;
		z-index: 1;
		background: radial-gradient(
			ellipse 40% 60% at 60% 50%,
			rgba(234, 188, 60, 0.18) 0%,
			rgba(234, 188, 60, 0.06) 40%,
			transparent 70%
		);
		mix-blend-mode: screen;
	}

	.sf-panel-header {
		position: relative;
		z-index: 3;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 22px 14px 34px;
		border-bottom: 1px solid var(--panel-divider);
	}
	.sf-panel-header-left,
	.sf-panel-header-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sf-panel-badge {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 11px;
		border: 1px solid var(--panel-border-strong);
		border-radius: 999px;
		font-size: 10.5px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--panel-gold);
		background: rgba(234, 188, 60, 0.05);
	}
	.sf-panel-badge-dot {
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: var(--panel-gold);
		box-shadow: 0 0 10px var(--panel-gold-glow), 0 0 0 3px var(--panel-gold-soft);
	}
	.sf-panel-iconbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--panel-fg-muted);
		cursor: pointer;
		transition: all var(--panel-dur-fast) var(--panel-ease);
	}
	.sf-panel-iconbtn:hover {
		background: rgba(234, 188, 60, 0.08);
		color: var(--panel-gold-bright);
		border-color: var(--panel-border);
	}

	.sf-panel-body {
		position: relative;
		z-index: 3;
		flex: 1 1 auto;
		display: flex;
		flex-direction: row;
		align-items: stretch;
		min-height: 0;
	}
	.sf-panel-body-content {
		flex: 1 1 auto;
		min-width: 0;
		overflow-y: auto;
		padding: 28px 24px 20px 46px;
	}
	.sf-body-tabs {
		display: flex;
		gap: 6px;
		margin-bottom: 16px;
	}
	.sf-body-tab {
		padding: 5px 12px;
		border-radius: 999px;
		border: 1px solid var(--panel-border);
		background: transparent;
		color: var(--panel-fg-muted);
		cursor: pointer;
		font-size: 12px;
	}
	.sf-body-tab.is-active {
		color: var(--panel-gold-bright);
		border-color: var(--panel-gold);
		background: rgba(234, 188, 60, 0.08);
	}

	.sf-panel-footer {
		position: relative;
		z-index: 3;
		flex: 0 0 auto;
		border-top: 1px solid var(--panel-divider);
		padding: 14px 22px 16px 34px;
		background: var(--panel-surface-deep);
	}
</style>
