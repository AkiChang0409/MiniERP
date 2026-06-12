import type { ModuleContext } from '$platform/modules/types';
import { schema } from '$infrastructure/db';
import { objectExists } from '$infrastructure/storage/r2';
import {
	beginIdempotentRequest,
	claimFileHash,
	completeIdempotentRequest,
	failIdempotentRequest,
	getObjectSha256,
	normalizeProjectScope,
	releaseFileHashClaim,
	UploadGuardSchemaError
} from '$platform/files/upload-guards';
import {
	EXPENSE_DOC_TYPES,
	EXPENSE_CATEGORY_OPTIONS,
	CATEGORY_DOC_TYPE_MAP,
	type ExpenseType,
	type ExpenseCategory
} from '$modules/finance/domain/expense-upload';
import { resolveSgdEquivalentForWrite } from '$modules/finance/services/fx/resolve-sgd-equivalent';

type ExpenseUploadBody = {
	key?: string;
	fileName?: string;
	fileType?: string;
	projectId?: string | null;
	expenseType?: ExpenseType;
	category?: string;
	docType?: string | null;
	reimbursement?: boolean;
	businessTrip?: boolean;
	destination?: string | null;
	staffName?: string | null;
	vendorOrSupplier?: string | null;
	amount?: number | null;
	currency?: string;
	gstAmount?: number | null;
	date?: string | null;
	notes?: string | null;
	metadata?: Record<string, unknown>;
	allowance?: boolean;
	idempotencyKey?: string;
};

type ExpenseUploadResult =
	| { ok: true; data: unknown; status: number }
	| { ok: false; message: string; status: number; details?: unknown };

function success(data: unknown, status = 200): ExpenseUploadResult {
	return { ok: true, data, status };
}

function failure(message: string, status = 400, details?: unknown): ExpenseUploadResult {
	return { ok: false, message, status, details };
}

export class ExpenseUploadService {
	constructor(private ctx: ModuleContext) {}

