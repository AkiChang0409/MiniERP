/**
 * Finance workflow application service (composition layer).
 *
 * Owns the orchestration that previously lived inside the HTTP routes:
 * workflow state-machine driving, capability policy gating, agent audit, and
 * per-step business-input construction. Routes (`+server.ts`) are now thin
 * adapters that parse HTTP, authn, call into here, and map the result to
 * ok()/fail().
 *
 * Lives in `src/app/` because it composes multiple modules' workflow runners
 * (finance + document-intake) + platform runtime — which the app/composition
 * layer is allowed to do (boundary linter Rule 2 exempts `src/app/*`).
 */
import { getDb, type DBClient } from '$infrastructure/db';
import { financeAgentManifest } from '$modules/finance/agent';
import {
	findVendorInvoiceIntakeStep,
	runFieldExtractionStep,
	runMatchingStep,
	vendorInvoiceIntakeWorkflow,
	type DocumentIntakeOutput,
	type ExtractedInvoiceFields
} from '$modules/finance/workflows/vendor-invoice-intake';
import {
	findFinancialDocumentIntakeStep,
	runBucketSelectionStep,
	runCategorySelectionStep,
	runFieldExtractionStep as runDocFieldExtractionStep,
	runProjectSelectionStep,
	findCategoryById,
	financialDocumentIntakeWorkflow,
	type Bucket,
	type CategoryDefinition
} from '$modules/finance/workflows/financial-document-intake';
import {
	findAllowanceRecordingStep,
	runManualEntryStep,
	allowanceConfirmationSchema,
	allowanceRecordingWorkflow,
	type AllowanceManualEntry,
	type AllowanceConfirmationPayload
} from '$modules/finance/workflows/allowance-recording';
import { createDocumentIntakeService } from '$modules/document-intake';
import { createFinanceApi, validateExpenseRecord } from '$modules/finance';
import { suggestNextFinanceTaskCapability } from '$modules/finance/capabilities/suggest-next-task';
import { appendAgentAuditEntry } from '$platform/audit/audit-log';
import { checkToolPolicy } from '$platform/ai/tool-policy';
import type { ModuleContext } from '$platform/modules/types';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import {
	getState,
	patchState,
	startWorkflow as startWorkflowState,
	type WorkflowStateRecord
} from '$platform/workflow/workflow-runtime';

export interface AdvancePayload {
	documentId?: string;
	fileName?: string;
	bucket?: Bucket;
	categoryId?: string;
	projectId?: string | null;
	/** allowance-recording manual entry. */
	allowanceEntry?: AllowanceManualEntry;
}

export interface AdvanceWorkflowInput {
	env: Env;
	user: App.Locals['user'];
	workflowInstanceId: string;
	targetStep: string;
	payload?: AdvancePayload;
}

export type WorkflowAdvanceResult =
	| { ok: true; data: { currentStep: string; state: WorkflowStateRecord } }
	| { ok: false; status: number; message: string };

const failResult = (message: string, status: number): WorkflowAdvanceResult => ({
	ok: false,
	status,
	message
});
const okResult = (data: {
	currentStep: string;
	state: WorkflowStateRecord;
}): WorkflowAdvanceResult => ({ ok: true, data });

interface ResolvedStepDef {
	id: string;
	allowedCapabilities: readonly string[];
	requiresUserConfirmation: boolean;
	nextSteps: readonly string[];
}

function lookupStep(workflowId: string, stepId: string): ResolvedStepDef | undefined {
	if (workflowId === 'vendor-invoice-intake') {
		const def = findVendorInvoiceIntakeStep(stepId as never);
		return def
			? {
					id: def.id,
					allowedCapabilities: def.allowedCapabilities,
					requiresUserConfirmation: def.requiresUserConfirmation,
					nextSteps: def.nextSteps as readonly string[]
				}
			: undefined;
	}
	if (workflowId === 'financial-document-intake') {
		const def = findFinancialDocumentIntakeStep(stepId as never);
		return def
			? {
					id: def.id,
					allowedCapabilities: def.allowedCapabilities,
					requiresUserConfirmation: def.requiresUserConfirmation,
					nextSteps: def.nextSteps as readonly string[]
				}
			: undefined;
	}
	if (workflowId === 'allowance-recording') {
		const def = findAllowanceRecordingStep(stepId as never);
		return def
			? {
					id: def.id,
					allowedCapabilities: def.allowedCapabilities,
					requiresUserConfirmation: def.requiresUserConfirmation,
					nextSteps: def.nextSteps as readonly string[]
				}
			: undefined;
	}
	return undefined;
}

interface PolicyGateOk {
	allowed: true;
}
interface PolicyGateDenied {
	allowed: false;
	missingPermissions: string[];
	blockedBy: string[];
}

