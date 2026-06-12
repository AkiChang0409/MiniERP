import type { DBClient } from '$infrastructure/db';
import {
	WorkflowStepError,
	type ApplyStepResult,
	type ApplyStepResultArgs,
	type ResolveStepInputArgs,
	type WorkflowDefinition,
	type WorkflowRuntimeContext,
	type WorkflowStepDefinition
} from '$platform/workflow/workflow-registry';
import { detectDuplicateFinanceRecord } from '../domain/rules';
import { vendorInvoiceIntakeWorkflow } from './vendor-invoice-intake';
import {
	financialDocumentIntakeWorkflow,
	findCategoryById
} from './financial-document-intake';
import { allowanceRecordingWorkflow } from './allowance-recording';
import { allowanceManualEntrySchema, computeAllowanceTotal } from './allowance-recording';

/**
 * Builds the finance workflows as generic, registry-driven WorkflowDefinitions
 * for the platform engine. The step machines come from each module
 * `definition.ts`; the per-step glue that used to live in the app orchestrator
 * (input construction + output → state folding) becomes the engine's
 * `resolveStepInput` / `applyStepResult` hooks here, in finance (the owner).
 *
 * The ONE cross-module need — loading a document's OCR text for the extraction
 * step — is injected via `deps.loadDocumentText` (inversion of control, the
 * same pattern document-intake uses for finance's extractor), so finance does
 * NOT import document-intake.
 */
export interface LoadDocumentTextInput {
	documentId: string;
	tenantId: string;
	env: Env;
	db: DBClient;
	user: App.Locals['user'];
}

export interface FinanceWorkflowDeps {
	loadDocumentText(input: LoadDocumentTextInput): Promise<{ text?: string; confidence?: number }>;
}

/** Steps whose `capabilities` actually execute via the engine (everything else
 * is a pure user/selection step whose work lives in applyStepResult). Mirrors
 * what the previous orchestrator actually ran at /advance. */
const EXECUTING_STEPS = new Set(['invoice_field_extraction', 'field_extraction', 'matching']);

interface DefLike {
	id: string;
	initialStep: string;
	steps: readonly {
		id: string;
		allowedCapabilities: readonly string[];
		requiresUserConfirmation: boolean;
		nextSteps: readonly string[];
	}[];
}

function toGenericSteps(def: DefLike): WorkflowStepDefinition[] {
	return def.steps.map((s) => ({
		id: s.id,
		capabilities: EXECUTING_STEPS.has(s.id) ? [...s.allowedCapabilities] : [],
		requiresUserConfirmation: s.requiresUserConfirmation,
		nextSteps: [...s.nextSteps]
	}));
}

// ── shared step glue (vendor-invoice-intake + financial-document-intake) ──

interface ExtractedFields {
	documentNumber: string;
	counterpartyName: string;
	currency: string;
	totalAmount: number;
	[k: string]: unknown;
}

function extractedFields(state: ResolveStepInputArgs['state']): ExtractedFields {
	const extraction = state.data.extraction as { fields?: ExtractedFields } | undefined;
	const fields = extraction?.fields;
	if (!fields) throw new WorkflowStepError(400, 'Workflow has no extracted fields yet');
	return fields;
}

function matchingResolveInput(state: ResolveStepInputArgs['state']): unknown {
	const fields = extractedFields(state);
	// Both match capabilities accept the same superset; each picks what it needs.
	return {
		counterpartyName: fields.counterpartyName,
		supplierName: fields.counterpartyName,
		totalAmount: fields.totalAmount,
		currency: fields.currency
	};
}

function matchingApply(state: ApplyStepResultArgs['state'], outputs: unknown[]): ApplyStepResult {
	const supplier = outputs[0] as { candidates?: unknown };
	const po = outputs[1] as { candidates?: unknown };
	// Duplicate detection is a domain rule (no longer a capability). `existing` is
	// empty until a real prior-records lookup is wired (parity with prior behaviour).
	const fields = extractedFields(state);
	const duplicate = detectDuplicateFinanceRecord(
		{
			documentNumber: fields.documentNumber,
			amount: fields.totalAmount,
			counterparty: fields.counterpartyName
		},
		[]
	);
	return {
		dataPatch: {
			matching: {
				supplierCandidates: supplier?.candidates ?? [],
				poCandidates: po?.candidates ?? [],
				duplicate
			}
		}
	};
}

function extractionApply(outputs: unknown[]): ApplyStepResult {
	const o = outputs[0] as { fields?: unknown; confidence?: unknown; evidence?: unknown };
	return {
		dataPatch: { extraction: { fields: o?.fields, confidence: o?.confidence, evidence: o?.evidence } }
	};
}

interface DocumentState {
	documentId: string;
	fileName?: string;
}

async function loadArtifactText(
	deps: FinanceWorkflowDeps,
	state: ResolveStepInputArgs['state'],
	runtime: WorkflowRuntimeContext
): Promise<{ document: DocumentState; text?: string; confidence?: number }> {
	const document = state.data.document as DocumentState | undefined;
	if (!document?.documentId) throw new WorkflowStepError(400, 'Workflow has no document context');
	if (document.documentId.startsWith('mock-')) return { document };
	const { text, confidence } = await deps.loadDocumentText({
		documentId: document.documentId,
		tenantId: state.tenantId,
		env: runtime.env,
		db: runtime.db,
		user: runtime.user
	});
	return { document, text, confidence };
}

