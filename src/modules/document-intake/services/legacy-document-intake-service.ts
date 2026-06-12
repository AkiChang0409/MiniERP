import { and, eq, isNull } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { schema } from '$infrastructure/db';
import { objectExists } from '$infrastructure/storage/r2';
import type { OcrQueueMessage } from '$platform/ai/ocr/types';
import { createFinanceApi } from '$modules/finance';

function fileTypeCategory(mime: string): 'pdf' | 'image' | 'other' {
	const normalized = mime.toLowerCase();
	if (normalized.includes('pdf')) return 'pdf';
	if (normalized.includes('image')) return 'image';
	return 'other';
}

function str(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value.replace(/,/g, ''));
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

type IntakeBucket = 'revenue' | 'expense' | 'document_only';

function normalizeProjectId(value: string | null | undefined): string | null {
	if (!value) return null;
	const normalized = value.trim();
	if (!normalized || normalized.toLowerCase() === 'company') return null;
	return normalized;
}

function mapDocumentsDocType(
	bucket: IntakeBucket,
	docType: string,
	categoryDocType: string | null
): 'invoice' | 'receipt' | 'contract' | 'po' | 'bom' | 'quotation' | 'other' {
	if (bucket === 'document_only') {
		if (docType === 'contract') return 'contract';
		if (docType === 'quotation') return 'quotation';
		if (docType === 'purchase_order') return 'po';
		return 'other';
	}
	if (bucket === 'revenue') return 'invoice';
	if (categoryDocType === 'invoice') return 'invoice';
	if (categoryDocType === 'receipt') return 'receipt';
	if (categoryDocType === 'po') return 'po';
	return 'receipt';
}

function buildExpenseMetadata(
	category: string,
	fields: Record<string, unknown>,
	categoryDocType: string | null | undefined
): string | null {
	const meta: Record<string, unknown> = {};

	if (category === 'logistics' && fields.trackingNumber) {
		meta.tracking_number = fields.trackingNumber;
	}
	if (category === 'purchase') {
		if (fields.poNumber) meta.po_number = fields.poNumber;
		if (fields.description) meta.description = fields.description;
	}
	if (category === 'invoice' || (categoryDocType === 'invoice' && category !== 'purchase')) {
		if (fields.invoiceNumber) meta.invoice_number = fields.invoiceNumber;
		if (fields.dueDate) meta.due_date = fields.dueDate;
	}
	if (category === 'receipt') {
		if (fields.invoiceNumber) meta.receipt_number = fields.invoiceNumber;
	}
	if (category === 'ai_subscription') {
		if (fields.invoiceNumber) meta.invoice_number = fields.invoiceNumber;
		if (fields.dueDate) meta.next_billing = fields.dueDate;
	}
	if (category === 'allowance') {
		if (fields.dateStart) meta.date_start = fields.dateStart;
		if (fields.dateEnd) meta.date_end = fields.dateEnd;
	}

	return Object.keys(meta).length > 0 ? JSON.stringify(meta) : null;
}

export class DocumentIntakeService {
	constructor(private ctx: ModuleContext) {}

	private async writeAuditLog(input: {
		action: string;
		entityType: string;
		entityId?: string | null;
		projectId?: string | null;
		metadata?: Record<string, unknown>;
	}) {
		try {
			const now = new Date().toISOString();
			await this.ctx.db.insert(schema.auditLogs).values({
				id: crypto.randomUUID(),
				actorUserId: this.ctx.user?.id ?? null,
				actorEmail: this.ctx.user?.email ?? null,
				action: input.action,
				entityType: input.entityType,
				entityId: input.entityId ?? null,
				projectId: input.projectId ?? null,
				metadata: input.metadata ? JSON.stringify(input.metadata) : null,
				createdAt: now,
				updatedAt: now
			});
		} catch (error) {
			console.error('[document-intake] audit log failed:', error);
		}
	}

