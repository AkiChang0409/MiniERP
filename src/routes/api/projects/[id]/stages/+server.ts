import type { RequestHandler } from './$types';
import { createModuleContext } from '$platform/modules';
import { NotFoundError } from '$platform/modules/errors';
import {
	ProjectTaskService,
	ProjectPermissionError
} from '$modules/project';
import { fail, ok } from '$platform/http';

/**
 * GET  /api/projects/[id]/stages
 * PUT  /api/projects/[id]/stages   body: { stages: [{ id?, name, kind?, conditionExpression?, planStart?, planEnd?, color? }] }
 * POST /api/projects/[id]/stages/advance — runs the auto-advance check
 *
 * Epic 3 — workflow stages. PUT submits the full ordered list; the service
 * upserts by id (stages keep their identity, task links, and progress across
 * edits) and soft-deletes only the ones dropped from the list.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const stages = await svc.listStages(event.params.id);
		return ok({ stages });
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const PUT: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const svc = new ProjectTaskService(ctx);
		const body = (await event.request.json()) as {
			stages?: Array<{
				id?: string;
				name: string;
				kind?: 'task_group' | 'approval' | 'budget_gate' | 'manual';
				conditionExpression?: string | null;
				planStart?: string | null;
				planEnd?: string | null;
				color?: string | null;
			}>;
		};
		const stages = body.stages ?? [];
		if (stages.some((s) => !s.name || !s.name.trim())) {
			return fail('Each stage needs a name.', 400);
		}
		await svc.setStages(event.params.id, stages);
		return ok({ updated: true, count: stages.length });
	} catch (e) {
		if (e instanceof ProjectPermissionError) return fail(e.message, 403);
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};
