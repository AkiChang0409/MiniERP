import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { ProjectQmsService } from '$modules/project';

/**
 * Review workspace — tasks submitted for review (`under_review`) that the
 * signed-in PM / owner / admin may approve or send back. Scope: managers see
 * all; project owners see their own projects' submissions.
 */
export const load: PageServerLoad = async (event) => {
	const userId = event.locals.user?.id ?? null;
	if (!event.platform || !userId) {
		return { queue: [], dataMessage: 'Sign in to review submissions.' };
	}
	const ctx = await createModuleContext(event);
	const svc = new ProjectQmsService(ctx);
	try {
		const queue = await svc.listReviewQueue(userId);
		return { queue, dataMessage: null as string | null };
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		if (/no such table|qms_records|project_tasks/i.test(msg)) {
			return { queue: [], dataMessage: 'Database is missing project/QMS tables. Run `npm run db:migrate:local`.' };
		}
		throw err;
	}
};
