import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DBClient } from '$infrastructure/db';
import { qmsTemplates, qmsRecords } from './qms.schema';
import { projects, projectTasks } from './project.schema';
import { users } from '$platform/auth/users.schema';
import { BaseRepository } from '$platform/modules/base-repository';

/**
 * ISO 9001 QMS — template library + record (evidence) reads.
 *
 * Templates are company-level master data; records are per-project/per-task
 * filled instances. Reads on records return the responsible-user join so the
 * UI can render a name instead of an id (mirrors `ProjectTaskRepository`).
 */
export class QmsTemplateRepository extends BaseRepository<typeof qmsTemplates> {
	constructor(db: DBClient) {
		super(db, qmsTemplates);
	}

	/** Every active template, for the admin list and the project register. */
	async listActive() {
		return this.db
			.select()
			.from(qmsTemplates)
			.where(and(eq(qmsTemplates.isActive, true), isNull(qmsTemplates.deletedAt)))
			.orderBy(asc(qmsTemplates.orderIndex), asc(qmsTemplates.code));
	}

	/** Full list (incl. inactive) for the admin management page. */
	async listAll() {
		return this.db
			.select()
			.from(qmsTemplates)
			.where(isNull(qmsTemplates.deletedAt))
			.orderBy(asc(qmsTemplates.orderIndex), asc(qmsTemplates.code));
	}

	async listByScope(scope: 'company' | 'project' | 'task') {
		return this.db
			.select()
			.from(qmsTemplates)
			.where(
				and(
					eq(qmsTemplates.scope, scope),
					eq(qmsTemplates.isActive, true),
					isNull(qmsTemplates.deletedAt)
				)
			)
			.orderBy(asc(qmsTemplates.orderIndex), asc(qmsTemplates.code));
	}

	/** Task-scope templates whose `taskType` matches — the suggestion engine. */
	async suggestForTaskType(taskType: string) {
		return this.db
			.select()
			.from(qmsTemplates)
			.where(
				and(
					eq(qmsTemplates.scope, 'task'),
					// taskType is a free string at the call site (a project task's
					// nullable enum column); the comparison is value-safe.
					eq(qmsTemplates.taskType, taskType as never),
					eq(qmsTemplates.isActive, true),
					isNull(qmsTemplates.deletedAt)
				)
			)
			.orderBy(asc(qmsTemplates.orderIndex), asc(qmsTemplates.code));
	}

	async findByCode(code: string) {
		const rows = await this.db
			.select()
			.from(qmsTemplates)
			.where(and(eq(qmsTemplates.code, code), isNull(qmsTemplates.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}
}

export class QmsRecordRepository extends BaseRepository<typeof qmsRecords> {
	constructor(db: DBClient) {
		super(db, qmsRecords);
	}

	async listForTask(taskId: string) {
		return this.db
			.select({
				id: qmsRecords.id,
				templateId: qmsRecords.templateId,
				projectId: qmsRecords.projectId,
				taskId: qmsRecords.taskId,
				code: qmsRecords.code,
				name: qmsRecords.name,
				status: qmsRecords.status,
				responsibleUserId: qmsRecords.responsibleUserId,
				responsibleRole: qmsRecords.responsibleRole,
				fields: qmsRecords.fields,
				fileUrl: qmsRecords.fileUrl,
				fileName: qmsRecords.fileName,
				version: qmsRecords.version,
				isRequired: qmsRecords.isRequired,
				requiresApproval: qmsRecords.requiresApproval,
				submittedAt: qmsRecords.submittedAt,
				approvedAt: qmsRecords.approvedAt,
				rejectedReason: qmsRecords.rejectedReason,
				waivedReason: qmsRecords.waivedReason,
				createdAt: qmsRecords.createdAt,
				updatedAt: qmsRecords.updatedAt,
				responsibleName: users.name,
				responsibleEmail: users.email
			})
			.from(qmsRecords)
			.leftJoin(users, eq(qmsRecords.responsibleUserId, users.id))
			.where(and(eq(qmsRecords.taskId, taskId), isNull(qmsRecords.deletedAt)))
			.orderBy(asc(qmsRecords.createdAt));
	}

	async listForProject(projectId: string) {
		return this.db
			.select()
			.from(qmsRecords)
			.where(and(eq(qmsRecords.projectId, projectId), isNull(qmsRecords.deletedAt)))
			.orderBy(asc(qmsRecords.createdAt));
	}

	async findInProject(projectId: string, recordId: string) {
		const rows = await this.db
			.select()
			.from(qmsRecords)
			.where(
				and(
					eq(qmsRecords.id, recordId),
					eq(qmsRecords.projectId, projectId),
					isNull(qmsRecords.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}

	/** Records the given user is responsible for, enriched with task + project +
	 * template-download context. Powers the personal Workplace view. */
	async listForResponsibleUser(userId: string) {
		return this.db
			.select({
				id: qmsRecords.id,
				templateId: qmsRecords.templateId,
				projectId: qmsRecords.projectId,
				taskId: qmsRecords.taskId,
				code: qmsRecords.code,
				name: qmsRecords.name,
				status: qmsRecords.status,
				responsibleUserId: qmsRecords.responsibleUserId,
				responsibleRole: qmsRecords.responsibleRole,
				fields: qmsRecords.fields,
				fileUrl: qmsRecords.fileUrl,
				fileName: qmsRecords.fileName,
				version: qmsRecords.version,
				isRequired: qmsRecords.isRequired,
				requiresApproval: qmsRecords.requiresApproval,
				submittedAt: qmsRecords.submittedAt,
				approvedAt: qmsRecords.approvedAt,
				rejectedReason: qmsRecords.rejectedReason,
				createdAt: qmsRecords.createdAt,
				templateFileUrl: qmsTemplates.fileTemplateUrl,
				templateFileName: qmsTemplates.fileTemplateName,
				taskName: projectTasks.name,
				taskDescription: projectTasks.description,
				taskStatus: projectTasks.status,
				taskStartDate: projectTasks.startDate,
				taskEndDate: projectTasks.endDate,
				taskType: projectTasks.taskType,
				projectName: projects.name
			})
			.from(qmsRecords)
			.leftJoin(qmsTemplates, eq(qmsRecords.templateId, qmsTemplates.id))
			.leftJoin(projectTasks, eq(qmsRecords.taskId, projectTasks.id))
			.leftJoin(projects, eq(qmsRecords.projectId, projects.id))
			.where(and(eq(qmsRecords.responsibleUserId, userId), isNull(qmsRecords.deletedAt)))
			.orderBy(asc(qmsRecords.createdAt));
	}

	/** Required records for a task — drives the completion gate. */
	async requiredForTask(taskId: string) {
		return this.db
			.select()
			.from(qmsRecords)
			.where(
				and(
					eq(qmsRecords.taskId, taskId),
					eq(qmsRecords.isRequired, true),
					isNull(qmsRecords.deletedAt)
				)
			);
	}

	/** Has this template already been attached to this task? (avoid duplicates) */
	async findForTaskAndTemplate(taskId: string, templateId: string) {
		const rows = await this.db
			.select()
			.from(qmsRecords)
			.where(
				and(
					eq(qmsRecords.taskId, taskId),
					eq(qmsRecords.templateId, templateId),
					isNull(qmsRecords.deletedAt)
				)
			)
			.limit(1);
		return rows[0] ?? null;
	}
}
