export type DocumentSourceType = 'manual' | 'upload' | 'ai_prefill';
export type DocumentParseStatus = 'not_parsed' | 'parsed' | 'reviewed';

type UploadEvidence = {
	key: string;
	fileName: string;
	contentType: string;
	size: number;
	uploadedAt: string;
};

export type DocumentMetadata = {
	notes?: string;
	sourceType?: DocumentSourceType;
	parseStatus?: DocumentParseStatus;
	upload?: UploadEvidence;
};

export function parseDocumentMetadata(raw: string | null): DocumentMetadata {
	if (!raw) return {};
	try {
		return (JSON.parse(raw) as DocumentMetadata) ?? {};
	} catch {
		return {};
	}
}

type BuildMetadataInput = {
	raw: string | null;
	notes?: string;
	sourceType?: DocumentSourceType;
	parseStatus?: DocumentParseStatus;
	upload?: UploadEvidence;
};

export function buildDocumentMetadata(input: BuildMetadataInput): string | null {
	const prev = parseDocumentMetadata(input.raw);
	const next: DocumentMetadata = {
		...prev,
		notes: input.notes?.trim() || undefined,
		sourceType: input.sourceType ?? prev.sourceType ?? 'manual',
		parseStatus: input.parseStatus ?? prev.parseStatus ?? 'not_parsed',
		upload: input.upload ?? prev.upload
	};

	if (!next.notes && !next.upload && !next.sourceType && !next.parseStatus) {
		return null;
	}
	return JSON.stringify(next);
}
