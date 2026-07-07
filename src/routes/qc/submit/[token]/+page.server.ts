import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { verifyQcToken } from '$app-layer/qc-intake/token';
import { receiveQcUpload } from '$app-layer/qc-intake/receive';

/**
 * Public supplier upload page (P2). Reached from the emailed upload button
 * `/qc/submit/<token>`. No login: the signed token is the capability. The token
 * carries the project/supplier association, so uploading writes a Doc Hub record
 * against the right project with the file attached.
 */
export const load: PageServerLoad = async (event) => {
	const env = event.platform?.env;
	if (!env) return { valid: false };
	const ids = await verifyQcToken(env, event.params.token).catch(() => null);
	return { valid: !!ids };
};

export const actions: Actions = {
	upload: async (event) => {
		const env = event.platform?.env;
		if (!env) return fail(500, { error: 'Server unavailable.' });

		const form = await event.request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { error: 'Please attach the filled checklist file.' });
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		const outcome = await receiveQcUpload(env, {
			token: event.params.token,
			file: {
				fileName: file.name,
				mimeType: file.type || 'application/octet-stream',
				bytes
			}
		});

		if (outcome.ok) return { ok: true };
		if (outcome.reason === 'invalid_token') {
			return fail(400, { error: 'This upload link is invalid or has expired.' });
		}
		return fail(500, { error: outcome.message ?? 'Upload failed, please try again.' });
	}
};
