import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';

/**
 * Personal Workplace — the signed-in user's assigned tasks across projects,
 * each with the ISO 9001 records they're responsible for (template download +
 * submission area). Read-only load; submissions go to the existing
 * `/api/projects/[id]/records/[recordId]` endpoint client-side.
 */
export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user?.id ?? null;
	if (!event.platform) {
		return { workplace: [], dataMessage: 'Cloudflare platform bindings are required.' };
	}
	if (!userId) {
		return { workplace: [], dataMessage: 'Sign in to see your workplace.' };
	}
	const ctx = await createModuleContext(event);
	const project = createProjectApi(ctx);
	try {
		const workplace = await project.getWorkplace(userId);
		return { workplace, dataMessage: null as string | null };
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (/no such table|qms_records|project_tasks/i.test(msg)) {
			return {
				workplace: [],
				dataMessage: 'Database is missing project/QMS tables. Run `npm run db:migrate:local`.'
			};
		}
		throw err;
	}
};
