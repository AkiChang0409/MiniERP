import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
	CATEGORY_DOC_TYPE_MAP,
	EXPENSE_CATEGORY_OPTIONS,
	EXPENSE_DOC_TYPES,
	type ExpenseCategory,
	type ExpenseType
} from '$modules/finance/domain/expense-upload';
import { buildDocumentMetadata, parseDocumentMetadata } from '$modules/finance/domain/document-metadata';
import { resolveExpenseFilePreview } from '$modules/finance/services/expense-file-preview';
import { resolveSgdEquivalentForWrite } from '$modules/finance/services/fx/resolve-sgd-equivalent';
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
import type { ModuleContext } from '$platform/modules/types';
import { AuditService } from '$platform/audit/audit-service';
import { createEvent } from '../../../platform/events';
import { businessTrips, documents, expenses } from '../../../infrastructure/db/schema';
import {
	findFinanceEmployeeNameById,
	findFinanceProjectLookup,
	listFinanceEmployees,
	listFinanceProjectNames
} from '../integrations';
import { ExpenseRepository } from '../repositories';

const DOCUMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasExpenseAttachment(documentRef: string | null) {
	return Boolean(documentRef && !documentRef.startsWith('manual://'));
}

function buildExpenseStatusLabel(input: {
	documentRef: string | null;
	storageKey: string | null;
	metadata: string | null;
}) {
	const meta = parseDocumentMetadata(input.metadata);
	if (meta.parseStatus === 'reviewed') return 'Reviewed';
	if (meta.parseStatus === 'parsed') return 'Parsed';
	if (meta.parseStatus === 'not_parsed') return 'Pending review';
	if (input.storageKey || hasExpenseAttachment(input.documentRef)) return 'Document';
	return 'Manual';
}

function buildExpenseTotals<
	TRow extends { expenseType: string | null; amount: number | null; sgdEquivalent: number | null }
>(rows: TRow[]) {
	return rows.reduce(
		(acc, row) => {
			const amount = row.sgdEquivalent ?? row.amount ?? 0;
			acc.total += amount;
			if (row.expenseType === 'sales_cost') {
				acc.salesCost += amount;
			} else {
				acc.opex += amount;
			}
			return acc;
		},
		{ total: 0, opex: 0, salesCost: 0 }
	);
}

function nowIso() {
	return new Date().toISOString();
}

type FinanceExpenseMutationInput = {
	category: string;
	expenseType: string;
	amount: number;
	currency: string;
	date: string;
	staffName?: string | null;
	vendorOrSupplier?: string | null;
	notes?: string | null;
};

type FinanceStandaloneExpenseInput = {
	expenseType: ExpenseType;
	category: string;
	amount: number;
	currency: string;
	date: string;
	vendorOrSupplier?: string | null;
	staffName?: string | null;
	reimbursement?: boolean;
	businessTrip?: boolean;
	destination?: string | null;
	notes?: string | null;
};

type FinanceProjectExpenseInput = {
	projectId?: string | null;
	expenseType: ExpenseType;
	category: string;
	docType?: 'invoice' | 'receipt' | 'po' | null;
	amount: number;
	currency?: string;
	date: string;
	vendorOrSupplier?: string | null;
	staffName?: string | null;
	reimbursement?: boolean;
	businessTrip?: boolean;
	destination?: string | null;
	notes?: string | null;
	metadata?: string | null;
	documentRef?: string | null;
	gstAmount?: number | null;
};

type FinanceBusinessTripFilters = { projectId?: string | null; employeeId?: string | null };

type FinanceBusinessTripAllowanceInput = {
	projectId?: string | null;
	employeeId: string;
	destination: string;
	startDate: string;
	endDate: string;
	dailyAllowanceRate: number;
	notes?: string | null;
	requireEmployee?: boolean;
};

