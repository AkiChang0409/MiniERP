import { ProjectService } from '$modules/project/services/legacy-project-service';

type ProjectServiceMethods = InstanceType<typeof ProjectService>;

export interface ProjectSource {
	getById: ProjectServiceMethods['getById'];
	getWithCustomer: ProjectServiceMethods['getWithCustomer'];
	list: ProjectServiceMethods['list'];
	getProjectListPage: ProjectServiceMethods['getProjectListPage'];
	getListCounts: ProjectServiceMethods['getListCounts'];
	getProjectShell: ProjectServiceMethods['getProjectShell'];
	create: ProjectServiceMethods['create'];
	update: ProjectServiceMethods['update'];
	archive: ProjectServiceMethods['archive'];
	softDelete: ProjectServiceMethods['softDelete'];
	getMembers: ProjectServiceMethods['getMembers'];
	addMember: ProjectServiceMethods['addMember'];
	removeMember: ProjectServiceMethods['removeMember'];
	getProjectFinancials: ProjectServiceMethods['getProjectFinancials'];
	// TKMGMT1 / TKMGMT2 / TKMGMT3 / TKMGMT9 — collaborators + comments
	listCollaborators: ProjectServiceMethods['listCollaborators'];
	addCollaborator: ProjectServiceMethods['addCollaborator'];
	addCollaboratorByEmail: ProjectServiceMethods['addCollaboratorByEmail'];
	removeCollaborator: ProjectServiceMethods['removeCollaborator'];
	listComments: ProjectServiceMethods['listComments'];
	addComment: ProjectServiceMethods['addComment'];
	// TKMGMT1 v2 — multi-file attachments
	listAttachments: ProjectServiceMethods['listAttachments'];
	addAttachment: ProjectServiceMethods['addAttachment'];
	removeAttachment: ProjectServiceMethods['removeAttachment'];
	clearLegacyAttachment: ProjectServiceMethods['clearLegacyAttachment'];
	// TKMGMT4 + TKMGMT2 gating
	getEditableScope: ProjectServiceMethods['getEditableScope'];
	// TKMGMT1 sub-project
	getSubProjects: ProjectServiceMethods['getSubProjects'];
	// TKMGMT6 / TKMGMT7
	completeAndMaybeRecur: ProjectServiceMethods['completeAndMaybeRecur'];
	// TKMGMT8 / TKMGMT10
	getDashboard: ProjectServiceMethods['getDashboard'];
	getCalendarEntries: ProjectServiceMethods['getCalendarEntries'];
	// Collaborator picker helpers
	searchUsers: ProjectServiceMethods['searchUsers'];
	listUsers: ProjectServiceMethods['listUsers'];
}
