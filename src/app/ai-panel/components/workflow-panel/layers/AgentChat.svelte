<script lang="ts">
	import type { OrchestratorResult, OrchestratorConfirmationDraft } from '$platform/ai/orchestrator';
	import { sendAgentMessage } from '$app-layer/ai-panel/agent/agent-api';
	import { renderMarkdownLite } from '$app-layer/ai-panel/agent/markdown-lite';
	import { agentPageContext } from '$app-layer/ai-panel/state/context';

	interface ChatMessage {
		role: 'user' | 'agent';
		text: string;
		result?: OrchestratorResult;
	}

	interface TraceStep {
		step: number;
		toolId: string;
		ok: boolean;
		status: string;
	}

	// One conversation per panel session.
	const conversationId = `ai_panel:${crypto.randomUUID()}`;

	let input = $state('');
	let busy = $state(false);
	let messages = $state<ChatMessage[]>([]);
	/** The actionId of the currently-previewed confirmation, if any. */
	let pendingActionId = $state<string | null>(null);

	function routeContext() {
		if (typeof window === 'undefined') return undefined;
		// Prefer the page-provided context store (project/task/document), fall back
		// to parsing the URL so a project id is always available.
		const page = $agentPageContext as Record<string, unknown>;
		const fromUrl = window.location.pathname.match(/\/projects\/([^/]+)/)?.[1];
		const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
		return {
			route: window.location.pathname,
			projectId: str(page.project_id) ?? fromUrl,
			taskId: str(page.task_id),
			documentId: str(page.document_id)
		};
	}

	function draftOf(result?: OrchestratorResult): OrchestratorConfirmationDraft | null {
		return (result?.draft as OrchestratorConfirmationDraft | undefined) ?? null;
	}

	function traceSteps(result?: OrchestratorResult): TraceStep[] {
		const steps = result?.trace?.steps;
		return Array.isArray(steps) ? (steps as TraceStep[]) : [];
	}

	function isDanger(result?: OrchestratorResult): boolean {
		return result?.kind === 'error' || result?.kind === 'denied' || result?.kind === 'no_route';
	}

	async function run(payload: Parameters<typeof sendAgentMessage>[0], echo?: string) {
		if (busy) return;
		busy = true;
		if (echo) messages = [...messages, { role: 'user', text: echo }];
		try {
			const result = await sendAgentMessage(payload);
			messages = [...messages, { role: 'agent', text: result.message, result }];
			pendingActionId = result.kind === 'confirmation' ? (result.actionId ?? null) : null;
		} catch (err) {
			messages = [
				...messages,
				{ role: 'agent', text: err instanceof Error ? err.message : 'Something went wrong.' }
			];
		} finally {
			busy = false;
		}
	}

	async function send() {
		const text = input.trim();
		if (!text) return;
		input = '';
		await run({ message: text, conversationId, routeContext: routeContext() }, text);
	}

	async function confirm(actionId: string) {
		await run(
			{ message: '', conversationId, routeContext: routeContext(), confirm: { actionId } },
			'✓ Confirm'
		);
	}

	async function cancel() {
		await run({ message: '', conversationId, routeContext: routeContext(), cancel: true }, '✕ Cancel');
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	}
</script>