	async getDocumentStatus(documentId: string) {
		const [document] = await this.ctx.db
			.select({
				id: schema.documents.id,
				fileKey: schema.documents.fileKey,
				ocrStatus: schema.documents.ocrStatus,
				ocrResult: schema.documents.ocrResult,
				ocrConfidence: schema.documents.ocrConfidence,
				docType: schema.documents.docType,
				purpose: schema.documents.purpose,
				updatedAt: schema.documents.updatedAt
			})
			.from(schema.documents)
			.where(eq(schema.documents.id, documentId))
			.limit(1);

		if (!document) return null;

		let parsedResult = null;
		if (document.ocrResult) {
			try {
				parsedResult = JSON.parse(document.ocrResult);
			} catch {
				parsedResult = { raw: document.ocrResult };
			}
		}

		let expenseId = null;
		if (document.ocrStatus === 'done' && document.purpose === 'financial') {
			const [expense] = await this.ctx.db
				.select({ id: schema.expenses.id })
				.from(schema.expenses)
				.where(eq(schema.expenses.documentRef, document.id))
				.limit(1);

			if (expense) {
				expenseId = expense.id;
			} else if (document.fileKey) {
				const [expenseByKey] = await this.ctx.db
					.select({ id: schema.expenses.id })
					.from(schema.expenses)
					.where(eq(schema.expenses.documentRef, document.fileKey))
					.limit(1);
				expenseId = expenseByKey?.id || null;
			}
		}

		return {
			documentId: document.id,
			ocrStatus: document.ocrStatus,
			ocrResult: parsedResult,
			ocrConfidence: document.ocrConfidence,
			docType: document.docType,
			purpose: document.purpose,
			expenseId,
			updatedAt: document.updatedAt
		};
	}


	async uploadReferenceDocument(input: {
		key: string;
		fileName: string;
		fileType: string;
		projectId: string;
		docType: 'contract' | 'po' | 'bom' | 'quotation' | 'other';
		notes?: string | null;
		triggerOcr?: boolean;
		uploadedBy?: string | null;
	}) {
		const exists = await objectExists(this.ctx.env, input.key);
		if (!exists) {
			return { ok: false as const, status: 404, message: 'Uploaded object was not found in R2' };
		}

		const now = new Date().toISOString();
		const documentId = crypto.randomUUID();

		await this.ctx.db.insert(schema.documents).values({
			id: documentId,
			projectId: input.projectId,
			uploadedBy: input.uploadedBy || 'system',
			fileKey: input.key,
			fileName: input.fileName,
			fileType: fileTypeCategory(input.fileType),
			purpose: 'reference',
			docType: input.docType,
			ocrStatus: input.triggerOcr ? 'pending' : 'done',
			notes: input.notes || null,
			createdAt: now,
			updatedAt: now
		});

		if (input.triggerOcr && input.docType === 'contract') {
			const message: OcrQueueMessage = {
				id: crypto.randomUUID(),
				fileKey: input.key,
				fileType: input.fileType,
				entityType: 'reference_document',
				entityId: documentId,
				projectId: input.projectId,
				metadata: JSON.stringify({
					docType: input.docType,
					purpose: 'reference',
					documentId
				})
			};

			await this.ctx.env.OCR_QUEUE.send(message);

			await this.ctx.db
				.update(schema.documents)
				.set({
					ocrStatus: 'processing',
					updatedAt: new Date().toISOString()
				})
				.where(eq(schema.documents.id, documentId));

			return {
				ok: true as const,
				documentId,
				status: 'queued' as const,
				message: 'Document uploaded and queued for metadata extraction'
			};
		}

		return {
			ok: true as const,
			documentId,
			status: 'saved' as const,
			message: 'Reference document uploaded successfully'
		};
	}


