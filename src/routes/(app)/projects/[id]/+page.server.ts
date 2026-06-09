import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { createCoreApi } from '$platform/core';
import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { createFinanceApi } from '$modules/finance';

export const load: PageServerLoad = async (event) => {
	const { params, platform, parent } = event;
	await parent();
	if (!platform) {
		throw error(500, 'Cloudflare platform bindings are required');
	}

	const ctx = await createModuleContext(event);
	const { insights } = createFinanceApi(ctx);
	const project = createProjectApi(ctx);

	const [financialDetail, collaborators, comments, scope, subProjects] = await Promise.all([
		insights.getProjectFinancialDetail(params.id),
		project.listCollaborators(params.id),
		project.listComments(params.id),
		project.getEditableScope(params.id),
		project.getSubProjects(params.id)
	]);

	const canEditCrucial = scope === 'owner' || scope === 'manager';
	const canEdit = scope !== 'none';

	// `attachments` already comes through from +layout.server.ts via SvelteKit
	// parent-data merging — no need to refetch here.
	return {
		...financialDetail,
		collaborators,
		comments,
		subProjects,
		scope,
		canEdit,
		canEditCrucial
	};
};

export const actions: Actions = {
	update: async (event) => {
		const { params, request, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}

		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const status = String(form.get('status') ?? '');
		const startDate = String(form.get('startDate') ?? '');
		const endDate = String(form.get('endDate') ?? '');
		const deadline = String(form.get('deadline') ?? '');
		const description = String(form.get('description') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const priorityRaw = String(form.get('priority') ?? '');
		const recurrenceFrequency = String(form.get('recurrenceFrequency') ?? '').trim();
		const recurrenceIntervalRaw = String(form.get('recurrenceInterval') ?? '').trim();
		const ownerId = String(form.get('ownerId') ?? '');
		const attachmentUrl = String(form.get('attachmentUrl') ?? '').trim();
		const attachmentName = String(form.get('attachmentName') ?? '').trim();

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const updates: Record<string, unknown> = {};
		if (form.has('name')) updates.name = name;
		if (form.has('status')) updates.status = status || 'unassigned';
		if (form.has('startDate')) updates.startDate = startDate || null;
		if (form.has('endDate')) updates.endDate = endDate || null;
		if (form.has('deadline')) updates.deadline = deadline || null;
		if (form.has('description')) updates.description = description || null;
		if (form.has('notes')) updates.notes = notes || null;
		if (form.has('priority')) {
			const p = Number.parseInt(priorityRaw, 10);
			if (Number.isFinite(p)) updates.priority = Math.min(10, Math.max(1, p));
		}
		if (form.has('recurrenceFrequency')) {
			updates.recurrenceFrequency =
				recurrenceFrequency === 'daily' ||
				recurrenceFrequency === 'weekly' ||
				recurrenceFrequency === 'monthly' ||
				recurrenceFrequency === 'custom'
					? recurrenceFrequency
					: null;
		}
		if (form.has('recurrenceInterval')) {
			updates.recurrenceInterval = recurrenceIntervalRaw
				? Number.parseInt(recurrenceIntervalRaw, 10)
				: null;
		}
		if (form.has('ownerId')) updates.ownerId = ownerId || null;
		if (form.has('attachmentUrl')) updates.attachmentUrl = attachmentUrl || null;
		if (form.has('attachmentName')) updates.attachmentName = attachmentName || null;

		try {
			await project.update(params.id, updates);
		} catch (e) {
			if (e instanceof ProjectValidationError) {
				return fail(400, {
					message: Object.values(e.fields).join(' ') || e.message,
					fieldErrors: e.fields
				});
			}
			if (e instanceof ProjectPermissionError) {
				return fail(403, { message: e.message });
			}
			throw e;
		}

		await createCoreApi(ctx).writeAuditLog({
			action: 'project.update',
			entityType: 'project',
			entityId: params.id,
			projectId: params.id,
			module: 'project',
			actionType: 'update',
			metadata: { name: typeof updates.name === 'string' ? updates.name : undefined }
		});

		return { ok: true };
	},

	archive: async (event) => {
		const { params, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		await project.update(params.id, { status: 'archived' });

		await createCoreApi(ctx).writeAuditLog({
			action: 'project.archive',
			entityType: 'project',
			entityId: params.id,
			projectId: params.id,
			module: 'project',
			actionType: 'update'
		});

		return { ok: true };
	},

	remove: async (event) => {
		const { params, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}

		const now = new Date().toISOString();
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		await project.update(params.id, { deletedAt: now });

		await createCoreApi(ctx).writeAuditLog({
			action: 'project.remove',
			entityType: 'project',
			entityId: params.id,
			projectId: params.id,
			module: 'project',
			actionType: 'delete'
		});

		throw redirect(303, '/projects');
	},

	comment: async (event) => {
		const { params, request, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}
		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { message: 'Comment body is required.' });

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		try {
			await project.addComment({ projectId: params.id, body });
			return { ok: true };
		} catch (e) {
			if (e instanceof ProjectPermissionError) return fail(403, { message: e.message });
			throw e;
		}
	},

	addCollaborator: async (event) => {
		const { params, request, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const role = String(form.get('role') ?? '').trim() || null;
		if (!email) return fail(400, { message: 'Email is required.' });

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const scope = await project.getEditableScope(params.id);
		if (scope !== 'owner' && scope !== 'manager') {
			return fail(403, { message: 'Only the owner or a manager can add collaborators.' });
		}
		try {
			await project.addCollaboratorByEmail({ projectId: params.id, email, role });
			return { ok: true };
		} catch (e) {
			if (e instanceof ProjectValidationError) {
				return fail(400, { message: Object.values(e.fields).join(' ') });
			}
			throw e;
		}
	},

	removeCollaborator: async (event) => {
		const { params, request, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}
		const form = await request.formData();
		const userId = String(form.get('userId') ?? '');
		if (!userId) return fail(400, { message: 'userId is required.' });

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const scope = await project.getEditableScope(params.id);
		if (scope !== 'owner' && scope !== 'manager') {
			return fail(403, { message: 'Only the owner or a manager can remove collaborators.' });
		}
		await project.removeCollaborator(params.id, userId);
		return { ok: true };
	},

	complete: async (event) => {
		const { params, platform } = event;
		if (!platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		try {
			const result = await project.completeAndMaybeRecur(params.id);
			return { ok: true, nextProjectId: result.nextProjectId };
		} catch (e) {
			if (e instanceof ProjectPermissionError) return fail(403, { message: e.message });
			throw e;
		}
	}
};
