import type { ModuleContext } from '$platform/modules/types';
import { appendAgentAuditEntry } from '$platform/audit/audit-log';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import { getState, patchState } from '$platform/workflow/workflow-runtime';
import { financeAgentManifest } from '../agent';
import { suggestNextFinanceTask } from './finance-task-service';
import { validateExpenseRecord } from '../domain/rules';
import { findCategoryById, type CategoryDefinition } from '../workflows/financial-document-intake';
import {
	allowanceConfirmationSchema,
	type AllowanceConfirmationPayload
} from '../workflows/allowance-recording';
import { createFinanceApi } from './api';

/**
 * Finance workflow confirmation (R4 record creation). Single-domain — lives in
 * the finance module (its owner). Was previously in the app-layer orchestrator;
 * moved here because it only touches finance + platform (no cross-module), so
 * it does not belong in the composition layer.
 */

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
	categoryId?: string;
}

export interface ConfirmBody {
	payload?: ConfirmedPayload;
	payloadHash?: string;
	allowancePayload?: AllowanceConfirmationPayload;
	allowancePayloadHash?: string;
}

export type WorkflowConfirmResult =
	| {
			ok: true;
			data: {
				entityId: string;
				auditRef: string;
				entityRoute: string;
				categoryId: string;
				nextTask: unknown;
			};
	  }
	| { ok: false; status: number; message: string; details?: unknown };

const fail = (message: string, status: number, details?: unknown): WorkflowConfirmResult => ({
	ok: false,
	status,
	message,
	details
});

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
			`Per-diem - ${payload.staffName} - ${payload.destination} - ${payload.days} days @ ${payload.dailyRate}/day`
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
	for (const candidate of ids) {
		if (!candidate) continue;
		const cat = findCategoryById(candidate);
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
		notes: `Recorded via Finance Agent - ${category.label} - ${payload.fields.documentNumber}${payload.poId ? ` - po=${payload.poId}` : ''}`
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
		notes: `Recorded via Finance Agent - invoice ${payload.fields.documentNumber}`
	};
}

export async function confirmFinanceWorkflow(
	ctx: ModuleContext,
	args: { instanceId: string; body: ConfirmBody }
): Promise<WorkflowConfirmResult> {
	const { env, db, user } = ctx;
	if (!user) return fail('Unauthorized', 401);
	const kv = env.KV;
	const { instanceId: id, body } = args;

	const state = await getState(kv, id);
	if (!state) return fail('Workflow not found', 404);
	if (state.status !== 'active') return fail(`Workflow is ${state.status}`, 409);
	if (state.step !== 'user_confirmation') {
		return fail(`Confirmation only valid at step 'user_confirmation'. Current: ${state.step}.`, 409);
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

		await patchState(kv, state.id, {
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

		return {
			ok: true,
			data: {
				entityId: created.id,
				auditRef: audit.auditId,
				entityRoute: '/finance/expenses',
				categoryId: 'expense.opex.allowance',
				nextTask: null
			}
		};
	}

	// ---- document-driven branch (vendor-invoice-intake / financial-document-intake) ----
	if (!body.payload || !body.payloadHash) {
		return fail('payload and payloadHash are required', 400);
	}

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
		return fail('Payload hash mismatch - UI state and submission do not agree.', 400);
	}

	let category: CategoryDefinition;
	try {
		category = resolveCategory(body.payload, state.data);
	} catch (err) {
		return fail(err instanceof Error ? err.message : 'Could not resolve category', 400);
	}

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
		outputRefs: { entityType: category.persistTarget, entityId, categoryId: category.id },
		finalAction,
		status: 'ok'
	});

	const nextTask = await suggestNextFinanceTask(
		db,
		state.tenantId,
		{
			afterWorkflowId: state.workflowId,
			afterSupplierName: body.payload.fields.counterpartyName
		},
		new Date()
	);

	await patchState(kv, state.id, {
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
			nextTask
		}
	});

	return {
		ok: true,
		data: {
			entityId,
			auditRef: audit.auditId,
			entityRoute,
			categoryId: category.id,
			nextTask
		}
	};
}
