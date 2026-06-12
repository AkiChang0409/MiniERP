import type { ModuleContext } from '$platform/modules/types';
import {
	ProjectCollaboratorRepository,
	ProjectUserDirectory
} from '../repositories/project-repository';
import { ProjectValidationError } from '../domain';

/**
 * Project collaborators (app users) — list / add / add-by-email / remove
 * (TKMGMT1 / TKMGMT2 / TKMGMT3).
 *
 * Future capability: `project.collaborator`.
 */
export class ProjectCollaborationService {
	private collaboratorRepo: ProjectCollaboratorRepository;
	private userDirectory: ProjectUserDirectory;

	constructor(private ctx: ModuleContext) {
		this.collaboratorRepo = new ProjectCollaboratorRepository(ctx.db);
		this.userDirectory = new ProjectUserDirectory(ctx.db);
	}

	async listCollaborators(projectId: string) {
		return this.collaboratorRepo.listForProject(projectId);
	}

	async addCollaborator(input: { projectId: string; userId: string; role?: string | null }) {
		const existing = await this.collaboratorRepo.findByProjectAndUser(input.projectId, input.userId);
		if (existing) {
			if (input.role !== undefined && input.role !== existing.role) {
				await this.collaboratorRepo.update(existing.id, { role: input.role ?? null });
			}
			return { id: existing.id, alreadyExisted: true };
		}
		return this.collaboratorRepo.create({
			id: crypto.randomUUID(),
			projectId: input.projectId,
			userId: input.userId,
			role: input.role ?? null
		});
	}

	async addCollaboratorByEmail(input: { projectId: string; email: string; role?: string | null }) {
		const user = await this.userDirectory.findByEmail(input.email);
		if (!user) {
			throw new ProjectValidationError({
				email: `No user found with email ${input.email}.`
			});
		}
		return this.addCollaborator({
			projectId: input.projectId,
			userId: user.id,
			role: input.role ?? null
		});
	}

	async removeCollaborator(projectId: string, userId: string) {
		return this.collaboratorRepo.removeByProjectAndUser(projectId, userId);
	}
}
