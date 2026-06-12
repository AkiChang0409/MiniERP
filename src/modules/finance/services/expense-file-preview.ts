import { eq } from 'drizzle-orm';

import type { DocumentMetadata } from '$modules/finance/domain/document-metadata';
import { inferFileInlinePreviewKind, type FileInlinePreviewKind } from '$platform/files/file-inline-preview';
import { r2FileUrls } from '$platform/files/r2-file-urls';
import { schema, type DBClient } from '../../../infrastructure/db';

export const EXPENSE_DOCUMENT_ID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function computePreviewDisplay(
	fileViewUrl: string | null,
	docMeta: DocumentMetadata,
	documentsFileType: string | null,
	attachmentFileName: string | null,
	storageKey: string | null
): FileInlinePreviewKind {
	return inferFileInlinePreviewKind({
		fileViewUrl,
		fileNameHint: docMeta.upload?.fileName ?? attachmentFileName,
		storageKey,
		contentType: docMeta.upload?.contentType,
		documentsFileType
	});
}

export async function resolveExpenseFilePreview(
	db: DBClient,
	documentRef: string | null | undefined,
	docMeta: DocumentMetadata
): Promise<{
	fileViewUrl: string | null;
	fileDownloadUrl: string | null;
	previewDisplay: FileInlinePreviewKind;
}> {
	let storageKey: string | null = null;
	let documentsFileType: string | null = null;
	let attachmentFileName: string | null = null;

	const ref = documentRef;
	if (ref && !ref.startsWith('manual://')) {
		if (EXPENSE_DOCUMENT_ID_RE.test(ref)) {
			const [doc] = await db
				.select({
					fileKey: schema.documents.fileKey,
					fileName: schema.documents.fileName,
					fileType: schema.documents.fileType
				})
				.from(schema.documents)
				.where(eq(schema.documents.id, ref))
				.limit(1);
			storageKey = doc?.fileKey ?? null;
			attachmentFileName = doc?.fileName ?? null;
			documentsFileType = doc?.fileType ?? null;
		} else {
			storageKey = ref;
			const [doc] = await db
				.select({
					fileName: schema.documents.fileName,
					fileType: schema.documents.fileType
				})
				.from(schema.documents)
				.where(eq(schema.documents.fileKey, ref))
				.limit(1);
			attachmentFileName = doc?.fileName ?? null;
			documentsFileType = doc?.fileType ?? null;
		}
	}

	const { fileViewUrl, fileDownloadUrl } = r2FileUrls(storageKey);
	const previewDisplay = computePreviewDisplay(
		fileViewUrl,
		docMeta,
		documentsFileType,
		attachmentFileName,
		storageKey
	);

	return { fileViewUrl, fileDownloadUrl, previewDisplay };
}
