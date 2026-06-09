import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

import { createModuleContext, NotFoundError } from '$platform/modules';
import { createProjectApi } from '$modules/project';

export const load: LayoutServerLoad = async (event) => {
	if (!event.platform) {
		throw error(500, 'Cloudflare platform bindings are required');
	}

	event.depends(`app:project-activity:${event.params.id}`);
	event.depends(`app:project-attachments:${event.params.id}`);

	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		// Attachments live on the layout (rather than only the page) so the
		// settings dialog in +layout.svelte can render the manager UI, and the
		// detail page still sees them via parent-data merging.
		const [shell, attachments] = await Promise.all([
			project.getProjectShell(event.params.id),
			project.listAttachments(event.params.id)
		]);
		return { ...shell, attachments };
	} catch (e) {
		if (e instanceof NotFoundError) {
			throw error(404, 'Project not found');
		}
		throw e;
	}
};

