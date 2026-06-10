import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import { createModuleContext } from '$platform/modules';
import { getDb } from '../../../../../../infrastructure/db';
import { financeAgentManifest } from '../../../../../../modules/finance/agent';
import { suggestNextFinanceTaskCapability } from '../../../../../../modules/finance/capabilities/suggest-next-task';
import { validateExpenseRecord } from '$modules/finance';
import { createFinanceApi } from '../../../../../../modules/finance/services/api';
import {
	findCategoryById,
	type CategoryDefinition
} from '../../../../../../modules/finance/workflows/financial-document-intake';
import {
	allowanceConfirmationSchema,
	type AllowanceConfirmationPayload
} from '../../../../../../modules/finance/workflows/allowance-recording';
import { appendAgentAuditEntry } from '../../../../../../platform/audit/audit-log';
import {
	getState,
	patchState
} from '../../../../../../platform/workflow/workflow-runtime';

interface ConfirmedFields {
	documentNumber: string;
	counterpartyName: string;
	currency: string;
	totalAmount: number;
	gstAmount: number;
	issueDate: string;
	dueDate: string;
}

interface ConfirmedPayload {
	documentId: string;
	supplierId: string | null;
	poId: string | null;
	projectId: string | null;
	fields: ConfirmedFields;
	/** Phase 3: caller can pin the category id; otherwise we read it from
	 *  workflow state, otherwise we default to `expense.sales_cost.invoice`. */
	categoryId?: string;
}

interface ConfirmBody {
	payload?: ConfirmedPayload;
	payloadHash?: string;
	/** allowance-recording shortcut 鈥?caller sends the validated form payload
	 *  directly; no document fields. */
	allowancePayload?: AllowanceConfirmationPayload;
	allowancePayloadHash?: string;
}

function buildAllowanceExpenseInput(payload: AllowanceConfirmationPayload) {
	return {
		expenseType: 'opex' as const,
		category: 'allowance',
		amount: payload.totalAmount,
		currency: payload.currency,
		date: payload.dateStart,
		staffName: payload.staffName,
		businessTrip: true,
		destination: payload.destination,
		notes:
			payload.notes ??
			`Per-diem 路 ${payload.staffName} 路 ${payload.destination} 路 ${payload.days} days @ ${payload.dailyRate}/day`
	} as const;
}

const VENDOR_INVOICE_INTAKE_DEFAULT_CATEGORY = 'expense.sales_cost.invoice';
const FALLBACK_CATEGORY = 'expense.opex.others';

function resolveCategory(
	payload: ConfirmedPayload,
	stateData: Record<string, unknown>
): CategoryDefinition {
	const stateSel = stateData.categorySelection as { categoryId?: string } | undefined;
	const ids = [
		payload.categoryId,
		stateSel?.categoryId,
		stateData.selectedCategoryId as string | undefined,
		VENDOR_INVOICE_INTAKE_DEFAULT_CATEGORY,
		FALLBACK_CATEGORY
	];
	for (const id of ids) {
		if (!id) continue;
		const cat = findCategoryById(id);
		if (cat) return cat;
	}
	throw new Error('No resolvable category for confirm step.');
}

function buildExpenseInput(payload: ConfirmedPayload, category: CategoryDefinition) {
	const expenseType = category.expenseType ?? 'opex';
	const cat = category.category ?? 'others';
	return {
		expenseType,
		category: cat,
		amount: payload.fields.totalAmount,
		currency: payload.fields.currency,
		date: payload.fields.issueDate,
		vendorOrSupplier: payload.fields.counterpartyName,
		notes: `Recorded via Finance Agent 路 ${category.label} 路 ${payload.fields.documentNumber}${payload.poId ? ` 路 po=${payload.poId}` : ''}`
	} as const;
}

