import type { ModuleContext } from '$platform/modules/types';
import { ProjectService } from '$modules/project/services/legacy-project-service';
import type { ProjectSource } from '../contracts/source';

export function createProjectLegacySource(ctx: ModuleContext): ProjectSource {
	const svc = new ProjectService(ctx);

	return {
		getById: svc.getById.bind(svc),
		getWithCustomer: svc.getWithCustomer.bind(svc),
		list: svc.list.bind(svc),
		getProjectListPage: svc.getProjectListPage.bind(svc),
		getListCounts: svc.getListCounts.bind(svc),
		getProjectShell: svc.getProjectShell.bind(svc),
		create: svc.create.bind(svc),
		update: svc.update.bind(svc),
		archive: svc.archive.bind(svc),
		softDelete: svc.softDelete.bind(svc),
		getMembers: svc.getMembers.bind(svc),
		addMember: svc.addMember.bind(svc),
		removeMember: svc.removeMember.bind(svc),
		getProjectFinancials: svc.getProjectFinancials.bind(svc),
		listCollaborators: svc.listCollaborators.bind(svc),
		addCollaborator: svc.addCollaborator.bind(svc),
		addCollaboratorByEmail: svc.addCollaboratorByEmail.bind(svc),
		removeCollaborator: svc.removeCollaborator.bind(svc),
		listComments: svc.listComments.bind(svc),
		addComment: svc.addComment.bind(svc),
		getEditableScope: svc.getEditableScope.bind(svc),
		getSubProjects: svc.getSubProjects.bind(svc),
		completeAndMaybeRecur: svc.completeAndMaybeRecur.bind(svc),
		getDashboard: svc.getDashboard.bind(svc),
		getCalendarEntries: svc.getCalendarEntries.bind(svc),
		searchUsers: svc.searchUsers.bind(svc),
		listUsers: svc.listUsers.bind(svc)
	};
}
