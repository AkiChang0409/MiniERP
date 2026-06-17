import type { ModuleContext } from '$platform/modules/types';
import { AuditService } from '$platform/audit/audit-service';

/**
 * Task lifecycle → platform audit trail.
 *
 * The project task line is a DAG, not a platform `WorkflowDefinition` (single
 * KV-persisted `step` pointer driven by AI capabilities). It must NOT be forced
 * into the workflow engine — but it SHOULD adopt the engine's governance idea:
 * every state transition is recorded in the hash-chained, append-only audit log
 * (the same backbone `appendAgentAuditEntry` gives AI workflows).
 *
 * Because the project activity feed reads `audit_logs WHERE projectId = …`
 * (`project-query-service.ts:349`), writing these entries makes every
 * submit / approve / reject / block show up on the project timeline — which is
 * exactly the traceability ISO 9001 wants ("who did what, when").
 *
 * Audit must never break a business transition, so failures are swallowed.
 */
export async function writeTaskAudit(
	ctx: ModuleContext,
	args: {
		projectId: string;
		taskId: string;
		action: string;
		from: string;
		to: string;
		taskName?: string | null;
		reason?: string | null;
	}
): Promise<void> {
	if (args.from === args.to) return;
	try {
		await new AuditService(ctx).writeLog({
			action: args.action,
			entityType: 'project_task',
			entityId: args.taskId,
			projectId: args.projectId,
			module: 'project',
			actionType: 'update',
			oldValue: { status: args.from },
			newValue: { status: args.to },
			metadata: {
				from: args.from,
				to: args.to,
				taskName: args.taskName ?? null,
				reason: args.reason ?? null
			}
		});
	} catch {
		/* never let auditing break the transition */
	}
}