type FinanceExpenseUploadBody = {
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

type FinanceExpenseUploadResult =
	| { ok: true; data: unknown; status: number }
	| { ok: false; message: string; status: number; details?: unknown };

function uploadSuccess(data: unknown, status = 200): FinanceExpenseUploadResult {
	return { ok: true, data, status };
}

function uploadFailure(
	message: string,
	status = 400,
	details?: unknown
): FinanceExpenseUploadResult {
	return { ok: false, message, status, details };
}

export function createFinanceExpenseApi(ctx: ModuleContext) {
	const expenseRepository = new ExpenseRepository(ctx.db);
	const audit = new AuditService(ctx);
	const insertExpenseRecord = async (input: {
		id?: string;
		projectId?: string | null;
		expenseType: ExpenseType;
		category: string;
		amount: number;
		currency: string;
		date: string;
		vendorOrSupplier?: string | null;
		staffName?: string | null;
		reimbursement?: boolean;
		businessTrip?: boolean;
		destination?: string | null;
		notes?: string | null;
		metadata?: string | null;
		documentRef?: string | null;
		docType?: 'invoice' | 'receipt' | 'po' | null;
		gstAmount?: number | null;
	}) => {
		const now = nowIso();
		const id = input.id ?? crypto.randomUUID();
		const row = {
			id,
			projectId: input.projectId ?? null,
			expenseType: input.expenseType,
			category: input.category,
			docType: input.docType ?? null,
			date: input.date,
			amount: input.amount,
			currency: input.currency,
			sgdEquivalent: await resolveSgdEquivalentForWrite({
				amount: input.amount,
				currency: input.currency,
				dateYmd: input.date
			}),
			gstAmount: input.gstAmount ?? 0,
			vendorOrSupplier: input.vendorOrSupplier ?? null,
			staffName: input.staffName ?? null,
			reimbursement: input.reimbursement ?? false,
			businessTrip: input.businessTrip ?? false,
			destination: input.destination ?? null,
			documentRef: input.documentRef ?? null,
			metadata: input.metadata ?? null,
			notes: input.notes ?? null,
			createdAt: now,
			updatedAt: now
		};

		await ctx.db.insert(expenses).values(row);
		return row;
	};

	const getProjectExpenseSums = async (projectId: string) =>
		expenseRepository.getProjectExpenseSums(projectId);
	const getProjectExpenseDetail = async (projectId: string, expenseId: string) => {
		const expense = await expenseRepository.findProjectExpenseById(projectId, expenseId);
		if (!expense) return null;

		const docMeta = parseDocumentMetadata(expense.metadata);
		const { fileViewUrl, fileDownloadUrl, previewDisplay } = await resolveExpenseFilePreview(
			ctx.db,
			expense.documentRef,
			docMeta
		);

		return { expense, docMeta, fileViewUrl, fileDownloadUrl, previewDisplay };
	};
	const getStandaloneExpenseDetail = async (expenseId: string) => {
		const expense = await expenseRepository.findById(expenseId);
		if (!expense) return null;

		const docMeta = parseDocumentMetadata(expense.metadata);
		const { fileViewUrl, fileDownloadUrl, previewDisplay } = await resolveExpenseFilePreview(
			ctx.db,
			expense.documentRef,
			docMeta
		);

		return { expense, docMeta, fileViewUrl, fileDownloadUrl, previewDisplay };
	};
	const getProjectExpensePage = async (projectId: string, projectName: string) => {
		const expenseRows = await ctx.db
			.select({
				id: expenses.id,
				expenseType: expenses.expenseType,
				category: expenses.category,
				docType: expenses.docType,
				amount: expenses.amount,
				sgdEquivalent: expenses.sgdEquivalent,
				currency: expenses.currency,
				date: expenses.date,
				gstAmount: expenses.gstAmount,
				vendorOrSupplier: expenses.vendorOrSupplier,
				staffName: expenses.staffName,
				reimbursement: expenses.reimbursement,
				businessTrip: expenses.businessTrip,
				destination: expenses.destination,
				documentRef: expenses.documentRef,
				metadata: expenses.metadata,
				notes: expenses.notes,
				createdAt: expenses.createdAt
			})
			.from(expenses)
			.where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
			.orderBy(desc(expenses.date), desc(expenses.createdAt));

		const docIdRefs = [
			...new Set(
				expenseRows
					.map((row) => row.documentRef)
					.filter((ref): ref is string => typeof ref === 'string' && DOCUMENT_ID_RE.test(ref))
			)
		];
		const fileKeyByDocumentId = new Map<string, string>();
		if (docIdRefs.length > 0) {
			const docRows = await ctx.db
				.select({ id: documents.id, fileKey: documents.fileKey })
				.from(documents)
				.where(inArray(documents.id, docIdRefs));
			for (const row of docRows) {
				fileKeyByDocumentId.set(row.id, row.fileKey);
			}
		}

		const pageExpenses = expenseRows.map((row) => {
			const storageKey =
				!row.documentRef || row.documentRef.startsWith('manual://')
					? null
					: DOCUMENT_ID_RE.test(row.documentRef)
						? fileKeyByDocumentId.get(row.documentRef) ?? null
						: row.documentRef;

			return {
				...row,
				projectName,
				hasAttachment: hasExpenseAttachment(row.documentRef),
				statusLabel: buildExpenseStatusLabel({
					documentRef: row.documentRef,
					storageKey,
					metadata: row.metadata
				})
			};
		});

		const employeeDirectory = await listFinanceEmployees(ctx.db);
		const projectBusinessTrips = await ctx.db
			.select({
				id: businessTrips.id,
				destination: businessTrips.destination,
				startDate: businessTrips.startDate,
				endDate: businessTrips.endDate,
				days: businessTrips.days,
				dailyAllowanceRate: businessTrips.dailyAllowanceRate
			})
			.from(businessTrips)
			.where(and(eq(businessTrips.projectId, projectId), isNull(businessTrips.deletedAt)))
			.orderBy(desc(businessTrips.startDate));

		return {
			expenses: pageExpenses,
			employees: employeeDirectory,
			totals: buildExpenseTotals(expenseRows),
			businessTrips: projectBusinessTrips
		};
	};
	const getExpenseListPage = async () => {
		const expenseRows = await ctx.db
			.select({
				id: expenses.id,
				projectId: expenses.projectId,
				expenseType: expenses.expenseType,
				category: expenses.category,
				docType: expenses.docType,
				date: expenses.date,
				amount: expenses.amount,
				currency: expenses.currency,
				sgdEquivalent: expenses.sgdEquivalent,
				gstAmount: expenses.gstAmount,
				vendorOrSupplier: expenses.vendorOrSupplier,
				staffName: expenses.staffName,
				reimbursement: expenses.reimbursement,
				businessTrip: expenses.businessTrip,
				destination: expenses.destination,
				documentRef: expenses.documentRef,
				notes: expenses.notes,
				createdAt: expenses.createdAt
			})
			.from(expenses)
			.where(isNull(expenses.deletedAt))
			.orderBy(desc(expenses.date), desc(expenses.createdAt));

		const projectIds = [
			...new Set(
				expenseRows
					.map((row) => row.projectId)
					.filter((projectId): projectId is string => Boolean(projectId))
			)
		];
		const projectNameById = await listFinanceProjectNames(ctx.db, projectIds);

		const employeeDirectory = await listFinanceEmployees(ctx.db);
		return {
			expenses: expenseRows.map((row) => ({
				...row,
				projectName: row.projectId ? projectNameById.get(row.projectId) ?? null : null,
				hasAttachment: hasExpenseAttachment(row.documentRef)
			})),
			employees: employeeDirectory,
			totals: buildExpenseTotals(expenseRows)
		};
	};
	const getReimbursementsPage = async () => {
		const reimbursements = await ctx.db
			.select({
				id: expenses.id,
				expenseType: expenses.expenseType,
				category: expenses.category,
				amount: expenses.amount,
				sgdEquivalent: expenses.sgdEquivalent,
				currency: expenses.currency,
				date: expenses.date,
				vendorOrSupplier: expenses.vendorOrSupplier,
				staffName: expenses.staffName,
				destination: expenses.destination,
				notes: expenses.notes,
				projectId: expenses.projectId,
				createdAt: expenses.createdAt
			})
			.from(expenses)
			.where(and(eq(expenses.reimbursement, true), isNull(expenses.deletedAt)))
			.orderBy(desc(expenses.date), desc(expenses.createdAt));

		return {
			reimbursements,
			total: reimbursements.reduce(
				(sum, reimbursement) => sum + (reimbursement.sgdEquivalent ?? reimbursement.amount ?? 0),
				0
			)
		};
	};
	const getExpenseUploadPage = async (projectIdParam: string) => ({
		employees: await listFinanceEmployees(ctx.db),
		preselectedProject: projectIdParam
			? await findFinanceProjectLookup(ctx.db, projectIdParam)
			: null
	});
	const listBusinessTrips = async (filters: FinanceBusinessTripFilters = {}) =>
		ctx.db
			.select()
			.from(businessTrips)
			.where(
				and(
					isNull(businessTrips.deletedAt),
					filters.projectId ? eq(businessTrips.projectId, filters.projectId) : undefined,
					filters.employeeId ? eq(businessTrips.employeeId, filters.employeeId) : undefined
				)
			)
			.orderBy(desc(businessTrips.startDate));
	const getCategories = async () => expenseRepository.listCategories();
	const createStandaloneExpense = async (data: FinanceStandaloneExpenseInput) => {
		const currency = data.currency.trim().toUpperCase();
		const row = await insertExpenseRecord({
			projectId: null,
			expenseType: data.expenseType,
			category: data.category,
			amount: data.amount,
			currency,
			date: data.date,
			vendorOrSupplier: data.vendorOrSupplier ?? null,
			staffName: data.staffName ?? null,
			reimbursement: data.reimbursement ?? false,
			businessTrip: data.businessTrip ?? false,
			destination: data.destination ?? null,
			notes: data.notes ?? null
		});

		return { id: row.id as `${string}-${string}-${string}-${string}-${string}` };
	};
	const updateStandaloneExpense = async (
		expenseId: string,
		data: FinanceExpenseMutationInput
	) => {
		const [current] = await ctx.db
			.select({ metadata: expenses.metadata, projectId: expenses.projectId })
			.from(expenses)
			.where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
			.limit(1);

		if (!current) {
			return { ok: false as const, status: 'not_found' as const, message: 'Expense not found.' };
		}
		if (current.projectId) {
			return {
				ok: false as const,
				status: 'linked_project' as const,
				message: 'This expense is linked to a project; open it from the project.'
			};
		}

		const amount = Number.isFinite(data.amount) ? data.amount : 0;
		const currency = data.currency.trim().toUpperCase();
		const metadata = buildDocumentMetadata({
			raw: current.metadata ?? null,
			notes: data.notes || undefined
		});
		const sgdEquivalent = await resolveSgdEquivalentForWrite({
			amount,
			currency,
			dateYmd: data.date
		});

		await ctx.db
			.update(expenses)
			.set({
				expenseType: data.expenseType as 'opex' | 'sales_cost',
				category: data.category,
				amount,
				currency,
				sgdEquivalent,
				date: data.date,
				staffName: data.staffName || null,
				vendorOrSupplier: data.vendorOrSupplier || null,
				metadata,
				notes: data.notes || null,
				updatedAt: nowIso()
			})
			.where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)));

		await audit.writeLog({
			action: 'expense.updated',
			entityType: 'expense',
			entityId: expenseId,
			metadata: {
				category: data.category,
				expenseType: data.expenseType,
				amount,
				currency
			}
		});

		return { ok: true as const };
	};
	const softDeleteStandaloneExpense = async (expenseId: string) => {
		const [row] = await ctx.db
			.select({ projectId: expenses.projectId })
			.from(expenses)
			.where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)))
			.limit(1);

		if (!row) {
			return { ok: false as const, status: 'not_found' as const, message: 'Expense not found.' };
		}
		if (row.projectId) {
			return {
				ok: false as const,
				status: 'linked_project' as const,
				message: 'This expense is linked to a project; delete it from the project.'
			};
		}

		const now = nowIso();
		await ctx.db
			.update(expenses)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(expenses.id, expenseId), isNull(expenses.deletedAt)));

		await audit.writeLog({
			action: 'expense.deleted',
			entityType: 'expense',
			entityId: expenseId
		});

		return { ok: true as const };
	};
	const createExpense = async (data: FinanceProjectExpenseInput) => {
		const currency = (data.currency ?? 'SGD').trim().toUpperCase();
		const row = await insertExpenseRecord({
			projectId: data.projectId ?? null,
			expenseType: data.expenseType,
			category: data.category,
			amount: data.amount,
			currency,
			date: data.date,
			vendorOrSupplier: data.vendorOrSupplier ?? null,
			staffName: data.staffName ?? null,
			reimbursement: data.reimbursement ?? false,
			businessTrip: data.businessTrip ?? false,
			destination: data.destination ?? null,
			notes: data.notes ?? null,
			metadata: data.metadata ?? null,
			documentRef: data.documentRef ?? null,
			docType: data.docType ?? null,
			gstAmount: data.gstAmount ?? null
		});

		await ctx.eventBus.emit(
			createEvent('expense.created', 'expense', {
				expenseId: row.id,
				projectId: data.projectId,
				amount: data.amount,
				expenseType: data.expenseType
			})
		);

		await audit.writeLog({
			action: 'expense.created',
			entityType: 'expense',
			entityId: row.id,
			projectId: data.projectId ?? undefined,
			metadata: {
				amount: data.amount,
				currency: data.currency ?? 'SGD',
				category: data.category,
				expenseType: data.expenseType
			}
		});

		return row;
	};
	const updateProjectExpense = async (
		projectId: string,
		expenseId: string,
		data: FinanceExpenseMutationInput
	) => {
		const [current] = await ctx.db
			.select({ metadata: expenses.metadata })
			.from(expenses)
			.where(and(eq(expenses.id, expenseId), eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
			.limit(1);

		const amount = Number.isFinite(data.amount) ? data.amount : 0;
		const currency = data.currency.trim().toUpperCase();
		const metadata = buildDocumentMetadata({
			raw: current?.metadata ?? null,
			notes: data.notes || undefined
		});
		const sgdEquivalent = await resolveSgdEquivalentForWrite({
			amount,
			currency,
			dateYmd: data.date
		});

		await ctx.db
			.update(expenses)
			.set({
				expenseType: data.expenseType as 'opex' | 'sales_cost',
				category: data.category,
				amount,
				currency,
				sgdEquivalent,
				date: data.date,
				staffName: data.staffName || null,
				vendorOrSupplier: data.vendorOrSupplier || null,
				metadata,
				notes: data.notes || null,
				updatedAt: nowIso()
			})
			.where(and(eq(expenses.id, expenseId), eq(expenses.projectId, projectId), isNull(expenses.deletedAt)));

		await audit.writeLog({
			action: 'expense.updated',
			entityType: 'expense',
			entityId: expenseId,
			projectId,
			metadata: {
				category: data.category,
				expenseType: data.expenseType,
				amount,
				currency
			}
		});
	};
	const softDeleteProjectExpense = async (projectId: string, expenseId: string) => {
		const now = nowIso();
		await ctx.db
			.update(expenses)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(expenses.id, expenseId), eq(expenses.projectId, projectId), isNull(expenses.deletedAt)));

		await audit.writeLog({
			action: 'expense.deleted',
			entityType: 'expense',
			entityId: expenseId,
			projectId
		});
	};
	const createBusinessTripWithAllowance = async (data: FinanceBusinessTripAllowanceInput) => {
		const start = new Date(data.startDate);
		const end = new Date(data.endDate);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		if (days < 1) {
			return { ok: false as const, error: 'End date must be after start date' };
		}

		const employeeName = await findFinanceEmployeeNameById(ctx.db, data.employeeId);
		if (!employeeName && data.requireEmployee) {
			return { ok: false as const, error: 'Employee not found', status: 404 };
		}

		const now = nowIso();
		const tripId = crypto.randomUUID();
		await ctx.db.insert(businessTrips).values({
			id: tripId,
			employeeId: data.employeeId,
			projectId: data.projectId || null,
			destination: data.destination,
			startDate: data.startDate,
			endDate: data.endDate,
			days,
			dailyAllowanceRate: data.dailyAllowanceRate,
			status: 'active',
			notes: data.notes || null,
			createdAt: now,
			updatedAt: now
		});

		const allowanceAmount = days * data.dailyAllowanceRate;
		const expense = await createExpense({
			projectId: data.projectId || null,
			expenseType: 'opex',
			category: 'allowance',
			date: data.startDate,
			amount: allowanceAmount,
			currency: 'SGD',
			vendorOrSupplier: null,
			staffName: employeeName,
			reimbursement: false,
			businessTrip: true,
			destination: data.destination,
			notes: `Travel allowance: ${data.destination} (${days} days @ $${data.dailyAllowanceRate}/day)`,
			metadata: JSON.stringify({
				days,
				daily_rate: data.dailyAllowanceRate,
				date_start: data.startDate,
				date_end: data.endDate
			})
		});

		return { ok: true as const, tripId, expenseId: expense.id, days, allowanceAmount };
	};
	const uploadExpense = async (body: FinanceExpenseUploadBody) => {
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
		const docTypeRaw = body.docType || CATEGORY_DOC_TYPE_MAP[category as ExpenseCategory] || null;
		const docType = docTypeRaw as (typeof EXPENSE_DOC_TYPES)[number] | null;

		if (body.allowance || category === 'allowance') {
			const row = await insertExpenseRecord({
				projectId: normalizedProjectId,
				expenseType: 'opex',
				category: 'allowance',
				amount: body.amount || 0,
				currency: 'SGD',
				date: body.date || nowIso().slice(0, 10),
				staffName: body.staffName ?? null,
				reimbursement: body.reimbursement ?? false,
				businessTrip: true,
				destination: body.destination || null,
				metadata: body.metadata ? JSON.stringify(body.metadata) : null,
				notes: body.notes || null
			});

			return uploadSuccess(
				{ expenseId: row.id, status: 'created', message: 'Allowance expense created' },
				201
			);
		}

		if (!body.key || !body.fileName || !body.fileType) {
			return uploadFailure('Missing required fields: key, fileName, fileType');
		}
		if (!body.idempotencyKey || !String(body.idempotencyKey).trim()) {
			return uploadFailure('idempotencyKey is required for file upload');
		}
		if (docType && !EXPENSE_DOC_TYPES.includes(docType)) {
			return uploadFailure(`Invalid docType. Must be one of: ${EXPENSE_DOC_TYPES.join(', ')}`);
		}

		const exists = await objectExists(ctx.env, body.key);
		if (!exists) {
			return uploadFailure('Uploaded object was not found in R2', 404);
		}

		const amountNum =
			body.amount !== null && body.amount !== undefined && Number.isFinite(Number(body.amount))
				? Number(body.amount)
				: Number.NaN;
		if (!body.date || !String(body.date).trim()) {
			return uploadFailure('date is required for file upload');
		}
		if (!Number.isFinite(amountNum)) {
			return uploadFailure('amount is required for file upload (number)');
		}

		const now = nowIso();
		const documentId = crypto.randomUUID();
		const expenseId = crypto.randomUUID();
		const projectScope = normalizeProjectScope(normalizedProjectId);
		const idempotencyKey = String(body.idempotencyKey).trim();

		const fileTypeCategory = body.fileType.includes('pdf')
			? 'pdf'
			: body.fileType.includes('image')
				? 'image'
				: 'other';

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
			idem = await beginIdempotentRequest(ctx.db, {
				idempotencyKey,
				endpoint: 'POST:/api/expenses/upload',
				userId: ctx.user?.id ?? null,
				projectScope
			});
		} catch (error) {
			if (error instanceof UploadGuardSchemaError) {
				return uploadFailure(
					'Upload dedupe guard is initializing. Please run DB migration and retry.',
					503
				);
			}
			throw error;
		}

		if (idem.state === 'completed') {
			if (idem.responseBody) {
				try {
					return uploadSuccess(JSON.parse(idem.responseBody) as unknown, 200);
				} catch {
					return uploadSuccess({ message: 'Request already processed' }, 200);
				}
			}
			return uploadSuccess({ message: 'Request already processed' }, 200);
		}
		if (idem.state === 'in_progress') {
			return uploadFailure('A request with the same idempotency key is still processing', 409);
		}

		const fileHash = await getObjectSha256(ctx.env, body.key);
		if (!fileHash) {
			await failIdempotentRequest(ctx.db, idempotencyKey, 'Uploaded file missing in storage when hashing');
			return uploadFailure('Uploaded object was not found in R2 during dedupe check', 404);
		}

		let claim: Awaited<ReturnType<typeof claimFileHash>>;
		try {
			claim = await claimFileHash(ctx.db, {
				domain: 'expense',
				projectScope,
				fileHash,
				entityType: 'expense',
				entityId: expenseId,
				createdBy: ctx.user?.id ?? null
			});
		} catch (error) {
			if (error instanceof UploadGuardSchemaError) {
				await failIdempotentRequest(ctx.db, idempotencyKey, error.message);
				return uploadFailure(
					'Upload dedupe guard is initializing. Please run DB migration and retry.',
					503
				);
			}
			throw error;
		}

		if (!claim.ok) {
			await failIdempotentRequest(ctx.db, idempotencyKey, 'Duplicate file hash detected');
			return uploadFailure('Duplicate upload detected: this expense file was already recorded', 409, {
				code: 'DUPLICATE_FILE_UPLOAD',
				existingEntityId: claim.duplicateEntityId
			});
		}

		try {
			await ctx.db.insert(documents).values({
				id: documentId,
				projectId: normalizedProjectId,
				uploadedBy: ctx.user?.id || 'system',
				fileKey: body.key,
				fileName: body.fileName,
				fileType: fileTypeCategory,
				purpose: 'financial',
				docType: docType || 'other',
				ocrStatus: 'done',
				ocrResult: JSON.stringify(ocrResultPayload),
				createdAt: now,
				updatedAt: now
			});
		} catch (error) {
			await releaseFileHashClaim(ctx.db, { domain: 'expense', projectScope, fileHash });
			await failIdempotentRequest(
				ctx.db,
				idempotencyKey,
				error instanceof Error ? error.message : String(error)
			);
			return uploadFailure('Failed to insert documents record', 500, {
				message: error instanceof Error ? error.message : String(error),
				projectId: normalizedProjectId,
				docType,
				purpose: 'financial'
			});
		}

		try {
			await insertExpenseRecord({
				id: expenseId,
				projectId: normalizedProjectId,
				expenseType,
				category,
				docType,
				amount: amountNum,
				currency: (body.currency || 'SGD').trim().toUpperCase(),
				date: String(body.date).trim(),
				vendorOrSupplier: body.vendorOrSupplier?.trim() || null,
				staffName: body.staffName?.trim() || null,
				reimbursement: body.reimbursement ?? false,
				businessTrip: body.businessTrip ?? false,
				destination: body.destination?.trim() || null,
				documentRef: body.key,
				metadata: body.metadata ? JSON.stringify(body.metadata) : null,
				notes: body.notes?.trim() || null,
				gstAmount:
					body.gstAmount !== null && body.gstAmount !== undefined && Number.isFinite(Number(body.gstAmount))
						? Number(body.gstAmount)
						: 0
			});
		} catch (error) {
			await releaseFileHashClaim(ctx.db, { domain: 'expense', projectScope, fileHash });
			await failIdempotentRequest(
				ctx.db,
				idempotencyKey,
				error instanceof Error ? error.message : String(error)
			);
			return uploadFailure('Failed to insert expense record', 500, {
				message: error instanceof Error ? error.message : String(error),
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
		await completeIdempotentRequest(ctx.db, idempotencyKey, JSON.stringify(responseBody));
		return uploadSuccess(responseBody, 201);
	};

	return {
		getExpenseListPage,
		createStandaloneExpense,
		getStandaloneExpenseDetail,
		updateStandaloneExpense,
		softDeleteStandaloneExpense,
		getReimbursementsPage,
		getExpenseUploadPage,
		getProjectExpensePage,
		create: createExpense,
		getProjectExpenseDetail,
		updateProjectExpense,
		softDeleteProjectExpense,
		uploadExpense,
		listBusinessTrips,
		createBusinessTripWithAllowance,
		getProjectExpenseSums,
		getCategories
	};
}

export type FinanceExpensesApi = ReturnType<typeof createFinanceExpenseApi>;
