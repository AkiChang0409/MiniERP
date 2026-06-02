import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { createBusinessPartnerApi } from '$modules/business-partner';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return { customers: [], users: [], parentProjects: [], canAssignOwner: false };
	}

	const ctx = await createModuleContext(event);
	const businessPartner = createBusinessPartnerApi(ctx);
	const project = createProjectApi(ctx);
	const roles = ctx.user?.roles ?? [];
	const canAssignOwner = roles.some(
		(r) => r === 'owner' || r === 'admin' || r === 'project_manager'
	);

	const [customers, users, parentProjectsRaw] = await Promise.all([
		businessPartner.listCustomerOptions(),
		project.listUsers(),
		project.list({ pageSize: 50 })
	]);

	const parentProjects = parentProjectsRaw.map((row) => ({
		id: row.project.id,
		name: row.project.name
	}));

	return {
		customers,
		users,
		parentProjects,
		canAssignOwner,
		currentUser: ctx.user
	};
};

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}

		const form = await event.request.formData();
		const customerId = String(form.get('customerId') ?? '');
		const name = String(form.get('name') ?? '').trim();
		const status = String(form.get('status') ?? 'unassigned');
		const startDate = String(form.get('startDate') ?? '');
		const endDate = String(form.get('endDate') ?? '');
		const deadline = String(form.get('deadline') ?? '');
		const description = String(form.get('description') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const priorityRaw = String(form.get('priority') ?? '5');
		const priority = Number.parseInt(priorityRaw, 10);
		const attachmentUrl = String(form.get('attachmentUrl') ?? '').trim();
		const attachmentName = String(form.get('attachmentName') ?? '').trim();
		const ownerId = String(form.get('ownerId') ?? '').trim();
		const parentProjectId = String(form.get('parentProjectId') ?? '').trim();
		const recurrenceFrequency = String(form.get('recurrenceFrequency') ?? '').trim();
		const recurrenceIntervalRaw = String(form.get('recurrenceInterval') ?? '').trim();
		const recurrenceInterval = recurrenceIntervalRaw
			? Number.parseInt(recurrenceIntervalRaw, 10)
			: null;
		const collaboratorIds = form
			.getAll('collaboratorUserIds')
			.map((v) => String(v))
			.filter(Boolean);
		const collaboratorRolesRaw = String(form.get('collaboratorRolesJson') ?? '{}');
		let collaboratorRoles: Record<string, string> = {};
		try {
			const parsed = JSON.parse(collaboratorRolesRaw);
			if (parsed && typeof parsed === 'object') collaboratorRoles = parsed;
		} catch {
			// ignore — use empty roles map
		}

		if (!name) {
			return fail(400, { message: 'Project name is required.' });
		}
		if (!deadline) {
			return fail(400, { message: 'Deadline is required.' });
		}

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		try {
			const created = await project.create({
				businessPartnerId: customerId || null,
				ownerId: ownerId || null,
				parentProjectId: parentProjectId || null,
				name,
				status,
				startDate: startDate || undefined,
				endDate: endDate || undefined,
				deadline,
				description: description || undefined,
				notes: notes || undefined,
				priority: Number.isFinite(priority) ? Math.min(10, Math.max(1, priority)) : 5,
				attachmentUrl: attachmentUrl || null,
				attachmentName: attachmentName || null,
				recurrenceFrequency:
					recurrenceFrequency === 'daily' ||
					recurrenceFrequency === 'weekly' ||
					recurrenceFrequency === 'monthly' ||
					recurrenceFrequency === 'custom'
						? recurrenceFrequency
						: null,
				recurrenceInterval,
				collaborators: collaboratorIds.map((id) => ({
					userId: id,
					role: collaboratorRoles[id] ?? null
				}))
			});

			throw redirect(303, `/projects/${created.id}`);
		} catch (e) {
			if (e instanceof Response) throw e; // sveltekit redirect
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
	}
};
