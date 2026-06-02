import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const q = event.url.searchParams.get('q') ?? undefined;
		const status = event.url.searchParams.get('status') ?? undefined;
		const scope = event.url.searchParams.get('scope'); // "mine" | "all"

		if (scope === 'mine' && ctx.user) {
			const projects = await project.list({
				q,
				status,
				participantUserId: ctx.user.id
			});
			return ok(projects);
		}

		const projects = await project.list({ q, status });
		return ok(projects);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const body = (await event.request.json()) as {
			businessPartnerId?: string;
			customerId?: string;
			parentProjectId?: string | null;
			ownerId?: string | null;
			name?: string;
			status?: string;
			description?: string;
			notes?: string;
			startDate?: string;
			endDate?: string;
			deadline?: string;
			priority?: number;
			attachmentUrl?: string | null;
			attachmentName?: string | null;
			recurrenceFrequency?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
			recurrenceInterval?: number | null;
			collaborators?: Array<{ userId: string; role?: string | null }>;
		};

		const businessPartnerId = body.businessPartnerId ?? body.customerId;
		if (!body.name) {
			return fail('Missing required fields: name', 400);
		}

		const result = await project.create({
			businessPartnerId,
			parentProjectId: body.parentProjectId ?? null,
			ownerId: body.ownerId ?? null,
			name: body.name,
			status: body.status,
			description: body.description,
			notes: body.notes,
			startDate: body.startDate,
			endDate: body.endDate,
			deadline: body.deadline,
			priority: body.priority,
			attachmentUrl: body.attachmentUrl ?? null,
			attachmentName: body.attachmentName ?? null,
			recurrenceFrequency: body.recurrenceFrequency ?? null,
			recurrenceInterval: body.recurrenceInterval ?? null,
			collaborators: body.collaborators
		});

		return ok({ id: result.id }, 201);
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) {
			return fail(e.message, 403);
		}
		return fail((e as Error).message, 500);
	}
};
