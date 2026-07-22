import type { PageServerLoad } from './$types';
import { listDocHubLibrary, type DocHubLibrary } from '$platform/integrations/lark/doc-hub-library';

/**
 * My Space → Doc Hub. Reads the Lark Bitable "Doc Hub" table (source of truth)
 * and hands the decoded, display-ready library to the page for client-side
 * filtering by project / category / type / search. Read-only.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) {
		return { library: null as DocHubLibrary | null, error: 'Sign in to view the Doc Hub.' };
	}
	if (!event.platform) {
		return {
			library: null as DocHubLibrary | null,
			error: 'Cloudflare platform bindings are required.'
		};
	}

	try {
		const library = await listDocHubLibrary(event.platform.env);
		return { library, error: null as string | null };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const friendly = /not configured/i.test(message)
			? 'Doc Hub is not configured — set LARK_BITABLE_APP_TOKEN and LARK_DOCHUB_TABLE_ID.'
			: `Failed to load Doc Hub from Lark: ${message}`;
		return { library: null as DocHubLibrary | null, error: friendly };
	}
};
