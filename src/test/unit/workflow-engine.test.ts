import { describe, it, expect, beforeEach } from 'vitest';
import {
	registerCapability,
	clearCapabilityRegistry,
	type PlatformCapability,
	type ToolManifest
} from '$platform/ai/capability-registry';
import {
	registerWorkflow,
	clearWorkflowRegistry,
	type WorkflowDefinition
} from '$platform/workflow/workflow-registry';
import { startWorkflow, getState } from '$platform/workflow/workflow-runtime';
import { advanceInstance, type WorkflowRunIdentity } from '$platform/workflow/workflow-engine';

/**
 * Proves the engine is genuinely generic: it is exercised with a fabricated,
 * non-finance workflow + capability. If the engine had any domain-specific
 * assumption, these would not pass.
 */

function makeKV(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => {
			store.set(k, v);
		},
		delete: async (k: string) => {
			store.delete(k);
		}
	} as unknown as KVNamespace;
}

const echoCapability: PlatformCapability<unknown, unknown> = {
	id: 'test.echo',
	description: 'Echo the input back (test only).',
	riskLevel: 'R1',
	async execute(input) {
		return { echoed: input };
	}
};

const echoManifest: ToolManifest = {
	id: 'test.echo',
	ownerModule: 'test',
	description: 'Echo (test).',
	riskLevel: 'R1',
	allowedAgents: ['test-agent'],
	requiredUserPermissions: [],
	requiresConfirmation: false,
	auditRequired: false, // keep audit off so no DB is needed in the unit test
	enabled: true,
	sideEffect: 'read'
};

const testWorkflow: WorkflowDefinition = {
	id: 'test-wf',
	initialStep: 'start',
	steps: [
		{ id: 'start', capabilities: [], requiresUserConfirmation: false, nextSteps: ['run'] },
		{ id: 'run', capabilities: ['test.echo'], requiresUserConfirmation: false, nextSteps: ['done'] },
		{ id: 'done', capabilities: [], requiresUserConfirmation: false, nextSteps: [] }
	],
	applyStepResult: ({ outputs }) => ({ dataPatch: { lastOutput: outputs[0] } })
};

const baseRun: WorkflowRunIdentity = {
	agentId: 'test-agent',
	agentVersion: '0.0.0',
	user: { id: 'u1', email: 'u1@example.com', roles: ['owner'] } as App.Locals['user'],
	db: {} as never, // unused: auditRequired=false
	env: {} as never, // unused: echo capability ignores ctx.env
	useMock: true
};

describe('generic workflow engine', () => {
	beforeEach(() => {
		clearCapabilityRegistry();
		clearWorkflowRegistry();
		registerCapability(echoManifest, echoCapability);
		registerWorkflow(testWorkflow);
	});

	it('advances a step, runs its capability via the registry, folds output into state', async () => {
		const kv = makeKV();
		const instance = await startWorkflow(kv, {
			workflowId: 'test-wf',
			agentId: 'test-agent',
			initialStep: 'start',
			userId: 'u1',
			tenantId: 't1'
		});

		const res = await advanceInstance({
			kv,
			instanceId: instance.id,
			targetStep: 'run',
			payload: { x: 1 },
			run: baseRun
		});

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.state.step).toBe('run');
			expect(res.state.data.lastOutput).toEqual({ echoed: { x: 1 } });
		}
		const persisted = await getState(kv, instance.id);
		expect(persisted?.step).toBe('run');
	});

	it('rejects an illegal transition (400)', async () => {
		const kv = makeKV();
		const instance = await startWorkflow(kv, {
			workflowId: 'test-wf',
			agentId: 'test-agent',
			initialStep: 'start',
			userId: 'u1',
			tenantId: 't1'
		});
		// start.nextSteps = ['run']; 'done' is not reachable directly.
		const res = await advanceInstance({
			kv,
			instanceId: instance.id,
			targetStep: 'done',
			run: baseRun
		});
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.status).toBe(400);
	});

	it('denies when the agent is not allowed the step capability (403)', async () => {
		const kv = makeKV();
		const instance = await startWorkflow(kv, {
			workflowId: 'test-wf',
			agentId: 'test-agent',
			initialStep: 'start',
			userId: 'u1',
			tenantId: 't1'
		});
		const res = await advanceInstance({
			kv,
			instanceId: instance.id,
			targetStep: 'run',
			payload: { x: 1 },
			run: { ...baseRun, agentId: 'intruder-agent' }
		});
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.status).toBe(403);
	});
});
