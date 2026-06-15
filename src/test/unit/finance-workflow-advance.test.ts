import { describe, it, expect, beforeEach } from 'vitest';
import {
	registerCapability,
	clearCapabilityRegistry,
	type PlatformCapability,
	type ToolManifest
} from '$platform/ai/capability-registry';
import { clearWorkflowRegistry, registerWorkflow } from '$platform/workflow/workflow-registry';
import { startWorkflow, getState } from '$platform/workflow/workflow-runtime';
import { advanceInstance, type WorkflowRunIdentity } from '$platform/workflow/workflow-engine';
import { buildFinanceWorkflowDefinitions, financeCapabilities } from '$modules/finance';

/**
 * End-to-end advance test for the REAL finance `financial-document-intake`
 * workflow running on the generic engine: registers the real finance
 * capabilities + the finance workflow definitions, then drives the engine
 * step-by-step. Validates the migration (hooks + registry-driven execution)
 * without needing Cloudflare bindings or the UI. Capabilities run in mock mode
 * and a `mock-` document id skips the cross-module text load.
 */

function makeKV(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: async (k: string) => store.get(k) ?? null,
		put: async (k: string, v: string) => void store.set(k, v),
		delete: async (k: string) => void store.delete(k)
	} as unknown as KVNamespace;
}

const run: WorkflowRunIdentity = {
	agentId: 'finance-agent',
	agentVersion: 'test',
	user: { id: 'u1', email: 'u1@example.com', roles: ['owner'] } as App.Locals['user'],
	db: {} as never, // unused: test registers capabilities with auditRequired=false
	env: {} as never, // unused: mock- doc id + useMock fixture path
	useMock: true
};

describe('finance financial-document-intake on the generic engine', () => {
	beforeEach(() => {
		clearCapabilityRegistry();
		clearWorkflowRegistry();
		// Register the real finance capabilities (audit off so no DB is needed).
		for (const capability of financeCapabilities) {
			const manifest: ToolManifest = {
				id: capability.id,
				ownerModule: 'finance',
				description: capability.description,
				riskLevel: capability.riskLevel,
				allowedAgents: ['finance-agent'],
				requiredUserPermissions: [],
				requiresConfirmation: false,
				auditRequired: false,
				enabled: true,
				sideEffect: 'read'
			};
			registerCapability(manifest, capability as PlatformCapability<unknown, unknown>);
		}
		// Register the real finance workflow definitions (mock text loader).
		for (const def of buildFinanceWorkflowDefinitions({
			loadDocumentText: async () => ({})
		})) {
			registerWorkflow(def);
		}
	});

	it('drives document_intake → … → user_confirmation, folding outputs into state', async () => {
		const kv = makeKV();
		const instance = await startWorkflow(kv, {
			workflowId: 'financial-document-intake',
			agentId: 'finance-agent',
			initialStep: 'trigger',
			userId: 'u1',
			tenantId: 't1'
		});

		const steps: Array<{ targetStep: string; payload?: Record<string, unknown> }> = [
			{ targetStep: 'document_intake', payload: { documentId: 'mock-1', fileName: 'inv.pdf' } },
			{ targetStep: 'bucket_selection', payload: { bucket: 'expense' } },
			{ targetStep: 'category_selection', payload: { categoryId: 'expense.sales_cost.invoice' } },
			{ targetStep: 'field_extraction' },
			{ targetStep: 'matching' },
			{ targetStep: 'user_confirmation' }
		];

		for (const step of steps) {
			const res = await advanceInstance({ kv, instanceId: instance.id, ...step, run });
			expect(res.ok, `advance to ${step.targetStep} failed: ${res.ok ? '' : res.message}`).toBe(
				true
			);
			if (res.ok) expect(res.state.step).toBe(step.targetStep);
		}

		const state = await getState(kv, instance.id);
		expect(state?.step).toBe('user_confirmation');
		const data = state?.data as Record<string, any>;
		expect(data.document.documentId).toBe('mock-1');
		expect(data.bucketSelection.bucket).toBe('expense');
		expect(data.categorySelection.categoryId).toBe('expense.sales_cost.invoice');
		expect(data.extraction).toBeDefined();
		expect(data.extraction.fields).toBeDefined();
		expect(data.matching).toBeDefined();
		expect(Array.isArray(data.matching.supplierCandidates)).toBe(true);
	});

	it('rejects an out-of-order advance (400)', async () => {
		const kv = makeKV();
		const instance = await startWorkflow(kv, {
			workflowId: 'financial-document-intake',
			agentId: 'finance-agent',
			initialStep: 'trigger',
			userId: 'u1',
			tenantId: 't1'
		});
		// trigger.nextSteps = ['document_intake']; jumping to matching is illegal.
		const res = await advanceInstance({ kv, instanceId: instance.id, targetStep: 'matching', run });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.status).toBe(400);
	});
});