	async saveDocHubUpload(input: {
		key?: string;
		fileName?: string;
		fileType?: string;
		projectId?: string | null;
		docType?: 'contract' | 'quotation' | 'purchase_order';
		status?: string | null;
		notes?: string | null;
		extracted?: Record<string, unknown> | null;
		uploadedBy?: string | null;
	}) {
		const key = str(input.key);
		const fileName = str(input.fileName);
		const fileType = str(input.fileType) || 'application/octet-stream';
		const docType = input.docType;
		if (!key || !fileName || !docType) {
			return { ok: false as const, status: 400, message: 'Missing required fields: key, fileName, docType' };
		}
		if (!['contract', 'quotation', 'purchase_order'].includes(docType)) {
			return { ok: false as const, status: 400, message: 'Unsupported docType' };
		}

		const projectId = str(input.projectId) || null;
		const exists = await objectExists(this.ctx.env, key);
		if (!exists) {
			return { ok: false as const, status: 404, message: 'Uploaded object was not found in R2' };
		}

		if (projectId) {
			const [project] = await this.ctx.db
				.select({ id: schema.projects.id })
				.from(schema.projects)
				.where(and(eq(schema.projects.id, projectId), isNull(schema.projects.deletedAt)))
				.limit(1);
			if (!project) {
				return { ok: false as const, status: 404, message: 'Project not found' };
			}
		}

		const now = new Date().toISOString();
		const extracted = (input.extracted ?? {}) as Record<string, unknown>;
		const status = str(input.status);
		const notes = str(input.notes) || null;
		const currency = str(extracted.currency) || 'SGD';
		const documentId = crypto.randomUUID();
		const uploadedBy = input.uploadedBy || 'system';

		if (docType === 'contract') {
			const contractId = crypto.randomUUID();
			const contractMetadata = {
				...extracted,
				sourceType: 'upload' as const,
				parseStatus: 'not_parsed' as const,
				upload: {
					key,
					fileName,
					contentType: fileType,
					size: 0,
					uploadedAt: now
				}
			};
			await this.ctx.db.insert(schema.contracts).values({
				id: contractId,
				projectId,
				clientName: str(extracted.client_name) || null,
				contractNumber: str(extracted.contract_number) || null,
				effectiveDate: str(extracted.effective_date) || null,
				expiryDate: str(extracted.expiry_date) || null,
				amount: num(extracted.amount),
				currency,
				scope: str(extracted.scope) || null,
				paymentTerms: str(extracted.payment_terms) || null,
				type: (str(extracted.type) as 'customer_contract' | 'supplier_contract' | '') || 'customer_contract',
				status: (status as 'draft' | 'active' | 'completed' | 'terminated' | '') || 'active',
				fileUrl: key,
				metadata: JSON.stringify(contractMetadata),
				notes,
				createdAt: now,
				updatedAt: now
			});
			await this.ctx.db.insert(schema.documents).values({
				id: documentId,
				projectId,
				uploadedBy,
				entityType: 'contract',
				entityId: contractId,
				fileKey: key,
				fileName,
				fileType,
				purpose: 'reference',
				docType: 'contract',
				ocrStatus: 'done',
				ocrResult: JSON.stringify(extracted),
				notes: notes ?? 'Archive only. Not included in cashflow calculation.',
				createdAt: now,
				updatedAt: now
			});
			if (projectId) {
				await this.writeAuditLog({
					action: 'contract.create',
					entityType: 'contract',
					entityId: contractId,
					projectId,
					metadata: { source: 'doc_hub_upload', fileName }
				});
			}
			return { ok: true as const, entityType: 'contract', entityId: contractId, documentId };
		}

		if (docType === 'quotation') {
			if (!projectId) {
				await this.ctx.db.insert(schema.documents).values({
					id: documentId,
					projectId: null,
					uploadedBy,
					entityType: null,
					entityId: null,
					fileKey: key,
					fileName,
					fileType,
					purpose: 'reference',
					docType: 'quotation',
					ocrStatus: 'done',
					ocrResult: JSON.stringify(extracted),
					notes: notes ?? 'Archive only. Not included in cashflow calculation.',
					createdAt: now,
					updatedAt: now
				});
				return { ok: true as const, entityType: 'quotation', entityId: null, documentId };
			}
			const quotationId = crypto.randomUUID();
			await this.ctx.db.insert(schema.quotations).values({
				id: quotationId,
				projectId,
				clientName: str(extracted.client_name) || null,
				quotationNumber: str(extracted.quotation_number) || null,
				date: str(extracted.date) || null,
				validUntil: str(extracted.valid_until) || null,
				amount: num(extracted.amount),
				currency,
				fileUrl: key,
				metadata: JSON.stringify({
					line_items: extracted.line_items ?? null,
					sourceType: 'upload',
					parseStatus: 'not_parsed',
					upload: {
						key,
						fileName,
						contentType: fileType,
						size: 0,
						uploadedAt: now
					}
				}),
				status: (status as 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | '') || 'draft',
				notes,
				createdAt: now,
				updatedAt: now
			});
			await this.ctx.db.insert(schema.documents).values({
				id: documentId,
				projectId,
				uploadedBy,
				entityType: 'quotation',
				entityId: quotationId,
				fileKey: key,
				fileName,
				fileType,
				purpose: 'reference',
				docType: 'quotation',
				ocrStatus: 'done',
				ocrResult: JSON.stringify(extracted),
				notes: notes ?? 'Archive only. Not included in cashflow calculation.',
				createdAt: now,
				updatedAt: now
			});
			await this.writeAuditLog({
				action: 'quotation.create',
				entityType: 'quotation',
				entityId: quotationId,
				projectId,
				metadata: { source: 'doc_hub_upload', fileName }
			});
			return { ok: true as const, entityType: 'quotation', entityId: quotationId, documentId };
		}

		if (!projectId) {
			await this.ctx.db.insert(schema.documents).values({
				id: documentId,
				projectId: null,
				uploadedBy,
				entityType: null,
				entityId: null,
				fileKey: key,
				fileName,
				fileType,
				purpose: 'reference',
				docType: 'po',
				ocrStatus: 'done',
				ocrResult: JSON.stringify(extracted),
				notes: notes ?? 'Archive only. Not included in cashflow calculation.',
				createdAt: now,
				updatedAt: now
			});
			return { ok: true as const, entityType: 'purchase_order', entityId: null, documentId };
		}

		const poId = crypto.randomUUID();
		const resolvedPoNumber = str(extracted.po_number) || `PO-${Date.now().toString(36).toUpperCase()}`;
		await this.ctx.db.insert(schema.purchaseOrders).values({
			id: poId,
			projectId,
			poNumber: resolvedPoNumber,
			supplierName: str(extracted.supplier_name) || 'Unknown supplier',
			clientName: str(extracted.client_name) || null,
			date: str(extracted.date) || null,
			amount: num(extracted.amount),
			currency,
			description: str(extracted.description) || null,
			fileUrl: key,
			metadata: JSON.stringify({
				line_items: extracted.line_items ?? null,
				sourceType: 'upload',
				parseStatus: 'not_parsed',
				upload: {
					key,
					fileName,
					contentType: fileType,
					size: 0,
					uploadedAt: now
				}
			}),
			status: (status as 'draft' | 'sent' | 'confirmed' | 'fulfilled' | '') || 'draft',
			notes,
			createdAt: now,
			updatedAt: now
		});
		await this.ctx.db.insert(schema.documents).values({
			id: documentId,
			projectId,
			uploadedBy,
			entityType: 'purchase_order',
			entityId: poId,
			fileKey: key,
			fileName,
			fileType,
			purpose: 'reference',
			docType: 'po',
			ocrStatus: 'done',
			ocrResult: JSON.stringify(extracted),
			notes: notes ?? 'Archive only. Not included in cashflow calculation.',
			createdAt: now,
			updatedAt: now
		});
		await this.writeAuditLog({
			action: 'purchase_order.create',
			entityType: 'purchase_order',
			entityId: poId,
			projectId,
			metadata: {
				source: 'doc_hub_upload',
				fileName,
				poNumber: resolvedPoNumber
			}
		});
		return { ok: true as const, entityType: 'purchase_order', entityId: poId, documentId };
	}

