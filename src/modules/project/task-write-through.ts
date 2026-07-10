/**
 * Project task → Lark Bitable write path (B4).
 *
 * Because projects/tasks live in the Lark Base (source of truth) while the D1
 * `project_tasks` engine only holds D1-native projects, the governed AI task
 * writes are **Bitable-first**: the task is created/updated in the Bitable Tasks
 * table (linked to the Bitable Projects record), recorded in
 * `lark_write_operations`, and mirrored into D1 `bitable_records`. The legacy D1
 * `project_tasks` row is a best-effort side write (only succeeds for D1-native
 * projects); it never blocks the Bitable write.
 *
 * The 3-phase pattern (Bitable → audit → mirror) matches sales-crm's customer
 * write-through. Never throws for a Lark/API error — failures are logged and
 * returned so the caller can surface a useful message.
 */
import type { ModuleContext } from '$platform/modules/types';
import {
	bitableCreateRecord,
	bitableUpdateRecord,
	type BitableRecord
} from '$platform/integrations/lark/bitable';
import { readBitableRecords, bitableText } from '$platform/integrations/lark/bitable-read';
import { recordLarkWriteOperation } from '$platform/integrations/lark/bitable-write-log';
import { upsertBitableMirrorRecord } from '$platform/integrations/lark/bitable-sync';
import { createProjectApi } from './api';
import { resolveTaskFields, encodeTaskFields, type TaskWriteValues } from './lark-contracts';

const TASKS_TABLE_NAME = 'Tasks';
const DEFAULT_TASKS_TABLE_ID = 'tblW3ug6R6JTDPvd';
const DEFAULT_PROJECTS_TABLE_ID = 'tblQzG5SD2URlzs6';

interface WriteThroughConfig {
	appToken: string;
	tableId: string;
	projectsTableId: string;
}

/** Resolve Base app_token + table ids from env; null → write-through disabled. */
function resolveConfig(env: Env | undefined): WriteThroughConfig | null {
	const appToken = env?.LARK_BITABLE_APP_TOKEN;
	if (!appToken) return null;
	return {
		appToken,
		tableId: env?.LARK_TASK_TABLE_ID ?? DEFAULT_TASKS_TABLE_ID,
		projectsTableId: env?.LARK_PROJECT_TABLE_ID ?? DEFAULT_PROJECTS_TABLE_ID
	};
}

/** Lark Bitable record ids start with `rec`. */
function isBitableRecordId(value: string): boolean {
	return /^rec[A-Za-z0-9]+$/.test(value);
}

/**
 * Resolve the Bitable Projects record id for a project reference. If the
 * reference already is a Bitable record id (the AI read it from the mirror via
 * `project.list-projects`), use it directly; otherwise treat it as a D1 project
 * id and match the project's name against the projects mirror. undefined → the
 * task is still written, just without the project link.
 */
async function resolveProjectRecordId(
	mc: ModuleContext,
	cfg: WriteThroughConfig,
	projectRef: string
): Promise<string | undefined> {
	if (isBitableRecordId(projectRef)) return projectRef;

	let projectName: string | null = null;
	try {
		const project = await createProjectApi(mc).getById(projectRef);
		projectName = project?.name ?? null;
	} catch {
		return undefined;
	}
	if (!projectName) return undefined;

	const target = projectName.trim().toLowerCase();
	const records = await readBitableRecords(mc.db, cfg.projectsTableId);
	for (const record of records) {
		for (const value of Object.values(record.fields)) {
			const text = bitableText(value);
			if (text && text.trim().toLowerCase() === target) return record.recordId;
		}
	}
	return undefined;
}

