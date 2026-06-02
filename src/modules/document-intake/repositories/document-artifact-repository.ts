import { and, desc, eq, gte, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm';
import type { DBClient } from '../../../infrastructure/db';
import type {
	DocumentArtifact,
	DocumentClassificationResult,
	DocumentProcessingStatus,
	DocumentSecurityFlag,
	DocumentSource,
	DocumentSourceMetadata,
	DocumentType,
	OriginalFileMeta,
	SuggestedFieldsResult,
	TextExtractionResult
} from '../schemas/document-artifact.schema';
import { documentArtifacts } from './document-artifact.schema';

export interface CreateDocumentArtifactInput {
	id?: string;
	tenantId: string;
	source: DocumentSource;
	originalFile: OriginalFileMeta;
	sourceMetadata?: DocumentSourceMetadata;
	documentType?: DocumentType;
	processingStatus?: DocumentProcessingStatus;
	textExtraction?: TextExtractionResult;
	classification?: DocumentClassificationResult;
	normalizedMetadata?: Record<string, unknown>;
	securityFlags?: DocumentSecurityFlag[];
}

export interface DocumentArtifactLibraryFilters {
	tenantId: string;
	q?: string;
	statuses?: DocumentProcessingStatus[];
	documentTypes?: DocumentType[];
	sources?: DocumentSource[];
	categoryId?: string;
	createdFrom?: string;
	createdTo?: string;
	limit?: number;
	offset?: number;
}

function nowIso(): string {
	return new Date().toISOString();
}

function toJsonOrNull<T>(value: T | undefined): string | null {
	return value === undefined ? null : JSON.stringify(value);
}

function fromJson<T>(value: string | null): T | undefined {
	if (value === null || value === undefined) return undefined;
	try {
		return JSON.parse(value) as T;
	} catch {
		return undefined;
	}
}

interface DocumentArtifactRow {
	id: string;
	tenantId: string;
	source: DocumentSource;
	processingStatus: DocumentProcessingStatus;
	documentType: DocumentType | null;
	originalFile: string;
	sourceMetadata: string | null;
	textExtraction: string | null;
	classification: string | null;
	suggestedFields: string | null;
	suggestedCategoryId: string | null;
	normalizedMetadata: string | null;
	securityFlags: string | null;
	sizeBytes: number | null;
	createdAt: string;
	updatedAt: string;
}

function rowToArtifact(row: DocumentArtifactRow): DocumentArtifact {
	const originalFile = fromJson<OriginalFileMeta>(row.originalFile);
	if (!originalFile) {
		throw new Error(`Document artifact ${row.id} has invalid originalFile JSON`);
	}
	return {
		id: row.id,
		tenantId: row.tenantId,
		source: row.source,
		processingStatus: row.processingStatus,
		documentType: row.documentType ?? undefined,
		originalFile,
		sourceMetadata: fromJson<DocumentSourceMetadata>(row.sourceMetadata),
		textExtraction: fromJson<TextExtractionResult>(row.textExtraction),
		classification: fromJson<DocumentClassificationResult>(row.classification),
		suggestedFields: fromJson<SuggestedFieldsResult>(row.suggestedFields),
		suggestedCategoryId: row.suggestedCategoryId ?? undefined,
		normalizedMetadata: fromJson<Record<string, unknown>>(row.normalizedMetadata),
		securityFlags: fromJson<DocumentSecurityFlag[]>(row.securityFlags),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	};
}

function searchableTokens(q: string | undefined): string[] {
	return (q ?? '')
		.trim()
		.split(/\s+/)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2)
		.slice(0, 8);
}

function buildLibraryWhere(filters: DocumentArtifactLibraryFilters): SQL | undefined {
	const clauses: SQL[] = [eq(documentArtifacts.tenantId, filters.tenantId)];

	if (filters.statuses?.length) {
		clauses.push(inArray(documentArtifacts.processingStatus, filters.statuses));
	}
	if (filters.documentTypes?.length) {
		clauses.push(inArray(documentArtifacts.documentType, filters.documentTypes));
	}
	if (filters.sources?.length) {
		clauses.push(inArray(documentArtifacts.source, filters.sources));
	}
	if (filters.categoryId?.trim()) {
		clauses.push(eq(documentArtifacts.suggestedCategoryId, filters.categoryId.trim()));
	}
	if (filters.createdFrom) {
		clauses.push(gte(documentArtifacts.createdAt, filters.createdFrom));
	}
	if (filters.createdTo) {
		clauses.push(lte(documentArtifacts.createdAt, filters.createdTo));
	}

	for (const token of searchableTokens(filters.q)) {
		const pattern = `%${token}%`;
		const tokenClause = or(
			like(documentArtifacts.id, pattern),
			like(documentArtifacts.source, pattern),
			like(documentArtifacts.processingStatus, pattern),
			like(documentArtifacts.documentType, pattern),
			like(documentArtifacts.suggestedCategoryId, pattern),
			like(documentArtifacts.originalFile, pattern),
			like(documentArtifacts.sourceMetadata, pattern),
			like(documentArtifacts.textExtraction, pattern),
			like(documentArtifacts.classification, pattern),
			like(documentArtifacts.suggestedFields, pattern),
			like(documentArtifacts.normalizedMetadata, pattern)
		);
		if (tokenClause) clauses.push(tokenClause);
	}

	return and(...clauses);
}

