import type { RequestHandler } from './$types';

import { fail, ok } from '$platform/http';
import { hashConfirmationPayload } from '$platform/workflow/payload-hash';
import { createModuleContext } from '$platform/modules';
import { getDb } from '../../../../../infrastructure/db';
import { createDocumentIntakeApi, createDocumentIntakeService } from '$modules/document-intake';
import {
	createFinanceApi,
	findCategoryById,
	financeAgentManifest,
	financeRules,
	type CategoryDefinition
} from '$modules/finance';
import { appendAgentAuditEntry } from '$platform/audit/audit-log';

const { validateExpenseRecord } = financeRules;

/**
 * POST /api/documents/[id]/confirm
 *
 * Inbox-flow confirmation endpoint (Ship 2). User has reviewed the
 * `suggestedFields` (or edited them) on the artifact and clicks Confirm.
 * Persists to the appropriate finance entity (expenses / revenue / archive)
 * based on the resolved category's `persistTarget`, writes an audit entry,
 * and marks the artifact `confirmed` so it leaves the active inbox.
 *
 * Why this is separate from /api/finance/workflow/[id]/confirm:
 *  - The legacy workflow confirm operates on a KV-backed workflow state
 *    machine (BucketStep / KindStep / ConfirmStep flow). It expects the
 *    workflow to exist at step `user_confirmation`.
 *  - The inbox flow has no workflow state — only the artifact. The user
 *    can confirm directly from the inbox (or AI Panel inbox layer) without
 *    spinning up a workflow. This route bridges the artifact directly to
 *    finance persistence.
 *
 * Request body (JSON):
 *  - `payload.documentId` (required): must match :id
 *  - `payload.categoryId` (required): the category the user confirmed; pinned
 *  - `payload.fields` (required): final field values (potentially edited)
 *  - `payload.supplierId` / `poId` / `projectId` (optional): user-attached
 *    business links
 *  - `payloadHash` (required): sha-256 of the canonical payload (tamper guard)
 */

interface ConfirmedPayload {
	documentId: string;
	categoryId: string;
	supplierId?: string | null;
	poId?: string | null;
	projectId?: string | null;
	fields: Record<string, unknown>;
}

interface ConfirmBody {
	payload: ConfirmedPayload;
	payloadHash: string;
}

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
 * Mutates in place — call only AFTER the payload-hash check so the hash stays
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