async function gateAllCapabilities(
	db: DBClient,
	state: WorkflowStateRecord,
	allowedCapabilities: readonly string[],
	user: App.Locals['user']
): Promise<PolicyGateOk | PolicyGateDenied> {
	for (const capabilityId of allowedCapabilities) {
		const decision = checkToolPolicy({
			agentId: financeAgentManifest.id,
			capabilityId,
			userRoles: user?.roles,
			currentStepAllowedCapabilities: allowedCapabilities
		});
		if (!decision.allowed) {
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: user?.id ?? null,
				userEmail: user?.email ?? null,
				tenantId: state.tenantId,
				workflowId: state.id,
				workflowStep: state.step,
				toolId: capabilityId,
				riskLevel: decision.riskLevel,
				permissionResult: 'denied',
				confirmationRequired: decision.requiresConfirmation,
				finalAction: 'agent.policy_denied',
				status: 'denied',
				errorCode: decision.blockedBy.join(',')
			});
			return {
				allowed: false,
				missingPermissions: decision.missingUserPermissions,
				blockedBy: decision.blockedBy
			};
		}
	}
	return { allowed: true };
}

async function auditCapabilitySuccess(
	db: DBClient,
	state: WorkflowStateRecord,
	user: App.Locals['user'],
	capabilityId: string,
	outputRefs: unknown
) {
	const decision = checkToolPolicy({
		agentId: financeAgentManifest.id,
		capabilityId,
		userRoles: user?.roles
	});
	await appendAgentAuditEntry(db, {
		agentId: financeAgentManifest.id,
		agentVersion: financeAgentManifest.version,
		userId: user?.id ?? null,
		userEmail: user?.email ?? null,
		tenantId: state.tenantId,
		workflowId: state.id,
		workflowStep: state.step,
		toolId: capabilityId,
		riskLevel: decision.riskLevel,
		permissionResult: 'allowed',
		confirmationRequired: decision.requiresConfirmation,
		modelId: 'mock-v1',
		promptVersion: 'mock-v1',
		schemaVersion: 'v1',
		outputRefs,
		finalAction: 'agent.capability_call',
		status: 'ok'
	});
}