async function logOperation(
	mc: ModuleContext,
	cfg: WriteThroughConfig,
	args: {
		recordId?: string | null;
		operation: string;
		status: 'success' | 'failed';
		sourceAction: string;
		payload: unknown;
		result?: unknown;
		error?: unknown;
		actorUserId?: string | null;
	}
): Promise<void> {
	try {
		await recordLarkWriteOperation(mc.db, {
			appToken: cfg.appToken,
			tableId: cfg.tableId,
			tableName: TASKS_TABLE_NAME,
			recordId: args.recordId ?? null,
			operation: args.operation,
			status: args.status,
			payload: args.payload,
			result: args.result,
			error: args.error ? (args.error instanceof Error ? args.error.message : String(args.error)) : null,
			sourceModule: 'project',
			sourceAction: args.sourceAction,
			actorUserId: args.actorUserId ?? null
		});
	} catch {
		/* logging is best-effort too — never throw from the write path */
	}
}

async function mirror(mc: ModuleContext, cfg: WriteThroughConfig, record: BitableRecord): Promise<void> {
	await upsertBitableMirrorRecord(mc.db, {
		appToken: cfg.appToken,
		tableId: cfg.tableId,
		tableName: TASKS_TABLE_NAME,
		record
	});
}

export interface WriteTaskArgs {
	/** Bitable Tasks record id to update; omit to create a new record. */
	recordId?: string | null;
	/** Bitable project record id OR a D1 project id (resolved to the record). */
	projectRef: string;
	values: TaskWriteValues;
	actorUserId?: string | null;
}

export interface WriteTaskResult {
	recordId: string | null;
	error?: string;
}

/**
 * Create or update a task in the Bitable Tasks table (source of truth). Returns
 * the Bitable record id (the AI task's identity). Best-effort: on a Lark error
 * it logs + returns `{ recordId: existing ?? null, error }` instead of throwing.
 */
export async function writeTaskToBitable(mc: ModuleContext, args: WriteTaskArgs): Promise<WriteTaskResult> {
	const cfg = resolveConfig(mc.env);
	if (!cfg) return { recordId: args.recordId ?? null, error: 'bitable_not_configured' };

	let fields: Record<string, unknown>;
	try {
		const resolved = await resolveTaskFields(mc.env, cfg.appToken, cfg.tableId);
		const projectRecordId = await resolveProjectRecordId(mc, cfg, args.projectRef);
		fields = encodeTaskFields(resolved, args.values, projectRecordId);
	} catch (error) {
		await logOperation(mc, cfg, {
			recordId: args.recordId ?? null,
			operation: 'encode',
			status: 'failed',
			sourceAction: 'writeTaskToBitable',
			payload: { projectRef: args.projectRef, values: args.values },
			error,
			actorUserId: args.actorUserId
		});
		return { recordId: args.recordId ?? null, error: error instanceof Error ? error.message : String(error) };
	}

	if (Object.keys(fields).length === 0) {
		return { recordId: args.recordId ?? null, error: 'no_mappable_fields' };
	}

	try {
		if (args.recordId) {
			const record = await bitableUpdateRecord(mc.env, {
				appToken: cfg.appToken,
				tableId: cfg.tableId,
				recordId: args.recordId,
				fields
			});
			await logOperation(mc, cfg, {
				recordId: record.record_id,
				operation: 'update_record',
				status: 'success',
				sourceAction: 'updateTask',
				payload: { fields },
				result: record,
				actorUserId: args.actorUserId
			});
			await mirror(mc, cfg, record);
			return { recordId: record.record_id };
		}

		const record = await bitableCreateRecord(mc.env, {
			appToken: cfg.appToken,
			tableId: cfg.tableId,
			fields
		});
		await logOperation(mc, cfg, {
			recordId: record.record_id,
			operation: 'create_record',
			status: 'success',
			sourceAction: 'createTask',
			payload: { fields },
			result: record,
			actorUserId: args.actorUserId
		});
		await mirror(mc, cfg, record);
		return { recordId: record.record_id };
	} catch (error) {
		await logOperation(mc, cfg, {
			recordId: args.recordId ?? null,
			operation: args.recordId ? 'update_record' : 'create_record',
			status: 'failed',
			sourceAction: args.recordId ? 'updateTask' : 'createTask',
			payload: { fields },
			error,
			actorUserId: args.actorUserId
		});
		return { recordId: args.recordId ?? null, error: error instanceof Error ? error.message : String(error) };
	}
}
