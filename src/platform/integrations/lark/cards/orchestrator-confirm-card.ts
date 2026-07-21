/**
 * Orchestrator write-confirmation card (P5).
 *
 * The unified agent loop stages a write and returns `kind:'confirmation'` with an
 * `actionId`. On Lark we render this as an interactive card whose Confirm/Cancel
 * buttons post the `actionId` (+ `conversationId`) back to the card-callback
 * route, which feeds `{confirm:{actionId}}` into the orchestrator — replacing the
 * old "reply 确认" text flow. The button `value.action` is dispatched in
 * `src/routes/api/integrations/lark/card-callback/+server.ts`.
 *
 * Only the actionId + a human summary travel in the card; the staged write
 * payload stays server-side in KV (`pendingConfirmation`).
 */
export function buildOrchestratorConfirmCard(
	actionId: string,
	conversationId: string,
	summary: string
): Record<string, unknown> {
	return {
		config: { wide_screen_mode: true },
		header: {
			template: 'orange',
			title: { tag: 'plain_text', content: '⚠️ 待确认操作' }
		},
		elements: [
			{ tag: 'div', text: { tag: 'lark_md', content: summary || '确认执行此操作？' } },
			{ tag: 'hr' },
			{
				tag: 'action',
				actions: [
					{
						tag: 'button',
						text: { tag: 'plain_text', content: '✅ 确认执行' },
						type: 'primary',
						value: { action: 'orch_confirm', action_id: actionId, conversation_id: conversationId }
					},
					{
						tag: 'button',
						text: { tag: 'plain_text', content: '🚫 取消' },
						type: 'danger',
						value: { action: 'orch_cancel', action_id: actionId, conversation_id: conversationId }
					}
				]
			}
		]
	};
}
