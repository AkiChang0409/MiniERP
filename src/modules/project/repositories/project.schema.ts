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