export class DocumentArtifactRepository {
	constructor(private db: DBClient) {}

	async create(input: CreateDocumentArtifactInput): Promise<DocumentArtifact> {
		const id = input.id ?? crypto.randomUUID();
		const now = nowIso();
		const row: DocumentArtifactRow = {
			id,
			tenantId: input.tenantId,
			source: input.source,
			processingStatus: input.processingStatus ?? ('received' as const),
			documentType: input.documentType ?? null,
			originalFile: JSON.stringify(input.originalFile),
			sourceMetadata: toJsonOrNull(input.sourceMetadata),
			textExtraction: toJsonOrNull(input.textExtraction),
			classification: toJsonOrNull(input.classification),
			suggestedFields: null,
			suggestedCategoryId: null,
			normalizedMetadata: toJsonOrNull(input.normalizedMetadata),
			securityFlags: toJsonOrNull(input.securityFlags),
			sizeBytes: input.originalFile.sizeBytes,
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(documentArtifacts).values(row);
		return rowToArtifact(row);
	}

	async findById(id: string, tenantId: string): Promise<DocumentArtifact | null> {
		const rows = await this.db
			.select()
			.from(documentArtifacts)
			.where(and(eq(documentArtifacts.id, id), eq(documentArtifacts.tenantId, tenantId)))
			.limit(1);
		const row = rows[0];
		if (!row) return null;
		return rowToArtifact(row as DocumentArtifactRow);
	}

	async setStatus(id: string, status: DocumentProcessingStatus): Promise<void> {
		await this.db
			.update(documentArtifacts)
			.set({ processingStatus: status, updatedAt: nowIso() })
			.where(eq(documentArtifacts.id, id));
	}

	/**
	 * Set status only if the artifact isn't already `abandoned`. Used by the
	 * async worker so a user-triggered cancel mid-pipeline can't be silently
	 * overwritten by the next stage's setStatus call. Returns true when the
	 * update took effect.
	 */
	async setStatusIfActive(id: string, status: DocumentProcessingStatus): Promise<boolean> {
		await this.db
			.update(documentArtifacts)
			.set({ processingStatus: status, updatedAt: nowIso() })
			.where(
				and(
					eq(documentArtifacts.id, id),
					sql`${documentArtifacts.processingStatus} != 'abandoned'`
				)
			);
		const rows = await this.db
			.select({ status: documentArtifacts.processingStatus })
			.from(documentArtifacts)
			.where(eq(documentArtifacts.id, id))
			.limit(1);
		return rows[0]?.status === status;
	}

	async abandon(
		id: string,
		metadata: Record<string, unknown>
	): Promise<void> {
		await this.db
			.update(documentArtifacts)
			.set({
				processingStatus: 'abandoned',
				normalizedMetadata: JSON.stringify(metadata),
				updatedAt: nowIso()
			})
			.where(eq(documentArtifacts.id, id));
	}

	async setTextExtraction(id: string, result: TextExtractionResult): Promise<void> {
		await this.db
			.update(documentArtifacts)
			.set({ textExtraction: JSON.stringify(result), updatedAt: nowIso() })
			.where(eq(documentArtifacts.id, id));
	}

	async setClassification(id: string, result: DocumentClassificationResult): Promise<void> {
		await this.db
			.update(documentArtifacts)
			.set({
				classification: JSON.stringify(result),
				documentType: result.documentType,
				updatedAt: nowIso()
			})
			.where(eq(documentArtifacts.id, id));
	}

	async addSecurityFlag(id: string, flag: DocumentSecurityFlag): Promise<void> {
		const rows = await this.db
			.select({ securityFlags: documentArtifacts.securityFlags })
			.from(documentArtifacts)
			.where(eq(documentArtifacts.id, id))
			.limit(1);
		const current = fromJson<DocumentSecurityFlag[]>(rows[0]?.securityFlags ?? null) ?? [];
		if (current.includes(flag)) return;
		const next = [...current, flag];
		await this.db
			.update(documentArtifacts)
			.set({ securityFlags: JSON.stringify(next), updatedAt: nowIso() })
			.where(eq(documentArtifacts.id, id));
	}

	async update(
		id: string,
		patch: Partial<{
			processingStatus: DocumentProcessingStatus;
			documentType: DocumentType;
			textExtraction: TextExtractionResult;
			classification: DocumentClassificationResult;
			suggestedFields: SuggestedFieldsResult | null;
			suggestedCategoryId: string | null;
			normalizedMetadata: Record<string, unknown>;
			securityFlags: DocumentSecurityFlag[];
		}>
	): Promise<void> {
		const update: Record<string, unknown> = { updatedAt: nowIso() };
		if (patch.processingStatus !== undefined) update.processingStatus = patch.processingStatus;
		if (patch.documentType !== undefined) update.documentType = patch.documentType;
		if (patch.textExtraction !== undefined)
			update.textExtraction = JSON.stringify(patch.textExtraction);
		if (patch.classification !== undefined) {
			update.classification = JSON.stringify(patch.classification);
			update.documentType = patch.classification.documentType;
		}
		if (patch.suggestedFields !== undefined)
			update.suggestedFields = patch.suggestedFields === null
				? null
				: JSON.stringify(patch.suggestedFields);
		if (patch.suggestedCategoryId !== undefined)
			update.suggestedCategoryId = patch.suggestedCategoryId;
		if (patch.normalizedMetadata !== undefined)
			update.normalizedMetadata = JSON.stringify(patch.normalizedMetadata);
		if (patch.securityFlags !== undefined)
			update.securityFlags = JSON.stringify(patch.securityFlags);
		await this.db.update(documentArtifacts).set(update).where(eq(documentArtifacts.id, id));
	}

	async setSuggestedFields(
		id: string,
		fields: SuggestedFieldsResult,
		categoryId: string
	): Promise<void> {
		await this.db
			.update(documentArtifacts)
			.set({
				suggestedFields: JSON.stringify(fields),
				suggestedCategoryId: categoryId,
				updatedAt: nowIso()
			})
			.where(eq(documentArtifacts.id, id));
	}

	async clearSuggestedFields(id: string): Promise<void> {
		await this.db
			.update(documentArtifacts)
			.set({
				suggestedFields: null,
				suggestedCategoryId: null,
				updatedAt: nowIso()
			})
			.where(eq(documentArtifacts.id, id));
	}

	/**
	 * List artifacts for the inbox, filtered by status. Used by /finance/inbox
	 * page and AI Panel inbox layer (Ship 2). Excludes soft-deleted (none yet
	 * since artifact has no deletedAt — left as future Ship 3 work).
	 */
	async listByStatuses(
		tenantId: string,
		statuses: DocumentProcessingStatus[],
		opts: { limit?: number; offset?: number } = {}
	): Promise<DocumentArtifact[]> {
		const limit = opts.limit ?? 100;
		const offset = opts.offset ?? 0;
		const rows = await this.db
			.select()
			.from(documentArtifacts)
			.where(
				and(
					eq(documentArtifacts.tenantId, tenantId),
					inArray(documentArtifacts.processingStatus, statuses)
				)
			)
			.orderBy(desc(documentArtifacts.createdAt))
			.limit(limit)
			.offset(offset);
		return rows.map((row) => rowToArtifact(row as DocumentArtifactRow));
	}

	async countByStatuses(
		tenantId: string,
		statuses: DocumentProcessingStatus[]
	): Promise<number> {
		const rows = await this.db
			.select({ n: sql<number>`count(*)` })
			.from(documentArtifacts)
			.where(
				and(
					eq(documentArtifacts.tenantId, tenantId),
					inArray(documentArtifacts.processingStatus, statuses)
				)
			);
		return Number(rows[0]?.n ?? 0);
	}

	async listLibrary(
		filters: DocumentArtifactLibraryFilters
	): Promise<DocumentArtifact[]> {
		const limit = Math.min(Math.max(filters.limit ?? 10, 1), 50);
		const offset = Math.max(filters.offset ?? 0, 0);
		const rows = await this.db
			.select()
			.from(documentArtifacts)
			.where(buildLibraryWhere(filters))
			.orderBy(desc(documentArtifacts.createdAt))
			.limit(limit)
			.offset(offset);
		return rows.map((row) => rowToArtifact(row as DocumentArtifactRow));
	}

	async countLibrary(filters: DocumentArtifactLibraryFilters): Promise<number> {
		const rows = await this.db
			.select({ n: sql<number>`count(*)` })
			.from(documentArtifacts)
			.where(buildLibraryWhere(filters));
		return Number(rows[0]?.n ?? 0);
	}
}
