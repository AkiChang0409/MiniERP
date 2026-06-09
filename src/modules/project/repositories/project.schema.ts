import { integer, sqliteTable, text, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { timeFields } from '$platform/modules/schema-helpers';
import { businessPartners } from '$modules/sales-crm/repositories/customer.schema';
import { persons } from '$modules/hr/repositories/person.schema';
import { users } from '$platform/auth/users.schema';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
//
// Wave 4 (TKMGMT1-10) introduced:
//   - ownerId           : single-user "project owner" used for crucial-field
//                         permission gating (TKMGMT2 / TKMGMT4).
//   - parentProjectId   : self-FK to support sub-projects (TKMGMT1).
//   - deadline          : ISO date string; the required due date used by
//                         dashboard / calendar / overdue queries
//                         (TKMGMT1 / TKMGMT3 / TKMGMT8 / TKMGMT10).
//   - notes             : free-form notes captured at creation (TKMGMT1).
//   - priority          : 1-10 integer badge (TKGRPO3 cross-listed).
//   - attachmentUrl /   : single PDF attachment (TKMGMT1). Storage is whatever
//     attachmentName      the upload layer hands back; here we only persist the
//                         URL + display name.
//   - recurrence*       : the series template's metadata. When a project moves
//                         to status='completed' and `recurrenceFrequency` is
//                         set, the service auto-creates the next instance
//                         (TKMGMT6 / TKMGMT7).
//   - recurrenceParentId: when an instance is auto-generated, this points back
//                         to the originating series template so the calendar
//                         view can group them (TKMGMT8).
// ---------------------------------------------------------------------------

export const projects = sqliteTable('projects', {
	id: text('id').primaryKey(),
	businessPartnerId: text('business_partner_id').references(() => businessPartners.id),
	ownerId: text('owner_id').references(() => users.id),
	parentProjectId: text('parent_project_id').references((): AnySQLiteColumn => projects.id),
	name: text('name').notNull(),
	status: text('status').notNull().default('unassigned'),
	type: text('type', { enum: ['delivery', 'ongoing', 'internal'] }),
	startDate: text('start_date'),
	endDate: text('end_date'),
	deadline: text('deadline'),
	description: text('description'),
	notes: text('notes'),
	priority: integer('priority').notNull().default(5),
	attachmentUrl: text('attachment_url'),
	attachmentName: text('attachment_name'),
	recurrenceFrequency: text('recurrence_frequency', {
		enum: ['daily', 'weekly', 'monthly', 'custom']
	}),
	recurrenceInterval: integer('recurrence_interval'),
	recurrenceParentId: text('recurrence_parent_id').references(
		(): AnySQLiteColumn => projects.id
	),
	...timeFields
});

// ---------------------------------------------------------------------------
// ProjectMembers (who works on this project — legacy HR-side allocation)
// ---------------------------------------------------------------------------

export const projectEmployees = sqliteTable('project_employees', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	personId: text('person_id').references(() => persons.id),
	name: text('name').notNull(),
	role: text('role'),
	staffType: text('staff_type', {
		enum: ['fulltime', 'parttime', 'freelancer', 'director']
	})
		.notNull()
		.default('fulltime'),
	dateIn: text('date_in'),
	dateOut: text('date_out'),
	cpfApplicable: integer('cpf_applicable', { mode: 'boolean' }).notNull().default(true),
	...timeFields
});

// ---------------------------------------------------------------------------
// Project Collaborators (TKMGMT1, TKMGMT2, TKMGMT9)
// ---------------------------------------------------------------------------
// Unlike projectEmployees (which is HR-side payroll allocation), collaborators
// are application users with login accounts. They can read & edit non-crucial
// fields and post comments. `role` is a free-text label set at invite time
// (e.g. "reviewer", "engineer", "designer").
// ---------------------------------------------------------------------------

