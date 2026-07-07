import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { listProjectsForSend, listSuppliersForSend } from '$app-layer/qc-intake/lookups';
import { startQcSend } from '$app-layer/qc-intake/send-gateway';

/**
 * PM QC-send page (P1c). Loads project + supplier pickers from the Lark Base and
 * exposes a `send` action that emails the blank checklist to the supplier with a
 * signed upload link (see `$app-layer/qc-intake/send-gateway`).
 * Route gated to owner / admin / project_manager (see permissions.ts).
 */
export const load: PageServerLoad = async (event) => {
	const env = event.platform?.env;
	if (!env) return { projects: [], suppliers: [], configured: false };
	try {
		const [projects, suppliers] = await Promise.all([
			listProjectsForSend(env),
			listSuppliersForSend(env)
		]);
		return { projects, suppliers, configured: true };
	} catch (err) {
		return { projects: [], suppliers: [], configured: false, loadError: (err as Error).message };
	}
};

export const actions: Actions = {
	send: async (event) => {
		const env = event.platform?.env;
		if (!env) return fail(500, { error: 'Server env unavailable (run with wrangler).' });

		const form = await event.request.formData();
		const projectId = String(form.get('projectId') ?? '').trim();
		const supplierId = String(form.get('supplierId') ?? '').trim();
		const recipientEmail = String(form.get('recipientEmail') ?? '').trim();
		const file = form.get('file');

		if (!projectId || !supplierId || !recipientEmail) {
			return fail(400, { error: 'Project, supplier and recipient email are required.' });
		}
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Please attach the QC checklist file.' });
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		try {
			const result = await startQcSend(env, {
				projectId,
				supplierId,
				recipientEmail,
				file: {
					fileName: file.name,
					mimeType: file.type || 'application/octet-stream',
					bytes
				},
				appBaseUrl: event.url.origin
			});
			return {
				ok: true,
				subject: result.subject,
				uploadUrl: result.uploadUrl,
				emailSent: result.emailSent
			};
		} catch (err) {
			return fail(500, { error: (err as Error).message });
		}
	}
};
