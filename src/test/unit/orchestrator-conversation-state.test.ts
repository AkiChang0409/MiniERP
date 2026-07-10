import { describe, it, expect } from 'vitest';
import {
	setPendingConfirmation,
	consumePendingConfirmation,
	getConversationState,
	saveConversationState
} from '$platform/ai/orchestrator/conversation-state';

/** Minimal in-memory KVNamespace stub (only the methods conversation-state uses). */
function makeKv() {
	const store = new Map<string, string>();
	return {
		async get(key: string) {
			return store.get(key) ?? null;
		},
		async put(key: string, value: string) {
			store.set(key, value);
		},
		async delete(key: string) {
			store.delete(key);
		}
	} as unknown as KVNamespace;
}

const base = {
	conversationId: 'ai_panel:test',
	source: 'ai_panel' as const,
	userId: 'user_1',
	tenantId: 'default'
};

const draftConfirmation = {
	actionId: 'act_1',
	summary: '1 change(s) to project prj_1',
	items: [
		{
			agentId: 'project-agent',
			capabilityId: 'project.apply-task-change-set',
			riskLevel: 'R4' as const,
			summary: '1 change(s) to project prj_1',
			input: { projectId: 'prj_1', changes: [{ action: 'reschedule', taskId: 't1', after: {} }] }
		}
	]
};

describe('orchestrator conversation-state — confirmation loop', () => {
	it('stages then consumes a pending confirmation exactly once', async () => {
		const kv = makeKv();
		const pending = await setPendingConfirmation(kv, base, draftConfirmation);
		expect(pending.payloadHash).toBeTypeOf('string');
		expect(pending.payloadHash.length).toBeGreaterThan(0);

		const first = await consumePendingConfirmation(kv, base.conversationId, { actionId: 'act_1' });
		expect(first.ok).toBe(true);

		// A retried confirm finds nothing pending (no double-execute).
		const second = await consumePendingConfirmation(kv, base.conversationId, { actionId: 'act_1' });
		expect(second.ok).toBe(false);
		if (!second.ok) expect(second.reason).toBe('none_pending');
	});

	it('rejects a mismatched actionId without consuming', async () => {
		const kv = makeKv();
		await setPendingConfirmation(kv, base, draftConfirmation);

		const wrong = await consumePendingConfirmation(kv, base.conversationId, { actionId: 'nope' });
		expect(wrong.ok).toBe(false);
		if (!wrong.ok) expect(wrong.reason).toBe('action_mismatch');

		// Still pending after a mismatch.
		const right = await consumePendingConfirmation(kv, base.conversationId, { actionId: 'act_1' });
		expect(right.ok).toBe(true);
	});

	it('rejects an expired confirmation', async () => {
		const kv = makeKv();
		const state = await getConversationState(kv, base.conversationId);
		await saveConversationState(kv, {
			...(state ?? { ...base, updatedAt: new Date().toISOString() }),
			conversationId: base.conversationId,
			source: base.source,
			pendingConfirmation: {
				...draftConfirmation,
				payloadHash: 'deadbeef',
				expiresAt: new Date(Date.now() - 1000).toISOString()
			}
		});

		const outcome = await consumePendingConfirmation(kv, base.conversationId, { actionId: 'act_1' });
		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.reason).toBe('expired');
	});

	it('stages and consumes a multi-write batch as one confirmation', async () => {
		const kv = makeKv();
		const batch = {
			actionId: 'act_batch',
			summary: '2 changes',
			items: [
				{
					agentId: 'project-agent',
					capabilityId: 'project.update-task',
					riskLevel: 'R4' as const,
					summary: 'Reschedule t1',
					input: { taskId: 't1' }
				},
				{
					agentId: 'sales-crm-agent',
					capabilityId: 'sales-crm.create-business-partner',
					riskLevel: 'R4' as const,
					summary: 'Create Acme',
					input: { name: 'Acme' }
				}
			]
		};
		const pending = await setPendingConfirmation(kv, base, batch);
		expect(pending.items).toHaveLength(2);

		const outcome = await consumePendingConfirmation(kv, base.conversationId, { actionId: 'act_batch' });
		expect(outcome.ok).toBe(true);
		if (outcome.ok) {
			expect(outcome.confirmation.items.map((i) => i.capabilityId)).toEqual([
				'project.update-task',
				'sales-crm.create-business-partner'
			]);
		}
	});

	it('verifies payloadHash when provided', async () => {
		const kv = makeKv();
		const pending = await setPendingConfirmation(kv, base, draftConfirmation);

		const mismatch = await consumePendingConfirmation(kv, base.conversationId, {
			actionId: 'act_1',
			payloadHash: 'wronghash'
		});
		expect(mismatch.ok).toBe(false);
		if (!mismatch.ok) expect(mismatch.reason).toBe('hash_mismatch');

		const good = await consumePendingConfirmation(kv, base.conversationId, {
			actionId: 'act_1',
			payloadHash: pending.payloadHash
		});
		expect(good.ok).toBe(true);
	});
});