	async savePanelIntake(input: {
		fileKey?: string;
		fileName?: string;
		fileType?: string;
		bucket?: IntakeBucket;
		docType?: string;
		category?: string | null;
		expenseType?: 'opex' | 'sales_cost' | null;
		categoryDocType?: 'invoice' | 'receipt' | 'po' | null;
		fields?: Record<string, unknown>;
		projectId?: string | null;
		uploadedBy?: string | null;
	}) {
		const bucket = input.bucket;
		const docType = str(input.docType);
		if (!bucket || !docType) {
			return { ok: false as const, status: 400, message: 'bucket and docType are required' };
		}

		const fields = input.fields ?? {};
		const projectId = normalizeProjectId(input.projectId);
		const isAllowance = bucket === 'expense' && input.category === 'allowance';
		if (!isAllowance) {
			if (!input.fileKey || !input.fileName || !input.fileType) {
				return { ok: false as const, status: 400, message: 'fileKey, fileName, fileType are required' };
			}
			const exists = await objectExists(this.ctx.env, input.fileKey);
			if (!exists) {
				return { ok: false as const, status: 404, message: 'Uploaded object was not found in R2' };
			}
		}

		const financeApi = createFinanceApi(this.ctx);
		const now = new Date().toISOString();
		const uploadedBy = input.uploadedBy || 'system';

		if (bucket === 'revenue') {
			const invoiceTypeRaw = str(fields.invoiceType) || 'standard';
			const invoiceType: 'standard' | 'zero_rate' | 'tax_invoice' =
				invoiceTypeRaw === 'zero_rate' || invoiceTypeRaw === 'tax_invoice'
					? invoiceTypeRaw
					: 'standard';

			const amount = num(fields.totalAmount) ?? 0;
			const date = str(fields.documentDate) || now.slice(0, 10);

			const revenueRow = await financeApi.revenue.createRevenue({
				projectId,
				invoiceType,
				invoiceNumber: str(fields.invoiceNumber) || null,
				clientName: str(fields.clientName) || null,
				date,
				amount,
				currency: str(fields.currency) || 'SGD',
				gstAmount: num(fields.gstAmount) ?? 0,
				notes: null
			});

			await this.ctx.db.insert(schema.documents).values({
				id: crypto.randomUUID(),
				projectId,
				uploadedBy,
				entityType: 'revenue',
				entityId: revenueRow.id,
				fileKey: input.fileKey!,
				fileName: input.fileName!,
				fileType: fileTypeCategory(input.fileType!),
				purpose: 'financial',
				docType: 'invoice',
				ocrStatus: 'done',
				ocrResult: JSON.stringify({ source: 'intake', submittedAt: now, fields }),
				createdAt: now,
				updatedAt: now
			});

			return {
				ok: true as const,
				entityType: 'revenue',
				entityId: revenueRow.id,
				message: 'Revenue invoice recorded'
			};
		}

		if (bucket === 'expense') {
			const expenseType: 'opex' | 'sales_cost' = input.expenseType === 'sales_cost' ? 'sales_cost' : 'opex';
			const category = str(input.category) || 'others';
			const amount = num(fields.totalAmount) ?? 0;
			const date = str(fields.documentDate) || str(fields.dateStart) || now.slice(0, 10);

			const expenseRow = await financeApi.expenses.create({
				projectId,
				expenseType,
				category,
				amount,
				currency: str(fields.currency) || 'SGD',
				date,
				vendorOrSupplier: str(fields.supplierName) || null,
				staffName: str(fields.staffName) || null,
				reimbursement: fields.reimbursement === true,
				businessTrip: fields.businessTrip === true,
				destination: str(fields.destination) || null,
				notes: null,
				documentRef: input.fileKey ?? null,
				metadata: buildExpenseMetadata(category, fields, input.categoryDocType)
			});

			if (!isAllowance) {
				await this.ctx.db.insert(schema.documents).values({
					id: crypto.randomUUID(),
					projectId,
					uploadedBy,
					entityType: 'expense',
					entityId: expenseRow.id,
					fileKey: input.fileKey!,
					fileName: input.fileName!,
					fileType: fileTypeCategory(input.fileType!),
					purpose: 'financial',
					docType: mapDocumentsDocType(bucket, docType, input.categoryDocType ?? null),
					ocrStatus: 'done',
					ocrResult: JSON.stringify({
						source: 'intake',
						submittedAt: now,
						expenseType,
						category,
						fields
					}),
					createdAt: now,
					updatedAt: now
				});
			}

			return {
				ok: true as const,
				entityType: 'expense',
				entityId: expenseRow.id,
				message: isAllowance ? 'Allowance recorded' : 'Expense recorded'
			};
		}

		const documentId = crypto.randomUUID();
		const docTypeForDocs = mapDocumentsDocType(bucket, docType, null);

		if (docType === 'contract') {
			const contractId = crypto.randomUUID();
			await this.ctx.db.insert(schema.contracts).values({
				id: contractId,
				projectId,
				clientName: str(fields.clientName) || null,
				contractNumber: str(fields.contractNumber) || null,
				effectiveDate: str(fields.effectiveDate) || null,
				expiryDate: str(fields.expiryDate) || null,
				amount: num(fields.totalAmount),
				currency: str(fields.currency) || 'SGD',
				scope: str(fields.scope) || null,
				paymentTerms: str(fields.paymentTerms) || null,
				type: 'customer_contract',
				status: 'active',
				fileUrl: input.fileKey!,
				metadata: JSON.stringify({ source: 'intake', fields }),
				notes: null,
				createdAt: now,
				updatedAt: now
			});
			await this.ctx.db.insert(schema.documents).values({
				id: documentId,
				projectId,
				uploadedBy,
				entityType: 'contract',
				entityId: contractId,
				fileKey: input.fileKey!,
				fileName: input.fileName!,
				fileType: fileTypeCategory(input.fileType!),
				purpose: 'reference',
				docType: docTypeForDocs,
				ocrStatus: 'done',
				ocrResult: JSON.stringify({ source: 'intake', fields }),
				notes: 'Archive only. Not included in cashflow calculation.',
				createdAt: now,
				updatedAt: now
			});
			return { ok: true as const, entityType: 'contract', entityId: contractId, documentId, message: 'Contract filed' };
		}

		if (docType === 'quotation') {
			let quotationId: string | null = null;
			if (projectId) {
				quotationId = crypto.randomUUID();
				await this.ctx.db.insert(schema.quotations).values({
					id: quotationId,
					projectId,
					clientName: str(fields.clientName) || null,
					quotationNumber: str(fields.quotationNumber) || null,
					date: str(fields.documentDate) || null,
					validUntil: str(fields.validUntil) || null,
					amount: num(fields.totalAmount),
					currency: str(fields.currency) || 'SGD',
					fileUrl: input.fileKey!,
					metadata: JSON.stringify({ source: 'intake', fields }),
					status: 'draft',
					notes: null,
					createdAt: now,
					updatedAt: now
				});
			}
			await this.ctx.db.insert(schema.documents).values({
				id: documentId,
				projectId,
				uploadedBy,
				entityType: quotationId ? 'quotation' : null,
				entityId: quotationId,
				fileKey: input.fileKey!,
				fileName: input.fileName!,
				fileType: fileTypeCategory(input.fileType!),
				purpose: 'reference',
				docType: docTypeForDocs,
				ocrStatus: 'done',
				ocrResult: JSON.stringify({ source: 'intake', fields }),
				notes: 'Archive only. Not included in cashflow calculation.',
				createdAt: now,
				updatedAt: now
			});
			return {
				ok: true as const,
				entityType: quotationId ? 'quotation' : null,
				entityId: quotationId,
				documentId,
				message: quotationId ? 'Quotation filed' : 'Quotation archived (no project)'
			};
		}

		if (docType === 'purchase_order') {
			let poId: string | null = null;
			if (projectId) {
				poId = crypto.randomUUID();
				const poNumber = str(fields.poNumber) || `PO-${Date.now().toString(36).toUpperCase()}`;
				await this.ctx.db.insert(schema.purchaseOrders).values({
					id: poId,
					projectId,
					poNumber,
					supplierName: str(fields.supplierName) || 'Unknown supplier',
					clientName: str(fields.clientName) || null,
					date: str(fields.documentDate) || null,
					amount: num(fields.totalAmount),
					currency: str(fields.currency) || 'SGD',
					description: str(fields.description) || null,
					fileUrl: input.fileKey!,
					metadata: JSON.stringify({ source: 'intake', fields }),
					status: 'draft',
					notes: null,
					createdAt: now,
					updatedAt: now
				});
			}
			await this.ctx.db.insert(schema.documents).values({
				id: documentId,
				projectId,
				uploadedBy,
				entityType: poId ? 'purchase_order' : null,
				entityId: poId,
				fileKey: input.fileKey!,
				fileName: input.fileName!,
				fileType: fileTypeCategory(input.fileType!),
				purpose: 'reference',
				docType: docTypeForDocs,
				ocrStatus: 'done',
				ocrResult: JSON.stringify({ source: 'intake', fields }),
				notes: 'Archive only. Not included in cashflow calculation.',
				createdAt: now,
				updatedAt: now
			});
			return {
				ok: true as const,
				entityType: poId ? 'purchase_order' : null,
				entityId: poId,
				documentId,
				message: poId ? 'PO filed' : 'PO archived (no project)'
			};
		}

		await this.ctx.db.insert(schema.documents).values({
			id: documentId,
			projectId,
			uploadedBy,
			entityType: null,
			entityId: null,
			fileKey: input.fileKey!,
			fileName: input.fileName!,
			fileType: fileTypeCategory(input.fileType!),
			purpose: 'reference',
			docType: 'other',
			ocrStatus: 'done',
			ocrResult: JSON.stringify({ source: 'intake', fields }),
			notes: str(fields.notes) || 'Archive only. Not included in cashflow calculation.',
			createdAt: now,
			updatedAt: now
		});
		return { ok: true as const, entityType: null, entityId: null, documentId, message: 'Document archived' };
	}
}
