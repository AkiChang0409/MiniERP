/**
 * Inbox-confirmation orchestrator (app layer).
 *
 * Persists a reviewed document artifact to the right finance entity
 * (expenses / revenue / archive) based on the resolved category's
 * `persistTarget`, writes an agent audit entry, and marks the artifact
 * `confirmed` so it leaves the active inbox.
 *
 * Extracted from `POST /api/documents/[id]/confirm` so the SAME persistence
 * path can be driven from two callers:
 *   - the web route (actor = `event.locals.user`, after a payload-hash check)
 *   - the Lark card-callback (actor resolved from the Lark open_id, no session)
 *
 * Lives in `src/app/` because it composes two module surfaces (finance +
 * document-intake) — the boundary linter exempts the app layer from the
 * cross-module rule, exactly as the route handler was. It takes a ready-made
 * `ModuleContext` (built via `createModuleContext` or `createWorkerContext`),
 * so it needs no RequestEvent. The payload-hash *tamper guard* stays at the
 * transport boundary (the web route); this orchestrator trusts its inputs and
 * computes its own `confirmationRef` purely for audit.
 */
import type { ModuleContext } from '$platform/modules/types';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import { appendAgentAuditEntry } from '$platform/audit/audit-log';
import { executeGuardedCapability } from '$platform/ai/execute-capability';
import { createDocumentIntakeApi, createDocumentIntakeService } from '$modules/document-intake';
import {
	findCategoryById,
	financeAgentManifest,
	validateExpenseRecord,
	type CategoryDefinition
} from '$modules/finance';

export interface ConfirmInboxParams {
	documentId: string;
	categoryId: string;
	fields: Record<string, unknown>;
	projectId?: string | null;
	supplierId?: string | null;
	poId?: string | null;
	/** The acting MiniERP user (web session user, or the user resolved from Lark). */
	actor: { id: string; email: string };
}

export type ConfirmInboxResult =
	| { ok: true; entityId: string; entityType: string; entityRoute: string; categoryId: string; auditRef?: string }
	| {
			ok: false;
			status: number;
			error: string;
			issues?: Array<{ field: string; message: string }>;
	  };

// ---------------------------------------------------------------------------
// Field readers / normalizers (moved verbatim from the confirm route).
// ---------------------------------------------------------------------------

function readString(fields: Record<string, unknown>, keys: string[], fallback = '') {
	for (const key of keys) {
		const value = fields[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	}
	return fallback;
}

function readNumber(fields: Record<string, unknown>, keys: string[], fallback = 0) {
	for (const key of keys) {
		const value = fields[key];
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string' && value.trim()) {
			const n = Number(value);
			if (Number.isFinite(n)) return n;
		}
	}
	return fallback;
}

function readBoolean(fields: Record<string, unknown>, keys: string[], fallback = false) {
	for (const key of keys) {
		const value = fields[key];
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string' && value.trim()) {
			const normalized = value.trim().toLowerCase();
			if (['true', 'yes', '1', 'on'].includes(normalized)) return true;
			if (['false', 'no', '0', 'off'].includes(normalized)) return false;
		}
	}
	return fallback;
}

/**
 * Coerce `line_items` to an array of plain objects (defensive: the inbox form
 * already submits an array, but tolerate a JSON string from other callers).
 * Mutates in place — call only AFTER any payload-hash check so the hash stays
 * valid. Drops the key when empty so metadata stays clean.
 */
function normalizeLineItemsInPlace(fields: Record<string, unknown>) {
	const raw = fields.line_items ?? fields.lineItems;
	if ('lineItems' in fields) delete fields.lineItems;
	if (raw === undefined || raw === null) {
		delete fields.line_items;
		return;
	}
	let arr: unknown = raw;
	if (typeof raw === 'string') {
		try {
			arr = JSON.parse(raw);
		} catch {
			arr = [];
		}
	}
	if (Array.isArray(arr) && arr.length > 0) fields.line_items = arr;
	else delete fields.line_items;
}

function metadataFromFields(
	fields: Record<string, unknown>,
	exclude: string[]
): Record<string, unknown> {
	const excluded = new Set(exclude);
	const metadata: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (excluded.has(key)) continue;
		if (value === null || value === undefined || value === '') continue;
		metadata[key] = value;
	}
	return metadata;
}