function buildRevenueInput(payload: ConfirmedPayload) {
	return {
		projectId: payload.projectId,
		invoiceType: 'tax_invoice' as const,
		invoiceNumber: payload.fields.documentNumber,
		clientName: payload.fields.counterpartyName,
		date: payload.fields.issueDate,
		amount: payload.fields.totalAmount,
		currency: payload.fields.currency,
		gstAmount: payload.fields.gstAmount,
		notes: `Recorded via Finance Agent 路 invoice ${payload.fields.documentNumber}`
	};
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Workflow id is required', 400);

	const env = event.platform.env;
	const db = getDb(env);

	const body = (await event.request.json().catch(() => null)) as ConfirmBody | null;
	if (!body) return fail('Invalid JSON body', 400);

	const state = await getState(env.KV, id);
	if (!state) return fail('Workflow not found', 404);
	if (state.status !== 'active') return fail(`Workflow is ${state.status}`, 409);
	if (state.step !== 'user_confirmation') {
		return fail(
			`Confirmation only valid at step 'user_confirmation'. Current: ${state.step}.`,
			409
		);
	}

	// ---- allowance-recording branch ----
	if (state.workflowId === 'allowance-recording') {
		const payload = body.allowancePayload;
		const payloadHash = body.allowancePayloadHash;
		if (!payload || !payloadHash) {
			return fail('allowancePayload and allowancePayloadHash are required', 400);
		}

		const recomputed = await hashConfirmationPayload(payload);
		if (recomputed !== payloadHash) {
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: user.id,
				userEmail: user.email,
				tenantId: state.tenantId,
				workflowId: state.id,
				workflowStep: state.step,
				toolId: 'finance.create-expense-record',
				riskLevel: 'R4',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef: payloadHash,
				finalAction: 'agent.confirmation_failed',
				status: 'failed',
				errorCode: 'payload_hash_mismatch'
			});
			return fail('Payload hash mismatch.', 400);
		}

		const parsed = allowanceConfirmationSchema.safeParse(payload);
		if (!parsed.success) {
			const issues = parsed.error.issues.map((i) => ({
				field: i.path.join('.') || '<root>',
				message: i.message
			}));
			return fail('Validation failed', 400, { issues });
		}

		const expenseInput = buildAllowanceExpenseInput(parsed.data);
		const validation = validateExpenseRecord(expenseInput);
		if (!validation.success) {
			const issues = validation.error.issues.map((i) => ({
				field: i.path.join('.') || '<root>',
				message: i.message
			}));
			return fail('Validation failed', 400, { issues });
		}

		const ctx = await createModuleContext(event);
		const finance = createFinanceApi(ctx);
		const created = await finance.expenses.createStandaloneExpense(expenseInput);

		const audit = await appendAgentAuditEntry(db, {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			userId: user.id,
			userEmail: user.email,
			tenantId: state.tenantId,
			workflowId: state.id,
			workflowStep: 'record_creation',
			toolId: 'finance.create-expense-record',
			riskLevel: 'R4',
			permissionResult: 'allowed',
			confirmationRequired: true,
			confirmationRef: recomputed,
			modelId: 'mock-v1',
			promptVersion: 'mock-v1',
			schemaVersion: 'v1',
			outputRefs: {
				entityType: 'expense',
				entityId: created.id,
				categoryId: 'expense.opex.allowance'
			},
			finalAction: 'expense.created.opex.allowance',
			status: 'ok'
		});

		await patchState(env.KV, state.id, {
			step: 'completion',
			status: 'completed',
			confirmationRef: recomputed,
			dataPatch: {
				confirmation: {
					entityId: created.id,
					auditRef: audit.auditId,
					categoryId: 'expense.opex.allowance',
					persistTarget: 'expenses',
					confirmedAt: Date.now()
				}
			}
		});

		return ok({
			entityId: created.id,
			auditRef: audit.auditId,
			entityRoute: '/finance/expenses',
			categoryId: 'expense.opex.allowance',
			nextTask: null
		});
	}

	// ---- document-driven branch (vendor-invoice-intake / financial-document-intake) ----
	if (!body.payload || !body.payloadHash) {
		return fail('payload and payloadHash are required', 400);
	}

	// 1. Hash check (tamper guard).
	const recomputedHash = await hashConfirmationPayload(body.payload);
	if (recomputedHash !== body.payloadHash) {
		await appendAgentAuditEntry(db, {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			userId: user.id,
			userEmail: user.email,
			tenantId: state.tenantId,
			workflowId: state.id,
			workflowStep: state.step,
			toolId: 'finance.create-expense-record',
			riskLevel: 'R4',
			permissionResult: 'allowed',
			confirmationRequired: true,
			confirmationRef: body.payloadHash,
			finalAction: 'agent.confirmation_failed',
			status: 'failed',
			errorCode: 'payload_hash_mismatch'
		});
		return fail('Payload hash mismatch 鈥?UI state and submission do not agree.', 400);
	}

	// 2. Resolve category 鈥?drives everything below.
	let category: CategoryDefinition;
	try {
		category = resolveCategory(body.payload, state.data);
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'Could not resolve category', 400);
	}

	// 3. Branch persistence by category.persistTarget.
	const ctx = await createModuleContext(event);
	const finance = createFinanceApi(ctx);

	let entityId: string;
	let entityRoute: string;
	let toolId: string;
	let finalAction: string;

	if (category.persistTarget === 'expenses') {
		const expenseInput = buildExpenseInput(body.payload, category);
		const validation = validateExpenseRecord(expenseInput);
		if (!validation.success) {
			const issues = validation.error.issues.map((issue) => ({
				field: issue.path.join('.') || '<root>',
				message: issue.message
			}));
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: user.id,
				userEmail: user.email,
				tenantId: state.tenantId,
				workflowId: state.id,
				workflowStep: state.step,
				toolId: 'finance.validate-expense-draft',
				riskLevel: 'R2',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef: recomputedHash,
				outputRefs: { issues, categoryId: category.id },
				finalAction: 'agent.validation_failed',
				status: 'failed',
				errorCode: 'validation_failed'
			});
			return fail('Validation failed', 400, { issues });
		}
		const created = await finance.expenses.createStandaloneExpense(expenseInput);
		entityId = created.id;
		entityRoute = '/finance/expenses';
		toolId = 'finance.create-expense-record';
		finalAction = `expense.created.${category.expenseType}.${category.category}`;
	} else if (category.persistTarget === 'revenue') {
		const created = await finance.revenue.createRevenue(buildRevenueInput(body.payload));
		entityId = created.id;
		entityRoute = '/finance/revenue';
		toolId = 'finance.create-revenue-record';
		finalAction = 'revenue.created';
	} else {
		// contracts / quotations / purchase_orders 鈥?Phase 3 leaves these to
		// the legacy doc-hub flow. The new workflow will route here once we
		// wire archive persistence in a follow-up stage.
		await appendAgentAuditEntry(db, {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			userId: user.id,
			userEmail: user.email,
			tenantId: state.tenantId,
			workflowId: state.id,
			workflowStep: state.step,
			toolId: 'finance.create-document-archive',
			riskLevel: 'R4',
			permissionResult: 'allowed',
			confirmationRequired: true,
			confirmationRef: recomputedHash,
			outputRefs: { categoryId: category.id, persistTarget: category.persistTarget },
			finalAction: 'agent.archive_persist_not_implemented',
			status: 'failed',
			errorCode: 'archive_persist_not_implemented'
		});
		return fail(
			`Archive persistence (${category.persistTarget}) lands in a follow-up stage. Use the doc-hub flow for now.`,
			501
		);
	}

	// 4. Audit + state finalize.
	const audit = await appendAgentAuditEntry(db, {
		agentId: financeAgentManifest.id,
		agentVersion: financeAgentManifest.version,
		userId: user.id,
		userEmail: user.email,
		tenantId: state.tenantId,
		workflowId: state.id,
		workflowStep: 'record_creation',
		toolId,
		riskLevel: 'R4',
		permissionResult: 'allowed',
		confirmationRequired: true,
		confirmationRef: recomputedHash,
		modelId: 'mock-v1',
		promptVersion: 'mock-v1',
		schemaVersion: 'v1',
		outputRefs: {
			entityType: category.persistTarget,
			entityId,
			categoryId: category.id
		},
		finalAction,
		status: 'ok'
	});

	const suggestion = await suggestNextFinanceTaskCapability.execute(
		{
			afterWorkflowId: state.workflowId,
			afterSupplierName: body.payload.fields.counterpartyName
		},
		{ tenantId: state.tenantId, userId: state.userId, useMock: true }
	);

	await patchState(env.KV, state.id, {
		step: 'completion',
		status: 'completed',
		confirmationRef: recomputedHash,
		dataPatch: {
			confirmation: {
				entityId,
				auditRef: audit.auditId,
				categoryId: category.id,
				persistTarget: category.persistTarget,
				confirmedAt: Date.now()
			},
			nextTask: suggestion.task
		}
	});

	return ok({
		entityId,
		auditRef: audit.auditId,
		entityRoute,
		categoryId: category.id,
		nextTask: suggestion.task
	});
};

