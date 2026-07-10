import type { DBClient } from '$infrastructure/db';
import { larkWriteOperations } from './bitable-mirror.schema';

export type LarkWriteOperationStatus = 'success' | 'failed';

export interface RecordLarkWriteOperationInput {
	id?: string;
	appToken: string;
	tableId: string;
	tableName: string;
	recordId?: string | null;
	operation: string;
	status: LarkWriteOperationStatus;
	payload?: unknown;
	result?: unknown;
	error?: string | null;
	sourceModule?: string;
	sourceAction?: string;
	actorUserId?: string | null;
	createdAt?: string;
}

function stringifyJson(value: unknown): string {
	if (value === undefined) return '{}';
	try {
		return JSON.stringify(value ?? {});
	} catch {
		return JSON.stringify({ unserializable: true });
	}
}

export async function recordLarkWriteOperation(
	db: DBClient,
	input: RecordLarkWriteOperationInput
): Promise<string> {
	const id = input.id ?? crypto.randomUUID();
	await db.insert(larkWriteOperations).values({
		id,
		appToken: input.appToken,
		tableId: input.tableId,
		tableName: input.tableName,
		recordId: input.recordId ?? null,
		operation: input.operation,
		status: input.status,
		payload: stringifyJson(input.payload),
		result: stringifyJson(input.result),
		error: input.error ?? null,
		sourceModule: input.sourceModule ?? '',
		sourceAction: input.sourceAction ?? '',
		actorUserId: input.actorUserId ?? null,
		createdAt: input.createdAt ?? new Date().toISOString()
	});
	return id;
}
