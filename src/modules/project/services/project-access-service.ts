import type { ModuleContext } from '$platform/modules/types';
import { ProjectRepository, ProjectCollaboratorRepository } from '../repositories/project-repository';
import { isManager } from './_internal';

export type ProjectEditableScope = 'manager' | 'owner' | 'collaborator' | 'none';

/**
 * Permission scope resolution for project actions (TKMGMT2 / TKMGMT4).
 *
 * Future capability: `project.permission` — this is the single source of truth
 * for "what may the current actor do to this project", reused by the lifecycle
 * and attachment services so the rule is written once.
 */
export class ProjectAccessService {
	private repo: ProjectRepository;
	private collaboratorRepo: ProjectCollaboratorRepository;

	constructor(private ctx: ModuleContext) {
		this.repo = new ProjectRepository(ctx.db);
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
	}

	/**
	 * Synchronous scope derived from the actor's roles + ownership only (no
	 * collaborator lookup). Used by write paths that already loaded the project.
	 */
	scopeFor(projectOwnerId: string | null): ProjectEditableScope {
		const user = this.ctx.user;
		if (!user) return 'none';
		if (isManager(user.roles ?? [])) return 'manager';
		if (projectOwnerId && projectOwnerId === user.id) return 'owner';
		return 'collaborator';
	}

	/** Used by routes / pages to figure out which actions to enable in the UI. */
	async getEditableScope(projectId: string): Promise<ProjectEditableScope> {
		const user = this.ctx.user;
		const project = await this.repo.findById(projectId);
		if (!project || !user) return 'none';
		if (isManager(user.roles ?? [])) return 'manager';
		if (project.ownerId && project.ownerId === user.id) return 'owner';
		const collab = await this.collaboratorRepo.findByProjectAndUser(projectId, user.id);
		if (collab) return 'collaborator';
		return 'none';
	}
}