<div class="agent-chat">
	<div class="agent-log">
		{#if messages.length === 0}
			<p class="agent-empty">
				Ask about a project, or propose a change — e.g. “reschedule the QC task to next Wednesday”.
				I’ll show a preview and ask you to confirm before anything is written.
			</p>
		{/if}

		{#each messages as msg, i (i)}
			<div
				class="bubble"
				class:is-user={msg.role === 'user'}
				class:is-agent={msg.role === 'agent'}
				class:is-danger={msg.role === 'agent' && isDanger(msg.result)}
			>
				{#if msg.role === 'agent'}
					<!-- markdown-lite is XSS-safe: it escapes before formatting -->
					<div class="bubble-text md">{@html renderMarkdownLite(msg.text)}</div>
				{:else}
					<div class="bubble-text">{msg.text}</div>
				{/if}

				{#if msg.result?.kind === 'clarification' && msg.result.candidates?.length}
					<div class="chips">
						{#each msg.result.candidates as c (c.id)}
							<button
								class="chip"
								onclick={() => run({ message: c.label, conversationId, routeContext: routeContext() }, c.label)}
							>
								{c.label}
							</button>
						{/each}
					</div>
				{/if}

				{#if msg.result?.kind === 'confirmation'}
					{@const draft = draftOf(msg.result)}
					<div class="draft">
						{#if draft?.summary}<div class="draft-summary">{draft.summary}</div>{/if}
						{#if draft?.items?.length}
							<ul class="draft-items">
								{#each draft.items as it, ii (ii)}
									<li>
										<span class="cap">{it.capabilityId}</span>
										{#if it.riskLevel}<span class="risk">{it.riskLevel}</span>{/if}
										<span class="item-summary">{it.summary}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					{#if msg.result.actionId && pendingActionId === msg.result.actionId}
						<div class="confirm-actions">
							<button class="btn btn-confirm" disabled={busy} onclick={() => confirm(msg.result!.actionId!)}>
								Confirm & apply
							</button>
							<button class="btn btn-cancel" disabled={busy} onclick={() => cancel()}>Cancel</button>
						</div>
					{:else}
						<div class="confirm-done">This proposal is no longer pending.</div>
					{/if}
				{/if}

				{#if msg.role === 'agent' && traceSteps(msg.result).length}
					<details class="trace">
						<summary>Agent ran {traceSteps(msg.result).length} step(s)</summary>
						<ol>
							{#each traceSteps(msg.result) as s (s.step)}
								<li class:ok={s.ok} class:bad={!s.ok}>
									<span class="tstep">{s.ok ? '✓' : '✕'}</span>
									<span class="ttool">{s.toolId}</span>
									<span class="tstatus">{s.status}</span>
								</li>
							{/each}
						</ol>
					</details>
				{/if}
			</div>
		{/each}
	</div>

	<div class="agent-input">
		<textarea
			bind:value={input}
			onkeydown={onKey}
			rows="2"
			placeholder="Ask or propose a change…"
			disabled={busy}
		></textarea>
		<button class="btn btn-send" disabled={busy || !input.trim()} onclick={send}>Send</button>
	</div>
</div>

<style>
	.agent-chat {
		display: flex;
		flex-direction: column;
		gap: 12px;
		height: 100%;
		min-height: 0;
	}
	.agent-log {
		flex: 1 1 auto;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.agent-empty {
		font-size: 13px;
		color: var(--panel-fg-muted);
		line-height: 1.5;
	}
	.bubble {
		max-width: 92%;
		padding: 10px 12px;
		border-radius: 12px;
		font-size: 13px;
		line-height: 1.5;
	}
	.bubble.is-user {
		align-self: flex-end;
		background: rgba(234, 188, 60, 0.12);
		border: 1px solid var(--panel-border);
	}
	.bubble.is-agent {
		align-self: flex-start;
		background: var(--panel-surface-deep);
		border: 1px solid var(--panel-divider);
	}
	.bubble.is-danger {
		border-color: var(--panel-danger);
		background: rgba(225, 118, 118, 0.1);
	}
	/* markdown-lite output */
	.md :global(p) {
		margin: 0 0 6px;
	}
	.md :global(p:last-child) {
		margin-bottom: 0;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 4px 0;
		padding-left: 18px;
	}
	.md :global(code) {
		font-family: monospace;
		font-size: 12px;
		background: rgba(255, 255, 255, 0.06);
		padding: 1px 4px;
		border-radius: 4px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.chip {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--panel-border);
		background: transparent;
		color: var(--panel-fg);
		cursor: pointer;
		font-size: 12px;
	}
	.draft {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.draft-summary {
		font-size: 12px;
		color: var(--panel-fg);
		white-space: pre-wrap;
	}
	.draft-items {
		margin: 0;
		padding-left: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.draft-items li {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		padding: 6px 8px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
	}
	.cap {
		font-family: monospace;
		font-size: 10px;
		color: var(--panel-gold);
	}
	.risk {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--panel-danger);
		border: 1px solid var(--panel-danger);
		border-radius: 4px;
		padding: 0 4px;
	}
	.item-summary {
		font-size: 12px;
		color: var(--panel-fg);
	}
	.confirm-actions {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.confirm-done {
		margin-top: 8px;
		font-size: 12px;
		color: var(--panel-fg-muted);
	}
	.trace {
		margin-top: 8px;
		font-size: 12px;
	}
	.trace summary {
		cursor: pointer;
		color: var(--panel-fg-muted);
	}
	.trace ol {
		margin: 6px 0 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.trace li {
		display: flex;
		gap: 6px;
		font-family: monospace;
		font-size: 11px;
		color: var(--panel-fg-muted);
	}
	.trace li.ok .tstep {
		color: var(--panel-green-bright);
	}
	.trace li.bad .tstep {
		color: var(--panel-danger);
	}
	.agent-input {
		flex: 0 0 auto;
		display: flex;
		gap: 8px;
		align-items: flex-end;
	}
	.agent-input textarea {
		flex: 1 1 auto;
		resize: none;
		border-radius: 10px;
		border: 1px solid var(--panel-border);
		background: var(--panel-surface-deep);
		color: var(--panel-fg);
		padding: 8px 10px;
		font: inherit;
		font-size: 13px;
	}
	.btn {
		border-radius: 10px;
		border: 1px solid var(--panel-border);
		background: transparent;
		color: var(--panel-fg);
		padding: 8px 14px;
		cursor: pointer;
		font-size: 13px;
	}
	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.btn-confirm {
		background: rgba(95, 181, 94, 0.18);
		border-color: var(--panel-green-bright);
		color: var(--panel-green-bright);
	}
	.btn-send {
		background: rgba(234, 188, 60, 0.14);
		border-color: var(--panel-gold);
		color: var(--panel-gold-bright);
	}
</style>
