/**
 * Project entity resolver. Matches project names mentioned in the message text
 * against the project list (via the `createProjectApi` facade — no deep import,
 * no repository/db). Lives in the app composition layer because the platform
 * orchestrator must not import modules.
 */
import { createProjectApi } from '$modules/project';
import type { EntityCandidate, EntityResolver, EntityResolverInput } from '$platform/ai/orchestrator';

interface ProjectListRow {
	project: { id: string; name: string | null };
}

export const projectEntityResolver: EntityResolver = {
	type: 'project',
	async resolve(input: EntityResolverInput): Promise<EntityCandidate[]> {
		const ctx = input.moduleContext;
		if (!ctx) return [];

		const text = input.message.text.toLowerCase();
		const rows = (await createProjectApi(ctx).list({ pageSize: 200 })) as ProjectListRow[];

		const candidates: EntityCandidate[] = [];
		for (const row of rows) {
			const name = row.project?.name?.trim();
			if (name && name.length >= 2 && text.includes(name.toLowerCase())) {
				candidates.push({
					type: 'project',
					id: row.project.id,
					label: name,
					confidence: 0.9,
					reason: 'name_in_message'
				});
			}
		}
		return candidates;
	}
};