function buildExpenseInput(payload: ConfirmedPayload, category: CategoryDefinition, documentId: string) {
	const normalized = normalizeConfirmedFields(payload.fields);
	const projectId = payload.projectId ?? (readString(payload.fields, ['project_id', 'projectId']) || null);
	const reimbursement = readBoolean(payload.fields, ['reimbursement'], false);
	const businessTrip = readBoolean(payload.fields, ['business_trip', 'businessTrip'], false);
	const destination = readString(payload.fields, ['destination']) || null;
	const staffName = readString(payload.fields, ['staff_name', 'recipient_name', 'staffName']) || null;
	const metadata = metadataFromFields(payload.fields, [
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
		notes: `Recorded via inbox · ${category.label} · ${normalized.documentNumber}${payload.poId ? ` · po=${payload.poId}` : ''}`
	} as const;
}

function buildRevenueInput(payload: ConfirmedPayload, documentId: string) {
	const normalized = normalizeConfirmedFields(payload.fields);
	const projectId = payload.projectId ?? (readString(payload.fields, ['project_id', 'projectId']) || null);
	const metadata = metadataFromFields(payload.fields, [
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
		invoiceType: readString(payload.fields, ['invoice_type', 'invoiceType'], 'tax_invoice') as
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

function buildArchiveExtractedFields(payload: ConfirmedPayload) {
	const normalized = normalizeConfirmedFields(payload.fields);
	return {
		...payload.fields,
		project_id: payload.projectId || readString(payload.fields, ['project_id', 'projectId']) || undefined,
		contract_number: readString(payload.fields, ['contract_number', 'contractNumber'], normalized.documentNumber),
		quotation_number: readString(
			payload.fields,
			['quotation_number', 'quotationNumber'],
			normalized.documentNumber
		),
		po_number: readString(payload.fields, ['po_number', 'poNumber'], normalized.documentNumber),
		client_name: readString(
			payload.fields,
			['client_name', 'customer_name', 'clientName', 'customerName'],
			normalized.counterpartyName
		),
		supplier_name: readString(
			payload.fields,
			['supplier_name', 'vendor', 'supplierName'],
			normalized.counterpartyName
		),
		date: readString(payload.fields, ['date', 'document_date', 'documentDate'], normalized.issueDate),
		effective_date: readString(payload.fields, ['effective_date', 'effectiveDate'], normalized.issueDate),
		expiry_date: readString(payload.fields, ['expiry_date', 'expiryDate'], normalized.dueDate),
		amount: normalized.totalAmount,
		currency: normalized.currency
	};
}

export const POST: RequestHandler = async (event) => {
	if (!event.platform) return fail('Cloudflare platform bindings are required', 500);
	const user = event.locals.user;
	if (!user) return fail('Unauthorized', 401);

	const id = event.params.id;
	if (!id) return fail('Document id is required', 400);

	const env = event.platform.env;
	const db = getDb(env);

	const body = (await event.request.json().catch(() => null)) as ConfirmBody | null;
	if (!body?.payload || !body?.payloadHash) {
		return fail('payload and payloadHash are required', 400);
	}
	if (body.payload.documentId !== id) {
		return fail('payload.documentId does not match URL :id', 400);
	}

	// 1. Hash check (tamper guard).
	const recomputedHash = await hashConfirmationPayload(body.payload);
	if (recomputedHash !== body.payloadHash) {
		await appendAgentAuditEntry(db, {
			agentId: financeAgentManifest.id,
			agentVersion: financeAgentManifest.version,
			userId: user.id,
			userEmail: user.email,
			tenantId: 'default',
			workflowId: id,
			workflowStep: 'inbox_confirm',
			toolId: 'finance.create-expense-record',
			riskLevel: 'R4',
			permissionResult: 'allowed',
			confirmationRequired: true,
			confirmationRef: body.payloadHash,
			finalAction: 'inbox.confirmation_failed',
			status: 'failed',
			errorCode: 'payload_hash_mismatch'
		});
		return fail('Payload hash mismatch — UI state and submission do not agree.', 400);
	}

	// Hash validated — safe to normalize line_items (mutating fields now won't
	// break the tamper guard). Lands in expenses/revenue metadata or the archive
	// `extracted` blob downstream.
	normalizeLineItemsInPlace(body.payload.fields);

	// 2. Verify artifact exists and is in a confirmable state.
	const intake = createDocumentIntakeService({ db, env, user });
	const artifact = await intake.getDocumentArtifact({ tenantId: 'default', documentId: id });
	if (!artifact) return fail('Document artifact not found', 404);
	if (
		artifact.processingStatus !== 'ready_for_review' &&
		artifact.processingStatus !== 'ready_for_workflow'
	) {
		return fail(
			`Artifact is in '${artifact.processingStatus}' state; only ready_for_review can be confirmed.`,
			409
		);
	}

	// 3. Resolve category (must be pinned by caller).
	const category = findCategoryById(body.payload.categoryId);
	if (!category) {
		return fail(`Unknown categoryId: ${body.payload.categoryId}`, 400);
	}

	// 4. Branch persistence by category.persistTarget.
	const ctx = await createModuleContext(event);
	const finance = createFinanceApi(ctx);
	const documentIntake = createDocumentIntakeApi(ctx);

	let entityId: string;
	let entityRoute: string;
	let entityType: string;
	let toolId: string;
	let finalAction: string;

	if (category.persistTarget === 'expenses') {
		const expenseInput = buildExpenseInput(body.payload, category, artifact.id);
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
				tenantId: 'default',
				workflowId: id,
				workflowStep: 'inbox_confirm',
				toolId: 'finance.validate-expense-draft',
				riskLevel: 'R2',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef: recomputedHash,
				outputRefs: { issues, categoryId: category.id },
				finalAction: 'inbox.validation_failed',
				status: 'failed',
				errorCode: 'validation_failed'
			});
			return fail('Validation failed', 400, { issues });
		}
		const created = await finance.expenses.create(expenseInput);
		entityId = created.id;
		entityType = 'expense';
		entityRoute = '/finance/expenses';
		toolId = 'finance.create-expense-record';
		finalAction = `expense.created.${category.expenseType}.${category.category}`;
	} else if (category.persistTarget === 'revenue') {
		const created = await finance.revenue.createRevenue(buildRevenueInput(body.payload, artifact.id));
		entityId = created.id;
		entityType = 'revenue';
		entityRoute = '/finance/revenue';
		toolId = 'finance.create-revenue-record';
		finalAction = 'revenue.created';
	} else {
		const docType = archiveDocTypeForPersistTarget(category.persistTarget);
		if (!docType) {
			return fail(`Unsupported persist target: ${category.persistTarget ?? 'none'}`, 400);
		}

		const projectId = body.payload.projectId || readString(body.payload.fields, ['project_id', 'projectId']);
		if (!projectId) {
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: user.id,
				userEmail: user.email,
				tenantId: 'default',
				workflowId: id,
				workflowStep: 'inbox_confirm',
				toolId: 'finance.create-document-archive',
				riskLevel: 'R4',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef: recomputedHash,
				outputRefs: { categoryId: category.id, persistTarget: category.persistTarget },
				finalAction: 'inbox.archive_project_required',
				status: 'failed',
				errorCode: 'project_required'
			});
			return fail('Project is required before confirming archive documents.', 400);
		}

		const saved = await documentIntake.saveDocHubUpload({
			key: artifact.originalFile.storageRef,
			fileName: artifact.originalFile.fileName,
			fileType: artifact.originalFile.mimeType,
			projectId,
			docType,
			status: readString(body.payload.fields, ['status']) || null,
			notes: readString(body.payload.fields, ['notes']) || null,
			extracted: buildArchiveExtractedFields({ ...body.payload, projectId }),
			uploadedBy: user.id
		});

		if (!saved.ok || !saved.entityId) {
			await appendAgentAuditEntry(db, {
				agentId: financeAgentManifest.id,
				agentVersion: financeAgentManifest.version,
				userId: user.id,
				userEmail: user.email,
				tenantId: 'default',
				workflowId: id,
				workflowStep: 'inbox_confirm',
				toolId: 'finance.create-document-archive',
				riskLevel: 'R4',
				permissionResult: 'allowed',
				confirmationRequired: true,
				confirmationRef: recomputedHash,
				outputRefs: { categoryId: category.id, persistTarget: category.persistTarget },
				finalAction: 'inbox.archive_persist_failed',
				status: 'failed',
				errorCode: 'archive_persist_failed'
			});
			const status = saved.ok ? 500 : saved.status;
			return fail(saved.message ?? 'Archive persistence failed', status);
		}

		entityId = saved.entityId;
		entityType = saved.entityType ?? docType;
		entityRoute = `/projects/${encodeURIComponent(projectId)}/documents/${
			docType === 'purchase_order' ? 'purchase-orders' : `${docType}s`
		}/${encodeURIComponent(entityId)}`;
		toolId = 'finance.create-document-archive';
		finalAction = `${entityType}.created`;
	}

	// 5. Audit success.
	const audit = await appendAgentAuditEntry(db, {
		agentId: financeAgentManifest.id,
		agentVersion: financeAgentManifest.version,
		userId: user.id,
		userEmail: user.email,
		tenantId: 'default',
		workflowId: id,
		workflowStep: 'inbox_confirm',
		toolId,
		riskLevel: 'R4',
		permissionResult: 'allowed',
		confirmationRequired: true,
		confirmationRef: recomputedHash,
		modelId: 'inbox-confirm-v1',
		promptVersion: 'inbox-confirm-v1',
		schemaVersion: 'v1',
		outputRefs: {
			entityType,
			entityId,
			categoryId: category.id
		},
		finalAction,
		status: 'ok'
	});

	// 6. Mark artifact confirmed (drops it out of inbox listing).
	await intake.markConfirmed({
		tenantId: 'default',
		documentId: id,
		entityType,
		entityId,
		categoryId: category.id
	});

	return ok({
		entityId,
		auditRef: audit.auditId,
		entityRoute,
		categoryId: category.id
	});
};