export async function advanceWorkflow(input: AdvanceWorkflowInput): Promise<WorkflowAdvanceResult> {
	const { env, user, workflowInstanceId: id, targetStep, payload } = input;
	const db = getDb(env);
	const state = await getState(env.KV, id);
	if (!state) return failResult('Workflow not found', 404);
	if (state.status !== 'active') return failResult(`Workflow is ${state.status}`, 409);

	const currentStepDef = lookupStep(state.workflowId, state.step);
	if (!currentStepDef) return failResult(`Unknown current step: ${state.step}`, 500);
	if (!currentStepDef.nextSteps.includes(targetStep)) {
		return failResult(
			`Cannot advance from ${state.step} to ${targetStep}. Allowed: ${currentStepDef.nextSteps.join(', ') || '(none)'}.`,
			400
		);
	}
	const targetStepDef = lookupStep(state.workflowId, targetStep);
	if (!targetStepDef) return failResult(`Unknown target step: ${targetStep}`, 400);

	const gate = await gateAllCapabilities(db, state, targetStepDef.allowedCapabilities, user);
	if (!gate.allowed) {
		return failResult(
			`Policy denied: ${gate.blockedBy.join(', ')}${gate.missingPermissions.length ? ` (missing ${gate.missingPermissions.join(', ')})` : ''}`,
			403
		);
	}

	const ctx = {
		tenantId: state.tenantId,
		userId: state.userId,
		useMock: true,
		env
	};

	switch (targetStep) {
		case 'document_intake': {
			if (!payload?.documentId) {
				return failResult('payload.documentId is required for document_intake', 400);
			}
			const document: DocumentIntakeOutput = {
				documentId: payload.documentId,
				fileName: payload.fileName
			};
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { document }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'invoice_field_extraction': {
			const document = state.data.document as DocumentIntakeOutput | undefined;
			if (!document) return failResult('Workflow has no document context', 400);

			let artifactText: string | undefined;
			let artifactConfidence: number | undefined;
			if (!document.documentId.startsWith('mock-')) {
				try {
					const docService = createDocumentIntakeService({ db, env, user });
					const artifact = await docService.getDocumentArtifact({
						tenantId: state.tenantId,
						documentId: document.documentId
					});
					if (artifact?.textExtraction?.status === 'success') {
						artifactText = artifact.textExtraction.text;
						artifactConfidence = artifact.textExtraction.confidence;
					}
				} catch {
					// Treat as missing text; the capability will fall back.
				}
			}

			const result = await runFieldExtractionStep(
				{
					...document,
					text: artifactText,
					artifactConfidence
				},
				ctx
			);
			await auditCapabilitySuccess(db, state, user, 'finance.extract-invoice-fields', {
				confidence: result.confidence,
				usedRealText: Boolean(artifactText)
			});
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { extraction: result }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'matching': {
			const extraction = state.data.extraction as { fields: ExtractedInvoiceFields } | undefined;
			if (!extraction) return failResult('Workflow has no extracted fields yet', 400);
			const result = await runMatchingStep({ fields: extraction.fields }, ctx);
			for (const capabilityId of targetStepDef.allowedCapabilities) {
				await auditCapabilitySuccess(db, state, user, capabilityId, {
					supplierTop: result.supplierCandidates[0]?.id ?? null,
					poTop: result.poCandidates[0]?.id ?? null,
					duplicate: result.duplicate.isDuplicate
				});
			}
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { matching: result }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'user_confirmation': {
			const next = await patchState(env.KV, state.id, { step: targetStep });
			return okResult({ currentStep: next.step, state: next });
		}

		// ---- financial-document-intake-only branches ----
		case 'bucket_selection': {
			const bucket = payload?.bucket;
			if (!bucket) return failResult('payload.bucket is required for bucket_selection', 400);
			const result = await runBucketSelectionStep({ bucket });
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { bucketSelection: result }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'category_selection': {
			const categoryId =
				payload?.categoryId ?? (state.data.selectedCategoryId as string | undefined);
			if (!categoryId)
				return failResult('payload.categoryId is required for category_selection', 400);
			const result = await runCategorySelectionStep({ categoryId });
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { categorySelection: { categoryId, category: result.category } }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'field_extraction': {
			const document = state.data.document as DocumentIntakeOutput | undefined;
			if (!document) return failResult('Workflow has no document context', 400);
			const categorySel = state.data.categorySelection as { categoryId: string } | undefined;
			const categoryId =
				categorySel?.categoryId ?? findCategoryById('expense.sales_cost.invoice')?.id;

			let artifactText: string | undefined;
			let artifactConfidence: number | undefined;
			if (!document.documentId.startsWith('mock-')) {
				try {
					const docService = createDocumentIntakeService({ db, env, user });
					const artifact = await docService.getDocumentArtifact({
						tenantId: state.tenantId,
						documentId: document.documentId
					});
					if (artifact?.textExtraction?.status === 'success') {
						artifactText = artifact.textExtraction.text;
						artifactConfidence = artifact.textExtraction.confidence;
					}
				} catch {
					// Treat as missing text; the capability will fall back.
				}
			}

			const result = await runDocFieldExtractionStep(
				{
					...document,
					categoryId,
					text: artifactText,
					artifactConfidence
				},
				ctx
			);
			await auditCapabilitySuccess(db, state, user, 'finance.extract-document-fields', {
				confidence: result.confidence,
				categoryId,
				usedRealText: Boolean(artifactText)
			});
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { extraction: result }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'project_selection': {
			const projectId = payload?.projectId ?? null;
			const result = await runProjectSelectionStep({ projectId });
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { projectSelection: result }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		// ---- allowance-recording-only branch ----
		case 'manual_entry': {
			const entry = payload?.allowanceEntry;
			if (!entry) return failResult('payload.allowanceEntry is required for manual_entry', 400);
			const result = await runManualEntryStep(entry);
			const next = await patchState(env.KV, state.id, {
				step: targetStep,
				dataPatch: { allowanceEntry: result.entry, allowanceTotal: result.totalAmount }
			});
			return okResult({ currentStep: next.step, state: next });
		}

		case 'record_creation':
		case 'completion':
			return failResult(`Step ${targetStep} is not driven by /advance. Use /confirm.`, 400);

		default:
			return failResult(`Unsupported target step: ${targetStep}`, 400);
	}
}

// ──────────────────────────────────────────────────────────────────────────
// Confirm (record creation) — was routes/api/finance/workflow/[id]/confirm
// ──────────────────────────────────────────────────────────────────────────

type AuthedUser = NonNullable<App.Locals['user']>;

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

export interface ConfirmWorkflowInput {
	env: Env;
	user: AuthedUser;
	ctx: ModuleContext;
	workflowInstanceId: string;
	body: ConfirmBody;
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

const confirmFail = (
	message: string,
	status: number,
	details?: unknown
): WorkflowConfirmResult => ({ ok: false, status, message, details });

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

export async function confirmWorkflow(input: ConfirmWorkflowInput): Promise<WorkflowConfirmResult> {
	const { env, user, ctx, workflowInstanceId: id, body } = input;
	const db = getDb(env);

	const state = await getState(env.KV, id);
	if (!state) return confirmFail('Workflow not found', 404);
	if (state.status !== 'active') return confirmFail(`Workflow is ${state.status}`, 409);
	if (state.step !== 'user_confirmation') {
		return confirmFail(
			`Confirmation only valid at step 'user_confirmation'. Current: ${state.step}.`,
			409
		);
	}

	// ---- allowance-recording branch ----
	if (state.workflowId === 'allowance-recording') {
		const payload = body.allowancePayload;
		const payloadHash = body.allowancePayloadHash;
		if (!payload || !payloadHash) {
			return confirmFail('allowancePayload and allowancePayloadHash are required', 400);
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
			return confirmFail('Payload hash mismatch.', 400);
		}

		const parsed = allowanceConfirmationSchema.safeParse(payload);
		if (!parsed.success) {
			const issues = parsed.error.issues.map((i) => ({
				field: i.path.join('.') || '<root>',
				message: i.message
			}));
			return confirmFail('Validation failed', 400, { issues });
		}

		const expenseInput = buildAllowanceExpenseInput(parsed.data);
		const validation = validateExpenseRecord(expenseInput);
		if (!validation.success) {
			const issues = validation.error.issues.map((i) => ({
				field: i.path.join('.') || '<root>',
				message: i.message
			}));
			return confirmFail('Validation failed', 400, { issues });
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
		return confirmFail('payload and payloadHash are required', 400);
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
		return confirmFail('Payload hash mismatch - UI state and submission do not agree.', 400);
	}

	// 2. Resolve category - drives everything below.
	let category: CategoryDefinition;
	try {
		category = resolveCategory(body.payload, state.data);
	} catch (err) {
		return confirmFail(err instanceof Error ? err.message : 'Could not resolve category', 400);
	}

	// 3. Branch persistence by category.persistTarget.
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
			return confirmFail('Validation failed', 400, { issues });
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
		return confirmFail(
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

	return {
		ok: true,
		data: {
			entityId,
			auditRef: audit.auditId,
			entityRoute,
			categoryId: category.id,
			nextTask: suggestion.task
		}
	};
}

// ──────────────────────────────────────────────────────────────────────────
// Start — was routes/api/finance/workflow/+server.ts
// ──────────────────────────────────────────────────────────────────────────

const SUPPORTED_WORKFLOWS = {
	[vendorInvoiceIntakeWorkflow.id]: vendorInvoiceIntakeWorkflow,
	[financialDocumentIntakeWorkflow.id]: financialDocumentIntakeWorkflow,
	[allowanceRecordingWorkflow.id]: allowanceRecordingWorkflow
} as const;

type SupportedWorkflowId = keyof typeof SUPPORTED_WORKFLOWS;

export interface StartBody {
	workflowId?: string;
	intentHint?: string;
	tenantId?: string;
	source?: 'quick_action' | 'today_brief' | 'main_app' | 'agent_intent';
	/** Optional pre-selected category id for `financial-document-intake`. */
	categoryId?: string;
}

export interface StartWorkflowInput {
	env: Env;
	user: AuthedUser;
	body: StartBody;
}

export type WorkflowStartResult =
	| { ok: true; data: { workflowId: string; currentStep: string; status: string } }
	| { ok: false; status: number; message: string };

export async function startFinanceWorkflow(
	input: StartWorkflowInput
): Promise<WorkflowStartResult> {
	const { env, user, body } = input;
	const wfId = body.workflowId as SupportedWorkflowId | undefined;
	const wf = wfId ? SUPPORTED_WORKFLOWS[wfId] : undefined;
	if (!wf) {
		return {
			ok: false,
			status: 400,
			message: `Unsupported workflowId: ${body.workflowId}. Supported: ${Object.keys(SUPPORTED_WORKFLOWS).join(', ')}.`
		};
	}

	const tenantId = body.tenantId ?? 'default';
	const state = await startWorkflowState(env.KV, {
		workflowId: wf.id,
		agentId: financeAgentManifest.id,
		initialStep: wf.initialStep,
		userId: user.id,
		tenantId,
		data: {
			source: body.source,
			intentHint: body.intentHint,
			...(body.categoryId ? { selectedCategoryId: body.categoryId } : {})
		}
	});

	await appendAgentAuditEntry(getDb(env), {
		agentId: financeAgentManifest.id,
		agentVersion: financeAgentManifest.version,
		userId: user.id,
		userEmail: user.email,
		tenantId,
		workflowId: state.id,
		workflowStep: state.step,
		riskLevel: 'R0',
		permissionResult: 'allowed',
		confirmationRequired: false,
		finalAction: 'agent.workflow_started',
		status: 'ok'
	});

	return {
		ok: true,
		data: { workflowId: state.id, currentStep: state.step, status: state.status }
	};
}
