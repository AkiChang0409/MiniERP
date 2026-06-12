import type { ModuleContext } from '$platform/modules/types';
import { ProjectAccessService } from './project-access-service';
import { ProjectQueryService } from './project-query-service';
import { ProjectCollaborationService } from './project-collaboration-service';
import { ProjectCommentService } from './project-comment-service';
import { ProjectMemberService } from './project-member-service';
import { ProjectAttachmentService } from './project-attachment-service';
import { ProjectDashboardService } from './project-dashboard-service';
import { ProjectFinancialsService } from './project-financials-service';
import { ProjectDirectoryService } from './project-directory-service';
import { ProjectLifecycleService } from './project-lifecycle-service';

/**
 * `createProjectApi(ctx)` is the public SDK-for-code entry point for the project
 * module. It instantiates the per-use-case services and exposes a flat,
 * strongly-typed surface — the same 31-method shape routes / other modules have
 * always consumed. Each method is a thin delegate to its owning service; the
 * business logic lives once, in the service. (Mirrors `finance/services/api.ts`.)
 *
 * The service split is intentionally fine-grained so a future agent layer can
 * map capabilities 1:1 onto these services (see each service's "Future
 * capability" note).
 */
export function createProjectApi(ctx: ModuleContext) {
	const access = new ProjectAccessService(ctx);
	const query = new ProjectQueryService(ctx);
	const collaboration = new ProjectCollaborationService(ctx);
	const comment = new ProjectCommentService(ctx);
	const member = new ProjectMemberService(ctx);
	const dashboard = new ProjectDashboardService(ctx);
	const financials = new ProjectFinancialsService(ctx);
	const directory = new ProjectDirectoryService(ctx);
	const attachment = new ProjectAttachmentService(ctx, { access });
	const lifecycle = new ProjectLifecycleService(ctx, { access, collaboration, query });

	return {
		// Reads
		getById: query.getById.bind(query),
		getWithCustomer: query.getWithCustomer.bind(query),
		list: query.list.bind(query),
		getProjectListPage: query.getProjectListPage.bind(query),
		getListCounts: query.getListCounts.bind(query),
		getProjectShell: query.getProjectShell.bind(query),
		getSubProjects: query.getSubProjects.bind(query),
		// Lifecycle
		create: lifecycle.create.bind(lifecycle),
		update: lifecycle.update.bind(lifecycle),
		archive: lifecycle.archive.bind(lifecycle),
		softDelete: lifecycle.softDelete.bind(lifecycle),
		completeAndMaybeRecur: lifecycle.completeAndMaybeRecur.bind(lifecycle),
		// Members (HR allocation)
		getMembers: member.getMembers.bind(member),
		addMember: member.addMember.bind(member),
		removeMember: member.removeMember.bind(member),
		// Collaborators
		listCollaborators: collaboration.listCollaborators.bind(collaboration),
		addCollaborator: collaboration.addCollaborator.bind(collaboration),
		addCollaboratorByEmail: collaboration.addCollaboratorByEmail.bind(collaboration),
		removeCollaborator: collaboration.removeCollaborator.bind(collaboration),
		// Comments
		listComments: comment.listComments.bind(comment),
		addComment: comment.addComment.bind(comment),
		// Attachments
		listAttachments: attachment.listAttachments.bind(attachment),
		addAttachment: attachment.addAttachment.bind(attachment),
		removeAttachment: attachment.removeAttachment.bind(attachment),
		clearLegacyAttachment: attachment.clearLegacyAttachment.bind(attachment),
		// Permissions / scope
		getEditableScope: access.getEditableScope.bind(access),
		// Dashboard / calendar
		getDashboard: dashboard.getDashboard.bind(dashboard),
		getCalendarEntries: dashboard.getCalendarEntries.bind(dashboard),
		// Financials (cross-module figures injected via deps)
		getProjectFinancials: financials.getProjectFinancials.bind(financials),
		// User directory (collaborator picker)
		searchUsers: directory.searchUsers.bind(directory),
		listUsers: directory.listUsers.bind(directory)
	};
}

export type ProjectApi = ReturnType<typeof createProjectApi>;