// ── definitions ──

function buildVendorInvoiceIntake(deps: FinanceWorkflowDeps): WorkflowDefinition {
	return {
		id: vendorInvoiceIntakeWorkflow.id,
		initialStep: vendorInvoiceIntakeWorkflow.initialStep,
		steps: toGenericSteps(vendorInvoiceIntakeWorkflow),
		async resolveStepInput({ state, targetStep, payload, runtime }: ResolveStepInputArgs) {
			if (targetStep === 'invoice_field_extraction') {
				const { document, text, confidence } = await loadArtifactText(deps, state, runtime);
				// vendor-invoice-intake now uses the generalized extract-document-fields
				// capability; default to the supplier-invoice category and request the
				// legacy common-field projection this workflow's downstream expects.
				return {
					documentId: document.documentId,
					fileName: document.fileName,
					categoryId: findCategoryById('expense.sales_cost.invoice')?.id,
					text,
					artifactConfidence: confidence,
					outputShape: 'legacy'
				};
			}
			if (targetStep === 'matching') return matchingResolveInput(state);
			return payload;
		},
		applyStepResult({ state, targetStep, payload, outputs }: ApplyStepResultArgs): ApplyStepResult {
			const p = (payload ?? {}) as DocumentState;
			switch (targetStep) {
				case 'document_intake':
					if (!p.documentId) throw new WorkflowStepError(400, 'payload.documentId is required');
					return { dataPatch: { document: { documentId: p.documentId, fileName: p.fileName } } };
				case 'invoice_field_extraction':
					return extractionApply(outputs);
				case 'matching':
					return matchingApply(state, outputs);
				default:
					return {};
			}
		}
	};
}

function buildFinancialDocumentIntake(deps: FinanceWorkflowDeps): WorkflowDefinition {
	return {
		id: financialDocumentIntakeWorkflow.id,
		initialStep: financialDocumentIntakeWorkflow.initialStep,
		steps: toGenericSteps(financialDocumentIntakeWorkflow),
		async resolveStepInput({ state, targetStep, payload, runtime }: ResolveStepInputArgs) {
			if (targetStep === 'field_extraction') {
				const { document, text, confidence } = await loadArtifactText(deps, state, runtime);
				const categorySel = state.data.categorySelection as { categoryId?: string } | undefined;
				const categoryId =
					categorySel?.categoryId ?? findCategoryById('expense.sales_cost.invoice')?.id;
				return {
					documentId: document.documentId,
					fileName: document.fileName,
					categoryId,
					text,
					artifactConfidence: confidence,
					outputShape: 'legacy'
				};
			}
			if (targetStep === 'matching') return matchingResolveInput(state);
			return payload;
		},
		applyStepResult({ state, targetStep, payload, outputs }: ApplyStepResultArgs): ApplyStepResult {
			const p = (payload ?? {}) as {
				documentId?: string;
				fileName?: string;
				bucket?: string;
				categoryId?: string;
				projectId?: string | null;
			};
			switch (targetStep) {
				case 'document_intake':
					if (!p.documentId) throw new WorkflowStepError(400, 'payload.documentId is required');
					return { dataPatch: { document: { documentId: p.documentId, fileName: p.fileName } } };
				case 'bucket_selection':
					if (!p.bucket) throw new WorkflowStepError(400, 'payload.bucket is required');
					return { dataPatch: { bucketSelection: { bucket: p.bucket } } };
				case 'category_selection': {
					const categoryId =
						p.categoryId ?? (state.data.selectedCategoryId as string | undefined);
					if (!categoryId) throw new WorkflowStepError(400, 'payload.categoryId is required');
					const category = findCategoryById(categoryId);
					if (!category) throw new WorkflowStepError(400, `Unknown category: ${categoryId}`);
					return { dataPatch: { categorySelection: { categoryId, category } } };
				}
				case 'field_extraction':
					return extractionApply(outputs);
				case 'matching':
					return matchingApply(state, outputs);
				case 'project_selection':
					return { dataPatch: { projectSelection: { projectId: p.projectId ?? null } } };
				default:
					return {};
			}
		}
	};
}

function buildAllowanceRecording(): WorkflowDefinition {
	return {
		id: allowanceRecordingWorkflow.id,
		initialStep: allowanceRecordingWorkflow.initialStep,
		steps: toGenericSteps(allowanceRecordingWorkflow),
		applyStepResult({ targetStep, payload }: ApplyStepResultArgs): ApplyStepResult {
			if (targetStep !== 'manual_entry') return {};
			const entry = (payload as { allowanceEntry?: unknown } | undefined)?.allowanceEntry;
			const parsed = allowanceManualEntrySchema.safeParse(entry);
			if (!parsed.success) {
				throw new WorkflowStepError(400, 'payload.allowanceEntry is invalid');
			}
			const totalAmount = computeAllowanceTotal({
				days: parsed.data.days,
				dailyRate: parsed.data.dailyRate
			});
			return { dataPatch: { allowanceEntry: parsed.data, allowanceTotal: totalAmount } };
		}
	};
}

export function buildFinanceWorkflowDefinitions(deps: FinanceWorkflowDeps): WorkflowDefinition[] {
	return [
		buildVendorInvoiceIntake(deps),
		buildFinancialDocumentIntake(deps),
		buildAllowanceRecording()
	];
}