	async upload(body: ExpenseUploadBody): Promise<ExpenseUploadResult> {
		const normalizedProjectId =
			typeof body.projectId === 'string'
				? (() => {
						const value = body.projectId.trim();
						if (!value || value.toLowerCase() === 'company') return null;
						return value;
					})()
				: null;

		const expenseType: ExpenseType = body.expenseType === 'sales_cost' ? 'sales_cost' : 'opex';
		const category = body.category || EXPENSE_CATEGORY_OPTIONS[expenseType][0];
		const docType = body.docType || CATEGORY_DOC_TYPE_MAP[category as ExpenseCategory] || null;

		if (body.allowance || category === 'allowance') {
			return this.createAllowance(body, normalizedProjectId);
		}

		if (!body.key || !body.fileName || !body.fileType) {
			return failure('Missing required fields: key, fileName, fileType');
		}
		if (!body.idempotencyKey || !String(body.idempotencyKey).trim()) {
			return failure('idempotencyKey is required for file upload');
		}

		if (docType && !EXPENSE_DOC_TYPES.includes(docType as never)) {
			return failure(`Invalid docType. Must be one of: ${EXPENSE_DOC_TYPES.join(', ')}`);
		}

		const exists = await objectExists(this.ctx.env, body.key);
		if (!exists) {
			return failure('Uploaded object was not found in R2', 404);
		}

		const amountNum =
			body.amount !== null && body.amount !== undefined && Number.isFinite(Number(body.amount))
				? Number(body.amount)
				: NaN;
		if (!body.date || !String(body.date).trim()) {
			return failure('date is required for file upload');
		}
		if (!Number.isFinite(amountNum)) {
			return failure('amount is required for file upload (number)');
		}

		const db = this.ctx.db;
		const now = new Date().toISOString();
		const documentId = crypto.randomUUID();
		const expenseId = crypto.randomUUID();
		const projectScope = normalizeProjectScope(normalizedProjectId);
		const idempotencyKey = String(body.idempotencyKey).trim();

		const fileTypeCategory = body.fileType.includes('pdf')
			? 'pdf'
			: body.fileType.includes('image')
				? 'image'
				: 'other';

		const currency = (body.currency || 'SGD').trim().toUpperCase();
		const gst =
			body.gstAmount !== null && body.gstAmount !== undefined && Number.isFinite(Number(body.gstAmount))
				? Number(body.gstAmount)
				: 0;
		const sgdEquivalent = await resolveSgdEquivalentForWrite({
			amount: amountNum,
			currency,
			dateYmd: String(body.date).trim()
		});

		const ocrResultPayload = {
			source: 'manual_upload',
			submittedAt: now,
			skippedAsyncOcr: true,
			expenseType,
			category,
			docType
		};

		let idem: Awaited<ReturnType<typeof beginIdempotentRequest>>;
		try {
			idem = await beginIdempotentRequest(db, {
				idempotencyKey,
				endpoint: 'POST:/api/expenses/upload',
				userId: this.ctx.user?.id ?? null,
				projectScope
			});
		} catch (e) {
			if (e instanceof UploadGuardSchemaError) {
				return failure('Upload dedupe guard is initializing. Please run DB migration and retry.', 503);
			}
			throw e;
		}
		if (idem.state === 'completed') {
			if (idem.responseBody) {
				try {
					const parsed = JSON.parse(idem.responseBody) as unknown;
					return success(parsed, 200);
				} catch {
					return success({ message: 'Request already processed' }, 200);
				}
			}
			return success({ message: 'Request already processed' }, 200);
		}
		if (idem.state === 'in_progress') {
			return failure('A request with the same idempotency key is still processing', 409);
		}

		const fileHash = await getObjectSha256(this.ctx.env, body.key);
		if (!fileHash) {
			await failIdempotentRequest(db, idempotencyKey, 'Uploaded file missing in storage when hashing');
			return failure('Uploaded object was not found in R2 during dedupe check', 404);
		}
		let claim: Awaited<ReturnType<typeof claimFileHash>>;
		try {
			claim = await claimFileHash(db, {
				domain: 'expense',
				projectScope,
				fileHash,
				entityType: 'expense',
				entityId: expenseId,
				createdBy: this.ctx.user?.id ?? null
			});
		} catch (e) {
			if (e instanceof UploadGuardSchemaError) {
				await failIdempotentRequest(db, idempotencyKey, e.message);
				return failure('Upload dedupe guard is initializing. Please run DB migration and retry.', 503);
			}
			throw e;
		}
		if (!claim.ok) {
			await failIdempotentRequest(db, idempotencyKey, 'Duplicate file hash detected');
			return failure('Duplicate upload detected: this expense file was already recorded', 409, {
				code: 'DUPLICATE_FILE_UPLOAD',
				existingEntityId: claim.duplicateEntityId
			});
		}

		try {
			await db.insert(schema.documents).values({
				id: documentId,
				projectId: normalizedProjectId,
				uploadedBy: this.ctx.user?.id || 'system',
				fileKey: body.key,
				fileName: body.fileName,
				fileType: fileTypeCategory,
				purpose: 'financial',
				docType: (docType as 'invoice' | 'receipt' | 'po') || 'other',
				ocrStatus: 'done',
				ocrResult: JSON.stringify(ocrResultPayload),
				createdAt: now,
				updatedAt: now
			});
		} catch (e) {
			await releaseFileHashClaim(db, { domain: 'expense', projectScope, fileHash });
			await failIdempotentRequest(db, idempotencyKey, e instanceof Error ? e.message : String(e));
			const message = e instanceof Error ? e.message : String(e);
			return failure('Failed to insert documents record', 500, {
				message,
				projectId: normalizedProjectId,
				docType,
				purpose: 'financial'
			});
		}

		try {
			await db.insert(schema.expenses).values({
				id: expenseId,
				projectId: normalizedProjectId,
				expenseType,
				category,
				docType: (docType as 'invoice' | 'receipt' | 'po') || null,
				date: String(body.date).trim(),
				amount: amountNum,
				currency,
				sgdEquivalent,
				gstAmount: gst,
				vendorOrSupplier: body.vendorOrSupplier?.trim() || null,
				staffName: body.staffName?.trim() || null,
				reimbursement: body.reimbursement ?? false,
				businessTrip: body.businessTrip ?? false,
				destination: body.destination?.trim() || null,
				documentRef: body.key,
				metadata: body.metadata ? JSON.stringify(body.metadata) : null,
				notes: body.notes?.trim() || null,
				createdAt: now,
				updatedAt: now
			});
		} catch (e) {
			await releaseFileHashClaim(db, { domain: 'expense', projectScope, fileHash });
			await failIdempotentRequest(db, idempotencyKey, e instanceof Error ? e.message : String(e));
			const message = e instanceof Error ? e.message : String(e);
			return failure('Failed to insert expense record', 500, {
				message,
				documentId,
				projectId: normalizedProjectId
			});
		}

		const responseBody = {
			documentId,
			expenseId,
			status: 'created',
			message: 'Document and expense saved (no background OCR queue)'
		};
		await completeIdempotentRequest(db, idempotencyKey, JSON.stringify(responseBody));
		return success(responseBody, 201);
	}

	private async createAllowance(
		body: ExpenseUploadBody,
		normalizedProjectId: string | null
	): Promise<ExpenseUploadResult> {
		if (!body.staffName) {
			return failure('staffName is required for allowance');
		}

		const now = new Date().toISOString();
		const expenseId = crypto.randomUUID();

		await this.ctx.db.insert(schema.expenses).values({
			id: expenseId,
			projectId: normalizedProjectId,
			expenseType: 'opex',
			category: 'allowance',
			date: body.date || now.slice(0, 10),
			amount: body.amount || 0,
			currency: 'SGD',
			sgdEquivalent: body.amount || 0,
			gstAmount: 0,
			staffName: body.staffName,
			reimbursement: body.reimbursement ?? false,
			businessTrip: true,
			destination: body.destination || null,
			metadata: body.metadata ? JSON.stringify(body.metadata) : null,
			notes: body.notes || null,
			createdAt: now,
			updatedAt: now
		});

		return success({ expenseId, status: 'created', message: 'Allowance expense created' }, 201);
	}
}
