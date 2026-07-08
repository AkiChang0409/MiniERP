import { vi, describe, it, expect } from 'vitest';

// With no AI env the LLM classifier returns null, so planHrAction uses the
// deterministic rule fallback — that's the path we assert here.
vi.mock('$modules/hr/leave-api', () => ({
	createLeaveApi: () => ({
		listLeaveTypes: async () => [{ id: 'lt-annual', code: 'ANNUAL', name: '年假' }]
	})
}));

import { planHrAction, renderHrResult } from '$modules/hr/agent/plan-action';
import type { PlanActionArgs } from '$platform/ai/orchestrator';

function args(text: string): PlanActionArgs {
	return {
		message: { source: 'lark', text, conversationId: 'lark:test', userId: 'u1' },
		context: { source: 'lark', roles: [] },
		moduleContext: {} as never,
		env: {} as never
	};
}

describe('planHrAction (rule fallback)', () => {
	it('maps a list request to a read action', async () => {
		const plan = await planHrAction(args('查看待审批请假'));
		expect(plan.kind).toBe('read');
		if (plan.kind === 'read') expect(plan.capabilityId).toBe('hr.list-pending-leave');
	});

	it('maps a submit request to a staged write with resolved leave type', async () => {
		const plan = await planHrAction(args('提交请假 年假 2026-07-20 2026-07-22'));
		expect(plan.kind).toBe('write');
		if (plan.kind === 'write') {
			expect(plan.capabilityId).toBe('hr.submit-leave-request');
			expect(plan.input).toMatchObject({
				leaveTypeId: 'lt-annual',
				startDate: '2026-07-20',
				endDate: '2026-07-22'
			});
		}
	});

	it('asks for clarification when the leave type is unknown', async () => {
		const plan = await planHrAction(args('提交请假 xyz 2026-07-20 2026-07-22'));
		expect(plan.kind).toBe('clarification');
	});

	it('returns unknown for an out-of-scope message', async () => {
		const plan = await planHrAction(args('帮我改一下工资'));
		expect(plan.kind).toBe('unknown');
	});
});

describe('renderHrResult (template fallback)', () => {
	it('formats a pending-leave list', async () => {
		const text = await renderHrResult({
			capabilityId: 'hr.list-pending-leave',
			output: { requests: [{ id: 'lr1', personName: 'Ann', startDate: '2026-07-20', endDate: '2026-07-21', totalDays: 2 }] },
			env: {} as never
		});
		expect(text).toContain('待审批请假');
		expect(text).toContain('lr1');
	});

	it('formats a submitted leave', async () => {
		const text = await renderHrResult({
			capabilityId: 'hr.submit-leave-request',
			output: { id: 'lr9', totalDays: 3, status: 'pending' },
			env: {} as never
		});
		expect(text).toContain('已提交请假');
		expect(text).toContain('lr9');
	});
});
