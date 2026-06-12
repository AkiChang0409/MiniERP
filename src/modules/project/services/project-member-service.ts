import type { ModuleContext } from '$platform/modules/types';
import {
	ProjectRepository,
	ProjectMemberRepository
} from '../repositories/project-repository';

/**
 * Project members (legacy HR allocation side) — list / add / remove.
 *
 * Future capability: `project.staffing`.
 */
export class ProjectMemberService {
	private repo: ProjectRepository;
	private memberRepo: ProjectMemberRepository;

	constructor(private ctx: ModuleContext) {
		this.repo = new ProjectRepository(ctx.db);
		this.memberRepo = new ProjectMemberRepository(ctx.db);
	}

	async getMembers(projectId: string) {
		return this.repo.getMembers(projectId);
	}

	async addMember(data: {
		projectId: string;
		employeeId: string;
		name: string;
		role?: string;
		staffType?: string;
		dateIn?: string;
		cpfApplicable?: boolean;
	}) {
		return this.memberRepo.create(data);
	}

	async removeMember(memberId: string) {
		return this.memberRepo.softDelete(memberId);
	}
}
