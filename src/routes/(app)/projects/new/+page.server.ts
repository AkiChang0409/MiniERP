import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { r2FileUrls } from '$platform/files/r2-file-urls';

// Allowed attachment types per user spec — extension + MIME pair so we accept
// drag-drops from OSes that mis-report the type. Keep them in sync with the
// `accept` attribute on the picker in +page.svelte.
const ALLOWED_EXT = new Set([
	'pdf',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'png',
	'jpg',
	'jpeg'
]);
const ALLOWED_MIME = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'image/png',
	'image/jpeg',
	'image/jpg'
]);
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB

function sanitizeFileName(name: string): string {
	const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
	return base || 'attachment';
}

function extOf(name: string): string {
	const m = /\.([a-zA-Z0-9]+)$/.exec(name);
	return m ? m[1].toLowerCase() : '';
}

function validateAttachment(file: File): { ok: true } | { ok: false; message: string } {
	if (file.size === 0) return { ok: false, message: 'Attachment file is empty.' };
	if (file.size > MAX_ATTACHMENT_BYTES) {
		return {
			ok: false,
			message: `Attachment is too large (${Math.round(file.size / 1024 / 1024)}MB > 15MB).`
		};
	}
	const ext = extOf(file.name);
	const mime = (file.type || '').toLowerCase();
	if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIME.has(mime)) {
		return {
			ok: false,
			message: `Unsupported file type "${ext || mime || 'unknown'}". Allowed: ${[...ALLOWED_EXT].join(', ')}.`
		};
	}
	return { ok: true };
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return { customers: [], users: [], parentProjects: [], canAssignOwner: false };
	}

	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	const project = createProjectApi(ctx);
	const roles = ctx.user?.roles ?? [];
	const canAssignOwner = roles.some(
		(r) => r === 'owner' || r === 'admin' || r === 'project_manager'
	);

	const [customers, users, parentProjectsRaw] = await Promise.all([
		salesCrm.listCustomerOptions(),
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

		// Drag-and-drop attachments (TKMGMT1 v2 — multi-file). Each file goes
		// through the same allow-list + size check the API route uses, and the
		// per-file failures are surfaced so the user can retry the bad ones.
		const incomingFiles = form
			.getAll('files')
			.filter((v): v is File => v instanceof File && v.size > 0);
		const pendingAttachments: File[] = [];
		const preFlightErrors: string[] = [];
		for (const file of incomingFiles) {
			const verdict = validateAttachment(file);
			if (verdict.ok) {
				pendingAttachments.push(file);
			} else {
				preFlightErrors.push(`"${file.name}" — ${verdict.message}`);
			}
		}
		if (preFlightErrors.length > 0) {
			return fail(400, { message: preFlightErrors.join(' · ') });
		}

		if (!name) {
			return fail(400, { message: 'Project name is required.' });
		}
		if (!deadline) {
			return fail(400, { message: 'Deadline is required.' });
		}

		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		let createdProjectId: string | null = null;
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
				attachmentUrl: null,
				attachmentName: null,
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
			createdProjectId = created.id;

			// Push every queued file to R2 and persist one project_attachments
			// row per file. Each file is stored under its own UUID key so
			// re-uploading a same-named file later never overwrites the old one.
			if (pendingAttachments.length > 0) {
				const datePart = new Date().toISOString().slice(0, 10);
				for (const file of pendingAttachments) {
					const safeName = sanitizeFileName(file.name);
					const key = `projects/${created.id}/attachments/${datePart}/${crypto.randomUUID()}-${safeName}`;
					await event.platform.env.R2.put(key, await file.arrayBuffer(), {
						httpMetadata: {
							contentType: file.type || 'application/octet-stream'
						},
						customMetadata: {
							projectId: created.id,
							originalName: file.name,
							uploadedBy: ctx.user?.id ?? 'unknown'
						}
					});
					const { fileViewUrl } = r2FileUrls(key);
					await project.addAttachment({
						projectId: created.id,
						storageKey: key,
						url: fileViewUrl ?? '',
						fileName: file.name,
						contentType: file.type || null,
						sizeBytes: file.size
					});
				}
			}

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
			// If we already created the project but the upload failed, surface a
			// note and still redirect — the project exists, the user can re-upload
			// from the settings dialog.
			if (createdProjectId) {
				throw redirect(303, `/projects/${createdProjectId}?upload_error=1`);
			}
			throw e;
		}
	}
};
