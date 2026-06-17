import { integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { projects, projectTasks } from './project.schema';
import { users } from '$platform/auth/users.schema';

// ---------------------------------------------------------------------------
// ISO 9001 QMS — compliance document templates + filled records
// ---------------------------------------------------------------------------
//
// Two-layer model (see design discussion 2026-06):
//
//   1. `qmsTemplates`  — the company-level master list of QMS documents
//      ("模块 → 建议文件"). Maintained once by quality/admin; rarely changes.
//      A template is the BLANK form/checklist plus the metadata that lets the
//      system route it: which scope it lives at, which task type it attaches
//      to, and which role is responsible for filling it.
//
//   2. `qmsRecords`    — the FILLED instance (the audit evidence). One record =
//      one template applied to one project (and optionally one task). Carries
//      its own status lifecycle, responsible person, uploaded file, and an
//      approval stamp so an ISO auditor can see "filled, by whom, signed off".
//
// The matching key between a free-text Gantt task and a template is the
// `projectTasks.taskType` column (a small controlled vocabulary) — NOT the
// task name, which is user-defined and unmatchable. The system SUGGESTS
// templates whose `taskType` equals the task's type; the PM confirms.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// QMS Templates (company-level master data)
// ---------------------------------------------------------------------------
//   - code              : stable human code, e.g. "DR-001" (unique). Used on
//                         records and audit exports.
//   - moduleCategory    : the ISO module grouping for the admin UI
//                         ("设计开发", "采购外包", …). Display-only.
//   - scope             : where the document lives —
//                           company  → one static register entry, project-less
//                           project  → one per project (kick-off checklist, …)
//                           task     → attaches to a Gantt task by `taskType`
//   - taskType          : matching key for scope='task' templates. NULL for
//                         company/project scope.
//   - responsibleRole   : who must fill it. The special value 'self' resolves
//                         to the task's assignee; any other value is matched
//                         against project collaborator / member roles.
//   - fieldSchema       : optional JSON describing the fields to capture (so the
//                         record can render a form). Opaque to the DB.
//   - requiresApproval  : if true, the record must reach 'approved' (not just
//                         'submitted') to satisfy a completion gate.
//   - isActive          : soft toggle so retired templates stop being suggested
//                         without losing historical records.
// ---------------------------------------------------------------------------

export const qmsTemplates = sqliteTable('qms_templates', {
	id: text('id').primaryKey(),
	code: text('code').notNull(),
	name: text('name').notNull(),
	moduleCategory: text('module_category'),
	scope: text('scope', { enum: ['company', 'project', 'task'] })
		.notNull()
		.default('task'),
	taskType: text('task_type', {
		enum: [
			'design',
			'procurement',
			'production',
			'software',
			'sales',
			'inspection',
			'document_control',
			'quality',
			'handover',
			'general'
		]
	}),
	responsibleRole: text('responsible_role'),
	fieldSchema: text('field_schema'),
	fileTemplateUrl: text('file_template_url'),
	fileTemplateName: text('file_template_name'),
	requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(false),
	isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
	description: text('description'),
	orderIndex: integer('order_index').notNull().default(0),
	...timeFields
});

// ---------------------------------------------------------------------------
// QMS Records (filled evidence instances)
// ---------------------------------------------------------------------------
//   - templateId        : the template this record was instantiated from. Kept
//                         as a plain FK so retiring a template doesn't orphan
//                         the historical evidence.
//   - projectId         : always set. `taskId` is set for task-scope records.
//   - status            : not_started → draft → submitted → approved
//                         (or rejected → back to draft, or waived by a manager).
//   - responsibleUserId : resolved at attach time from the template's role.
//   - responsibleRole   : snapshot of the role label at attach time (the live
//                         project roster may change later).
//   - fields            : JSON payload the responsible person fills in.
//   - file*             : optional uploaded evidence file (R2), mirrors the
//                         `projectAttachments` storageKey/url/fileName shape.
//   - version           : bumped each time a rejected record is re-submitted, so
//                         document-control history is queryable.
//   - isRequired        : whether this record gates task completion. Suggested
//                         records are required by default; a PM can mark an
//                         attached record optional.
//   - submitted*/approved* : who/when, the ISO "sign-off" trail.
// ---------------------------------------------------------------------------

export const qmsRecords = sqliteTable('qms_records', {
	id: text('id').primaryKey(),
	templateId: text('template_id')
		.notNull()
		.references(() => qmsTemplates.id),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	taskId: text('task_id').references((): AnySQLiteColumn => projectTasks.id),
	// Denormalized template fields snapshotted at attach time so the record is
	// self-describing even if the template is later edited or retired.
	code: text('code'),
	name: text('name').notNull(),
	status: text('status', {
		enum: ['not_started', 'draft', 'submitted', 'approved', 'rejected', 'waived']
	})
		.notNull()
		.default('not_started'),
	responsibleUserId: text('responsible_user_id').references(() => users.id),
	responsibleRole: text('responsible_role'),
	fields: text('fields'),
	fileUrl: text('file_url'),
	storageKey: text('storage_key'),
	fileName: text('file_name'),
	version: integer('version').notNull().default(1),
	isRequired: integer('is_required', { mode: 'boolean' }).notNull().default(true),
	requiresApproval: integer('requires_approval', { mode: 'boolean' }).notNull().default(false),
	submittedAt: text('submitted_at'),
	submittedById: text('submitted_by_id').references(() => users.id),
	approvedAt: text('approved_at'),
	approvedById: text('approved_by_id').references(() => users.id),
	rejectedReason: text('rejected_reason'),
	waivedReason: text('waived_reason'),
	...timeFields
});
