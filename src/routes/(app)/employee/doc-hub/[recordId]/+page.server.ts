import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getDocHubItem, type DocHubLibraryItem } from '$platform/integrations/lark/doc-hub-library';

/**
 * My Space → Doc Hub → document detail. Read + preview a single record and
 * manage (upload/delete) its attachments. Public (no login) — see the
 * `isPublicDocHub` bypass in hooks.server.ts.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			item: null as DocHubLibraryItem | null,
			revision: null as number | null,
			loadError: 'Cloudflare platform bindings are required.'
		};
	}

	try {
		const { item, revision } = await getDocHubItem(event.platform.env, event.params.recordId);
		return { item, revision, loadError: null as string | null };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		// A bad/missing record id surfaces as a Lark error — treat as 404.
		if (/record.*not.*found|RecordIdNotFound|1254043|1254045/i.test(message)) {
			throw error(404, 'Document not found');
		}
		return {
			item: null as DocHubLibraryItem | null,
			revision: null as number | null,
			loadError: `Failed to load document: ${message}`
		};
	}
};
