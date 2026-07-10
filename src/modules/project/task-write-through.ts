/**
 * Project task → Lark Bitable write-through (B4, the write-through template).
 *
 * After a governed task write commits to D1, this mirrors it to the Bitable
 * "Tasks" table (source of truth), records the operation in
 * `lark_write_operations`, and upserts the D1 read mirror — the same 3-phase
 * pattern sales-crm uses for customers. Design choice: tasks stay D1-primary
 * (the scheduling/gantt/dependency engine is D1-native), and we DUAL-WRITE
 * through to Bitable so the Base stays the shared source of truth.
 *
 * Best-effort by contract: the D1 write already succeeded, so any Bitable/Lark
 * failure here is caught, logged (`status:'failed'`), and swallowed — it never
 * breaks the user's task operation. When write-through is not configured
 * (no app token), it is a no-op.
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
function resolveConfig(env: Env): WriteThroughConfig | null {
	const appToken = env.LARK_BITABLE_APP_TOKEN;
	if (!appToken) return null;
	return {
		appToken,
		tableId: env.LARK_TASK_TABLE_ID ?? DEFAULT_TASKS_TABLE_ID,
		projectsTableId: env.LARK_PROJECT_TABLE_ID ?? DEFAULT_PROJECTS_TABLE_ID
	};
}

/**
 * Map a D1 projectId to its Bitable Projects record id by matching the project's
 * name against the projects mirror. Best-effort: returns undefined when unknown
 * (the task is still written, just without the project link).
 */
async function resolveProjectRecordId(
	mc: ModuleContext,
	cfg: WriteThroughConfig,
	projectId: string
): Promise<string | undefined> {
	let projectName: string | null = null;
	try {
		const project = await createProjectApi(mc).getById(projectId);
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

async function logFailure(
	mc: ModuleContext,
	cfg: WriteThroughConfig,
	args: { recordId?: string | null; operation: string; sourceAction: string; payload: unknown; error: unknown; actorUserId?: string | null }
): Promise<void> {
	try {
		await recordLarkWriteOperation(mc.db, {
			appToken: cfg.appToken,
			tableId: cfg.tableId,
			tableName: TASKS_TABLE_NAME,
			recordId: args.recordId ?? null,
			operation: args.operation,
			status: 'failed',
			payload: args.payload,
			error: args.error instanceof Error ? args.error.message : String(args.error),
			sourceModule: 'project',
			sourceAction: args.sourceAction,
			actorUserId: args.actorUserId ?? null
		});
	} catch {
		/* logging is best-effort too — never throw from the write-through */
	}
}

async function persistSuccess(
	mc: ModuleContext,
	cfg: WriteThroughConfig,
	args: { record: BitableRecord; operation: string; sourceAction: string; payload: unknown; actorUserId?: string | null }
): Promise<void> {
	await recordLarkWriteOperation(mc.db, {
		appToken: cfg.appToken,
		tableId: cfg.tableId,
		tableName: TASKS_TABLE_NAME,
		recordId: args.record.record_id,
		operation: args.operation,
		status: 'success',
		payload: args.payload,
		result: args.record,
		sourceModule: 'project',
		sourceAction: args.sourceAction,
		actorUserId: args.actorUserId ?? null
	});
	await upsertBitableMirrorRecord(mc.db, {
		appToken: cfg.appToken,
		tableId: cfg.tableId,
		tableName: TASKS_TABLE_NAME,
		record: args.record
	});
}

export interface SyncTaskArgs {
	taskId: string;
	projectId: string;
	values: TaskWriteValues;
	actorUserId?: string | null;
}

/**
 * Write a task through to Bitable. Creates the linked record on first write
 * (persisting its id back to D1) and updates the same record thereafter.
 * Never throws — see file header.
 */
export async function syncTaskToBitable(mc: ModuleContext, args: SyncTaskArgs): Promise<void> {
	const cfg = resolveConfig(mc.env);
	if (!cfg) return;

	try {
		const resolved = await resolveTaskFields(mc.env, cfg.appToken, cfg.tableId);
		const projectRecordId = await resolveProjectRecordId(mc, cfg, args.projectId);
		const fields = encodeTaskFields(resolved, args.values, projectRecordId);
		if (Object.keys(fields).length === 0) return; // nothing mappable to write

		const api = createProjectApi(mc);
		const existingRecordId = await api.getTaskBitableRecordId(args.projectId, args.taskId);

		if (existingRecordId) {
			try {
				const record = await bitableUpdateRecord(mc.env, {
					appToken: cfg.appToken,
					tableId: cfg.tableId,
					recordId: existingRecordId,
					fields
				});
				await persistSuccess(mc, cfg, {
					record,
					operation: 'update_record',
					sourceAction: 'updateTask',
					payload: { fields },
					actorUserId: args.actorUserId
				});
			} catch (error) {
				await logFailure(mc, cfg, {
					recordId: existingRecordId,
					operation: 'update_record',
					sourceAction: 'updateTask',
					payload: { fields },
					error,
					actorUserId: args.actorUserId
				});
			}
			return;
		}

		try {
			const record = await bitableCreateRecord(mc.env, {
				appToken: cfg.appToken,
				tableId: cfg.tableId,
				fields
			});
			await api.setTaskBitableRecordId(args.taskId, record.record_id);
			await persistSuccess(mc, cfg, {
				record,
				operation: 'create_record',
				sourceAction: 'createTask',
				payload: { fields },
				actorUserId: args.actorUserId
			});
		} catch (error) {
			await logFailure(mc, cfg, {
				operation: 'create_record',
				sourceAction: 'createTask',
				payload: { fields },
				error,
				actorUserId: args.actorUserId
			});
		}
	} catch (error) {
		// Resolution / project-link / field-fetch failure — log once, swallow.
		await logFailure(mc, cfg, {
			operation: 'write_through',
			sourceAction: 'syncTaskToBitable',
			payload: { taskId: args.taskId, projectId: args.projectId },
			error,
			actorUserId: args.actorUserId
		});
	}
}
