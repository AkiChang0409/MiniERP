import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';

/**
 * ISO 9001 QMS template library — company-level master data admin.
 * Reads here; all writes go client-side to the `/api/qms/templates` endpoints
 * (same pattern as the project Gantt page).
 */
export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			templates: [] as unknown[],
			dataMessage: 'Cloudflare platform bindings are required.'
		};
	}
	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	try {
		const templates = await project.listQmsTemplates({ includeInactive: true });
		return { templates, dataMessage: null as string | null };
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (/no such table|qms_templates/i.test(msg)) {
			return {
				templates: [] as unknown[],
				dataMessage:
					'Database is missing the qms_templates table. Run `npm run db:migrate:local`.'
			};
		}
		throw err;
	}
};
