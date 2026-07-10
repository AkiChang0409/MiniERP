import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolSpec } from '$platform/ai/capability-registry';

/**
 * Unified governed agent loop: cross-domain multi-step reads execute as their
 * owning agent, and a chosen write tool is returned as a `confirm_write`
 * proposal (never executed inside the loop).
 */

// Queue of decisions the mocked LLM returns, one per loop step.
const decisions: unknown[] = [];
vi.mock('$platform/ai/ai-runtime', () => ({
	runStructuredOutput: vi.fn(async () => {
		const value = decisions.shift();
		return { status: 'success', result: { value } };
	})
}));

// Capture guarded-capability calls; every read returns a canned ok result.
const execCalls: Array<{ agentId: string; capabilityId: string }> = [];
vi.mock('$platform/ai/execute-capability', () => ({
	executeGuardedCapability: vi.fn(async (args: { agentId: string; capabilityId: string }) => {
		execCalls.push({ agentId: args.agentId, capabilityId: args.capabilityId });
		return { status: 'ok', output: { of: args.capabilityId }, auditId: 'aud_1', decision: {} };
	})
}));

import { runWithTools } from '$platform/ai/orchestrator/run-with-tools';

function tool(partial: Partial<ToolSpec> & Pick<ToolSpec, 'id' | 'allowedAgents' | 'sideEffect'>): ToolSpec {
	return {
		description: partial.id,
		riskLevel: 'R1',
		ownerModule: 'test',
		requiresConfirmation: partial.sideEffect === 'write',
		requiredUserPermissions: [],
		parameters: null,
		...partial
	};
}

const salesRead = tool({ id: 'sales-crm.list-business-partners', allowedAgents: ['sales-crm-agent'], sideEffect: 'read' });
const financeRead = tool({ id: 'finance.answer-question', allowedAgents: ['finance-agent'], sideEffect: 'read' });
const projectWrite = tool({ id: 'project.update-task', allowedAgents: ['project-agent'], sideEffect: 'write' });

const baseInput = {
	agentId: 'orchestrator',
	agentVersion: '1.0.0',
	env: {} as Env,
	db: {} as never,
	capabilityCtx: { tenantId: 'default' },
	actor: { userId: 'u1', userEmail: null, roles: ['owner'] as ('owner')[] }
};

describe('runWithTools — unified cross-domain loop', () => {
	beforeEach(() => {
		decisions.length = 0;
		execCalls.length = 0;
	});

	it('runs multi-step cross-domain reads as the owning agent, then answers', async () => {
		decisions.push(
			{ action: 'call_tool', toolId: salesRead.id, input: {} },
			{ action: 'call_tool', toolId: financeRead.id, input: {} },
			{ action: 'final', answer: 'combined answer' }
		);

		const result = await runWithTools({
			...baseInput,
			userMessage: 'which customers have overdue invoices',
			tools: [salesRead, financeRead]
		});

		expect(result.status).toBe('final');
		expect(result.answer).toBe('combined answer');
		expect(result.steps).toHaveLength(2);
		// Each read executed as its own domain agent (allowedAgents[0]).
		expect(execCalls).toEqual([
			{ agentId: 'sales-crm-agent', capabilityId: 'sales-crm.list-business-partners' },
			{ agentId: 'finance-agent', capabilityId: 'finance.answer-question' }
		]);
	});

	it('stages write tools as a confirm_write batch without executing them', async () => {
		decisions.push(
			{
				action: 'call_tool',
				toolId: projectWrite.id,
				input: { taskId: 't1', dueDate: '2026-07-15' },
				summary: 'Reschedule task t1 to 2026-07-15'
			},
			{
				action: 'call_tool',
				toolId: projectWrite.id,
				input: { taskId: 't2', dueDate: '2026-07-16' },
				summary: 'Reschedule task t2 to 2026-07-16'
			},
			{ action: 'final', answer: 'Prepared 2 changes.' }
		);

		const result = await runWithTools({
			...baseInput,
			userMessage: 'move t1 to wed and t2 to thu',
			tools: [projectWrite]
		});

		expect(result.status).toBe('confirm_write');
		expect(result.writes).toEqual([
			{
				agentId: 'project-agent',
				capabilityId: 'project.update-task',
				input: { taskId: 't1', dueDate: '2026-07-15' },
				summary: 'Reschedule task t1 to 2026-07-15'
			},
			{
				agentId: 'project-agent',
				capabilityId: 'project.update-task',
				input: { taskId: 't2', dueDate: '2026-07-16' },
				summary: 'Reschedule task t2 to 2026-07-16'
			}
		]);
		// No write reached the guarded executor.
		expect(execCalls).toHaveLength(0);
	});

	it('rejects a tool not in the catalog and recovers', async () => {
		decisions.push(
			{ action: 'call_tool', toolId: 'not.a.tool', input: {} },
			{ action: 'final', answer: 'ok' }
		);

		const result = await runWithTools({
			...baseInput,
			userMessage: 'x',
			tools: [salesRead]
		});

		expect(result.status).toBe('final');
		expect(result.steps[0]).toMatchObject({ toolId: 'not.a.tool', ok: false, status: 'not_allowed' });
		expect(execCalls).toHaveLength(0);
	});
});
