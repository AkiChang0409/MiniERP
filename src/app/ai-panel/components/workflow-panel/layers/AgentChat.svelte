<script lang="ts">
	import type { OrchestratorResult } from '$platform/ai/orchestrator';
	import { sendAgentMessage } from '$app-layer/ai-panel/agent/agent-api';

	interface ChatMessage {
		role: 'user' | 'agent';
		text: string;
		result?: OrchestratorResult;
	}

	interface DraftChange {
		taskId?: string;
		action: string;
		before?: unknown;
		after?: unknown;
		reason?: string;
	}
	interface DraftView {
		changes?: DraftChange[];
		risks?: string[];
	}

	// One conversation per panel session.
	const conversationId = `ai_panel:${crypto.randomUUID()}`;

	let input = $state('');
	let busy = $state(false);
	let messages = $state<ChatMessage[]>([]);
	/** The actionId of the currently-previewed confirmation, if any. */
	let pendingActionId = $state<string | null>(null);

	function currentProjectId(): string | undefined {
		if (typeof window === 'undefined') return undefined;
		const m = window.location.pathname.match(/\/projects\/([^/]+)/);
		return m?.[1];
	}

	function routeContext() {
		if (typeof window === 'undefined') return undefined;
		return { route: window.location.pathname, projectId: currentProjectId() };
	}

	function draftOf(result?: OrchestratorResult): DraftView | null {
		return (result?.draft as DraftView | undefined) ?? null;
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
			<div class="bubble" class:is-user={msg.role === 'user'} class:is-agent={msg.role === 'agent'}>
				<div class="bubble-text">{msg.text}</div>

				{#if msg.result?.kind === 'clarification' && msg.result.candidates?.length}
					<div class="chips">
						{#each msg.result.candidates as c (c.id)}
							<button class="chip" onclick={() => run({ message: c.label, conversationId, routeContext: routeContext() }, c.label)}>
								{c.label}
							</button>
						{/each}
					</div>
				{/if}

				{#if msg.result?.kind === 'confirmation'}
					{@const draft = draftOf(msg.result)}
					{#if draft?.changes?.length}
						<div class="diff">
							{#each draft.changes as ch, ci (ci)}
								<div class="diff-row">
									<span class="diff-action">{ch.action}</span>
									<div class="diff-body">
										{#if ch.reason}<div class="diff-reason">{ch.reason}</div>{/if}
										<div class="diff-ba">
											<span class="ba-before">{JSON.stringify(ch.before ?? {})}</span>
											<span class="ba-arrow">→</span>
											<span class="ba-after">{JSON.stringify(ch.after ?? {})}</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
						{#if draft.risks?.length}
							<ul class="risks">
								{#each draft.risks as r, ri (ri)}<li>{r}</li>{/each}
							</ul>
						{/if}
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
	.diff {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.diff-row {
		display: flex;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
	}
	.diff-action {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--panel-gold);
		flex: 0 0 auto;
		padding-top: 2px;
	}
	.diff-body {
		min-width: 0;
	}
	.diff-reason {
		color: var(--panel-fg);
	}
	.diff-ba {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		font-family: monospace;
		font-size: 11px;
		color: var(--panel-fg-muted);
	}
	.ba-after {
		color: var(--panel-green-bright);
	}
	.risks {
		margin: 8px 0 0;
		padding-left: 18px;
		font-size: 12px;
		color: var(--panel-fg-muted);
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
