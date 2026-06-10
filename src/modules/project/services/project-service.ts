import type { ProjectSource } from '../contracts/source';

export function createProjectPublicApi(source: ProjectSource) {
	return {
		getById: source.getById,
		getWithCustomer: source.getWithCustomer,
		list: source.list,
		getProjectListPage: source.getProjectListPage,
		getListCounts: source.getListCounts,
		getProjectShell: source.getProjectShell,
		create: source.create,
		update: source.update,
		archive: source.archive,
		softDelete: source.softDelete,
		getMembers: source.getMembers,
		addMember: source.addMember,
		removeMember: source.removeMember,
		getProjectFinancials: source.getProjectFinancials,
		// Wave 4 (TKMGMT) additions:
		listCollaborators: source.listCollaborators,
		addCollaborator: source.addCollaborator,
		addCollaboratorByEmail: source.addCollaboratorByEmail,
		removeCollaborator: source.removeCollaborator,
		listComments: source.listComments,
		addComment: source.addComment,
		listAttachments: source.listAttachments,
		addAttachment: source.addAttachment,
		removeAttachment: source.removeAttachment,
		clearLegacyAttachment: source.clearLegacyAttachment,
		getEditableScope: source.getEditableScope,
		getSubProjects: source.getSubProjects,
		completeAndMaybeRecur: source.completeAndMaybeRecur,
		getDashboard: source.getDashboard,
		getCalendarEntries: source.getCalendarEntries,
		searchUsers: source.searchUsers,
		listUsers: source.listUsers
	};
}

export type ProjectApi = ReturnType<typeof createProjectPublicApi>;