function normalizeConfirmedFields(fields: Record<string, unknown>) {
	return {
		documentNumber: readString(fields, [
			'invoice_number',
			'receipt_number',
			'po_number',
			'contract_number',
			'quotation_number',
			'documentNumber',
			'invoiceNumber',
			'receiptNumber',
			'poNumber'
		]),
		counterpartyName: readString(fields, [
			'supplier_name',
			'vendor',
			'recipient_name',
			'customer_name',
			'client_name',
			'staff_name',
			'counterpartyName',
			'supplierName',
			'customerName'
		]),
		currency: readString(fields, ['currency', 'invoice_currency', 'invoiceCurrency'], 'SGD').toUpperCase(),
		totalAmount: readNumber(fields, ['amount', 'total', 'invoice_amount', 'totalAmount', 'invoiceAmount']),
		gstAmount: readNumber(fields, ['gst_amount', 'invoice_gst_amount', 'gstAmount', 'invoiceGstAmount']),
		issueDate: readString(fields, ['date', 'invoice_date', 'issueDate', 'invoiceDate']),
		dueDate: readString(fields, ['due_date', 'invoice_due_date', 'dueDate', 'invoiceDueDate'])
	};
}

function buildExpenseInput(params: ConfirmInboxParams, category: CategoryDefinition, documentId: string) {
	const normalized = normalizeConfirmedFields(params.fields);
	const projectId = params.projectId ?? (readString(params.fields, ['project_id', 'projectId']) || null);
	const reimbursement = readBoolean(params.fields, ['reimbursement'], false);
	const businessTrip = readBoolean(params.fields, ['business_trip', 'businessTrip'], false);
	const destination = readString(params.fields, ['destination']) || null;
	const staffName = readString(params.fields, ['staff_name', 'recipient_name', 'staffName']) || null;
	const metadata = metadataFromFields(params.fields, [
		'project_id',
		'projectId',
		'date',
		'amount',
		'currency',
		'gst_amount',
		'vendor',
		'supplier_name',
		'recipient_name',
		'staff_name',
		'reimbursement',
		'business_trip',
		'destination'
	]);
	const expenseType = category.expenseType ?? 'opex';
	const cat = category.category ?? 'others';
	return {
		expenseType,
		category: cat,
		docType: category.expenseDocType,
		projectId,
		amount: normalized.totalAmount,
		currency: normalized.currency,
		date: normalized.issueDate,
		gstAmount: normalized.gstAmount,
		vendorOrSupplier: normalized.counterpartyName,
		staffName,
		reimbursement,
		businessTrip,
		destination,
		documentRef: documentId,
		metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
		notes: `Recorded via inbox · ${category.label} · ${normalized.documentNumber}${params.poId ? ` · po=${params.poId}` : ''}`
	} as const;
}

function buildRevenueInput(params: ConfirmInboxParams, documentId: string) {
	const normalized = normalizeConfirmedFields(params.fields);
	const projectId = params.projectId ?? (readString(params.fields, ['project_id', 'projectId']) || null);
	const metadata = metadataFromFields(params.fields, [
		'project_id',
		'projectId',
		'invoice_type',
		'invoiceType',
		'invoice_number',
		'invoiceNumber',
		'customer_name',
		'customerName',
		'client_name',
		'date',
		'invoice_date',
		'invoice_amount',
		'amount',
		'invoice_currency',
		'currency',
		'invoice_gst_amount',
		'gst_amount'
	]);
	return {
		projectId,
		invoiceType: readString(params.fields, ['invoice_type', 'invoiceType'], 'tax_invoice') as
			| 'standard'
			| 'zero_rate'
			| 'tax_invoice',
		invoiceNumber: normalized.documentNumber,
		clientName: normalized.counterpartyName,
		date: normalized.issueDate,
		amount: normalized.totalAmount,
		currency: normalized.currency,
		gstAmount: normalized.gstAmount,
		documentRef: documentId,
		metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
		notes: `Recorded via inbox · invoice ${normalized.documentNumber}`
	};
}

function archiveDocTypeForPersistTarget(
	persistTarget: CategoryDefinition['persistTarget']
): 'contract' | 'quotation' | 'purchase_order' | null {
	if (persistTarget === 'contracts') return 'contract';
	if (persistTarget === 'quotations') return 'quotation';
	if (persistTarget === 'purchase_orders') return 'purchase_order';
	return null;
}