export const projectCollaborators = sqliteTable('project_collaborators', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	role: text('role'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Project Comments (TKMGMT9)
// ---------------------------------------------------------------------------
// `mentions` stores a JSON array of user IDs that were @-mentioned in `body`.
// The service extracts them at write-time so consumers don't have to re-parse.
// ---------------------------------------------------------------------------

export const projectComments = sqliteTable('project_comments', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	authorUserId: text('author_user_id').references(() => users.id),
	authorEmail: text('author_email'),
	authorName: text('author_name'),
	body: text('body').notNull(),
	mentions: text('mentions'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Project Attachments (TKMGMT1 v2 — multi-file)
// ---------------------------------------------------------------------------
// Replaces the single `attachmentUrl` / `attachmentName` columns on `projects`.
// Those columns are kept for back-compat reads; new uploads land here and the
// service merges legacy single-file rows into the same list when surfaced.
//
//   - storageKey : R2 object key. The platform helper `r2FileUrls()` builds
//                  the public `/api/files?key=…` URL on demand.
//   - url        : denormalized cached URL — handy for list rendering and
//                  also a stable reference if the URL scheme ever changes.
//   - sizeBytes  : recorded at upload time for "X MB" labels in the UI.
//   - uploadedBy : tracks who attached the file so the audit feed and
//                  permission checks know who owns it.
//
// Soft-delete (`deletedAt`) hides the row in the UI; the underlying R2 object
// is left for a future retention sweep — consistent with how the existing
// document-intake `abandonIntake` flow handles file lifecycle.
// ---------------------------------------------------------------------------

export const projectAttachments = sqliteTable('project_attachments', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	storageKey: text('storage_key').notNull(),
	url: text('url').notNull(),
	fileName: text('file_name').notNull(),
	contentType: text('content_type'),
	sizeBytes: integer('size_bytes'),
	uploadedById: text('uploaded_by_id').references(() => users.id),
	uploadedByEmail: text('uploaded_by_email'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Project Tasks (Phase 1B — Gantt foundation, Motion-style)
// ---------------------------------------------------------------------------
// Each task is a single bar on the project's detailed Gantt. `parentTaskId`
// gives a one-level subtask hierarchy (we keep it shallow on purpose — deep
// nesting hurts Gantt readability). `orderIndex` is the manual sort the user
// drags around inside a row group.
//
//   - status   : matches the project status enum vocabulary for consistency
//                (unassigned / ongoing / under_review / completed)
//   - assigneeId : platform user the task is assigned to (TKMGMT4-style)
//   - estimatedHours : used by the auto-assign workload balancer (Phase 3 /
//                      Epic 4) — no behaviour change if left null
// ---------------------------------------------------------------------------

export const projectTasks = sqliteTable('project_tasks', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	parentTaskId: text('parent_task_id').references((): AnySQLiteColumn => projectTasks.id),
	name: text('name').notNull(),
	description: text('description'),
	status: text('status', {
		enum: ['unassigned', 'ongoing', 'under_review', 'completed', 'blocked']
	})
		.notNull()
		.default('unassigned'),
	startDate: text('start_date'),
	endDate: text('end_date'),
	assigneeId: text('assignee_id').references(() => users.id),
	estimatedHours: integer('estimated_hours'),
	orderIndex: integer('order_index').notNull().default(0),
	completedAt: text('completed_at'),
	isMilestone: integer('is_milestone', { mode: 'boolean' }).notNull().default(false),
	// Stages flow from the workflow engine (Phase 2B). Stored as the stage id
	// so a task always knows which stage progression it advances. Nullable
	// because workflows are an opt-in per project.
	workflowStageId: text('workflow_stage_id'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Task Dependencies
// ---------------------------------------------------------------------------
// Finish-to-Start is the default (the typical Gantt arrow). The other kinds
// are scaffolded for the critical-path resolver but the v1 UI only renders
// `finish_to_start`.
// ---------------------------------------------------------------------------

export const projectTaskDependencies = sqliteTable('project_task_dependencies', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	fromTaskId: text('from_task_id')
		.notNull()
		.references(() => projectTasks.id),
	toTaskId: text('to_task_id')
		.notNull()
		.references(() => projectTasks.id),
	kind: text('kind', {
		enum: ['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish']
	})
		.notNull()
		.default('finish_to_start'),
	lagDays: integer('lag_days').notNull().default(0),
	...timeFields
});

// ---------------------------------------------------------------------------
// Workflow Stages (Phase 2B / Epic 3)
// ---------------------------------------------------------------------------
// A project can opt into a named workflow (e.g. "Request → Approval →
// Procurement → Execution → Review"). Stages are ordered and the auto-advance
// engine moves the project forward when all tasks tagged with a stage finish.
//
//   - `kind` lets a stage carry a non-task requirement (approval gate, budget
//     check), enforced by the rules engine.
//   - `conditionExpression` is a tiny JSON DSL the rules engine reads; v1
//     stores it as opaque JSON and only evaluates a couple of shapes.
// ---------------------------------------------------------------------------

export const projectWorkflowStages = sqliteTable('project_workflow_stages', {
	id: text('id').primaryKey(),
	projectId: text('project_id')
		.notNull()
		.references(() => projects.id),
	name: text('name').notNull(),
	orderIndex: integer('order_index').notNull().default(0),
	kind: text('kind', { enum: ['task_group', 'approval', 'budget_gate', 'manual'] })
		.notNull()
		.default('task_group'),
	status: text('status', {
		enum: ['pending', 'in_progress', 'completed', 'blocked', 'skipped']
	})
		.notNull()
		.default('pending'),
	conditionExpression: text('condition_expression'),
	completedAt: text('completed_at'),
	...timeFields
});

// ---------------------------------------------------------------------------
// Calendar integrations (Phase 3 / Epic 5 scaffold)
// ---------------------------------------------------------------------------
// Tracks per-user OAuth bindings to Google Calendar / Outlook. Real
// credentials need GOOGLE_CALENDAR_CLIENT_ID / OUTLOOK_CLIENT_ID env values to
// be wired by the operator; the schema is ready so the UI can show a
// "Connect" button now.
// ---------------------------------------------------------------------------

export const projectCalendarIntegrations = sqliteTable('project_calendar_integrations', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id),
	provider: text('provider', { enum: ['google', 'outlook'] }).notNull(),
	externalAccountEmail: text('external_account_email'),
	accessTokenEncrypted: text('access_token_encrypted'),
	refreshTokenEncrypted: text('refresh_token_encrypted'),
	expiresAt: text('expires_at'),
	scope: text('scope'),
	status: text('status', { enum: ['active', 'expired', 'revoked'] })
		.notNull()
		.default('active'),
	...timeFields
});
