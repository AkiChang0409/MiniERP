import type { ModuleContext } from '$platform/modules/types';
import { ProjectUserDirectory } from '../repositories/project-repository';

/**
 * User directory passthrough used by routes to render the collaborator picker.
 *
 * Future capability: `project.directory`.
 */
export class ProjectDirectoryService {
	private userDirectory: ProjectUserDirectory;

	constructor(_ctx: ModuleContext) {
		this.userDirectory = new ProjectUserDirectory(_ctx.db);
	}

	async searchUsers(prefix: string) {
		if (!prefix || prefix.length < 1) return [];
		return this.userDirectory.findByEmailPrefix(prefix);
	}

	async listUsers() {
		return this.userDirectory.listAll();
	}
}