function buildArchiveExtractedFields(params: ConfirmInboxParams) {
	const normalized = normalizeConfirmedFields(params.fields);
	return {
		...params.fields,
		project_id: params.projectId || readString(params.fields, ['project_id', 'projectId']) || undefined,
		contract_number: readString(params.fields, ['contract_number', 'contractNumber'], normalized.documentNumber),
		quotation_number: readString(
			params.fields,
			['quotation_number', 'quotationNumber'],
			normalized.documentNumber
		),
		po_number: readString(params.fields, ['po_number', 'poNumber'], normalized.documentNumber),
		client_name: readString(
			params.fields,
			['client_name', 'customer_name', 'clientName', 'customerName'],
			normalized.counterpartyName
		),
		supplier_name: readString(
			params.fields,
			['supplier_name', 'vendor', 'supplierName'],
			normalized.counterpartyName
		),
		date: readString(params.fields, ['date', 'document_date', 'documentDate'], normalized.issueDate),
		effective_date: readString(params.fields, ['effective_date', 'effectiveDate'], normalized.issueDate),
		expiry_date: readString(params.fields, ['expiry_date', 'expiryDate'], normalized.dueDate),
		amount: normalized.totalAmount,
		currency: normalized.currency
	};
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function confirmInbox(
	ctx: ModuleContext,
	params: ConfirmInboxParams
): Promise<ConfirmInboxResult> {
	const db = ctx.db;
	const env = ctx.env;
	const actor = params.actor;
	// Stable audit reference derived from the confirmed payload.
	const confirmationRef = await hashConfirmationPayload({
		documentId: params.documentId,
		categoryId: params.categoryId,
		supplierId: params.supplierId ?? null,
		poId: params.poId ?? null,
		projectId: params.projectId ?? null,
		fields: params.fields
	});

	// line_items may arrive as a JSON string from non-form callers.
	normalizeLineItemsInPlace(params.fields);

	// 1. Verify artifact exists and is in a confirmable state.
	const intake = createDocumentIntakeService({ db, env, user: ctx.user });
	const artifact = await intake.getDocumentArtifact({ tenantId: 'default', documentId: params.documentId });
	if (!artifact) return { ok: false, status: 404, error: 'Document artifact not found' };
	if (
		artifact.processingStatus !== 'ready_for_review' &&
		artifact.processingStatus !== 'ready_for_workflow'
	) {
		return {
			ok: false,
			status: 409,
			error: `Artifact is in '${artifact.processingStatus}' state; only ready_for_review can be confirmed.`
		};
	}

	// 2. Resolve category (must be pinned by caller).
	const category = findCategoryById(params.categoryId);
	if (!category) {
		return { ok: false, status: 400, error: `Unknown categoryId: ${params.categoryId}` };
	}

	// 3. Branch persistence by category.persistTarget. Expense/revenue writes now
	// go through the governed capability runtime (executeGuardedCapability =
	// policy gate + input-schema validation + audit). The confirmationRef (the
	// reviewed payload hash) satisfies the write confirmation gate, so an R4 write
	// without it is denied before any side effect. Archive documents persist via
	// the document-intake api (project archive) with their own manual audit.
	const documentIntake = createDocumentIntakeApi(ctx);
	const guardActor = { userId: actor.id, userEmail: actor.email, roles: ctx.user?.roles ?? null };
	const capabilityCtx = { tenantId: 'default', userId: actor.id, env, moduleContext: ctx };

	let entityId: string;
	let entityRoute: string;
	let entityType: string;
	let auditRef: string | undefined;

	if (category.persistTarget === 'expenses') {
		const expenseInput = buildExpenseInput(params, category, artifact.id);
		const validation = validateExpenseRecord(expenseInput);
		if (!validation.success) {
			const issues = validation.error.issues.map((issue) => ({
				field: issue.path.join('.') || '<root>',
				message: issue.message
			}));
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: actor.id,
				userEmail: actor.email,
				tenantId: 'default',
				workflowId: params.documentId,
				workflowStep: 'inbox_confirm',
				toolId: 'finance.validate-expense-draft',
				riskLevel: 'R2',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef,
				outputRefs: { issues, categoryId: category.id },
				finalAction: 'inbox.validation_failed',
				status: 'failed',
				errorCode: 'validation_failed'
			});
			return { ok: false, status: 400, error: 'Validation failed', issues };
		}
		const exec = await executeGuardedCapability<{ id: string }>({
			db,
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			capabilityId: 'finance.create-expense-record',
			input: expenseInput,
			ctx: capabilityCtx,
			actor: guardActor,
			confirmationRef,
			intent: 'record_expense',
			finalAction: `expense.created.${category.expenseType}.${category.category}`,
			workflowId: params.documentId,
			workflowStep: 'inbox_confirm'
		});
		if (exec.status !== 'ok') {
			return {
				ok: false,
				status: exec.status === 'denied' ? 403 : 400,
				error: 'error' in exec ? exec.error : `Expense write failed (${exec.status})`
			};
		}
		entityId = exec.output.id;
		entityType = 'expense';
		entityRoute = '/finance/expenses';
		auditRef = exec.auditId;
	} else if (category.persistTarget === 'revenue') {
		const exec = await executeGuardedCapability<{ id: string }>({
			db,
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			capabilityId: 'finance.create-revenue-record',
			input: buildRevenueInput(params, artifact.id),
			ctx: capabilityCtx,
			actor: guardActor,
			confirmationRef,
			intent: 'record_revenue',
			finalAction: 'revenue.created',
			workflowId: params.documentId,
			workflowStep: 'inbox_confirm'
		});
		if (exec.status !== 'ok') {
			return {
				ok: false,
				status: exec.status === 'denied' ? 403 : 400,
				error: 'error' in exec ? exec.error : `Revenue write failed (${exec.status})`
			};
		}
		entityId = exec.output.id;
		entityType = 'revenue';
		entityRoute = '/finance/revenue';
		auditRef = exec.auditId;
	} else {
		const docType = archiveDocTypeForPersistTarget(category.persistTarget);
		if (!docType) {
			return { ok: false, status: 400, error: `Unsupported persist target: ${category.persistTarget ?? 'none'}` };
		}

		const projectId = params.projectId || readString(params.fields, ['project_id', 'projectId']);
		if (!projectId) {
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: actor.id,
				userEmail: actor.email,
				tenantId: 'default',
				workflowId: params.documentId,
				workflowStep: 'inbox_confirm',
				toolId: 'finance.create-document-archive',
				riskLevel: 'R4',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef,
				outputRefs: { categoryId: category.id, persistTarget: category.persistTarget },
				finalAction: 'inbox.archive_project_required',
				status: 'failed',
				errorCode: 'project_required'
			});
			return { ok: false, status: 400, error: 'Project is required before confirming archive documents.' };
		}

		const saved = await documentIntake.saveDocHubUpload({
			key: artifact.originalFile.storageRef,
			fileName: artifact.originalFile.fileName,
			fileType: artifact.originalFile.mimeType,
			projectId,
			docType,
			status: readString(params.fields, ['status']) || null,
			notes: readString(params.fields, ['notes']) || null,
			extracted: buildArchiveExtractedFields({ ...params, projectId }),
			uploadedBy: actor.id
		});

		if (!saved.ok || !saved.entityId) {
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: actor.id,
				userEmail: actor.email,
				tenantId: 'default',
				workflowId: params.documentId,
				workflowStep: 'inbox_confirm',
				toolId: 'finance.create-document-archive',
				riskLevel: 'R4',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef,
				outputRefs: { categoryId: category.id, persistTarget: category.persistTarget },
				finalAction: 'inbox.archive_persist_failed',
				status: 'failed',
				errorCode: 'archive_persist_failed'
			});
			const status = saved.ok ? 500 : saved.status;
			return { ok: false, status, error: saved.message ?? 'Archive persistence failed' };
		}

		entityId = saved.entityId;
		entityType = saved.entityType ?? docType;
		entityRoute = `/projects/${encodeURIComponent(projectId)}/documents/${
			docType === 'purchase_order' ? 'purchase-orders' : `${docType}s`
		}/${encodeURIComponent(entityId)}`;

		// Archive isn't a registered capability — write its own success audit.
		const archiveAudit = await appendAgentAuditEntry(db, {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			userId: actor.id,
			userEmail: actor.email,
			tenantId: 'default',
			workflowId: params.documentId,
			workflowStep: 'inbox_confirm',
			toolId: 'finance.create-document-archive',
			riskLevel: 'R4',
			permissionResult: 'allowed',
			confirmationRequired: true,
			confirmationRef,
			modelId: 'inbox-confirm-v1',
			promptVersion: 'inbox-confirm-v1',
			schemaVersion: 'v1',
			outputRefs: { entityType, entityId, categoryId: category.id },
			finalAction: `${entityType}.created`,
			status: 'ok'
		});
		auditRef = archiveAudit.auditId;
	}

	// 4. Mark artifact confirmed (drops it out of inbox listing).
	await intake.markConfirmed({
		tenantId: 'default',
		documentId: params.documentId,
		entityType,
		entityId,
		categoryId: category.id
	});

	return { ok: true, entityId, entityType, entityRoute, categoryId: category.id, auditRef };
}
