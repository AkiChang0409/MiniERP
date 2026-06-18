import { z } from 'zod';
import {
	CalendarEventsInputSchema,
	type CalendarEventsInput
} from '../../services/calendar-service';

/**
 * Single source of truth: the capability reuses the SAME input schema as the
 * `getCalendarEvents` api method (Architecture_rules R4) so the LLM tool spec
 * and the facade never drift.
 */
export const viewCalendarInputSchema = CalendarEventsInputSchema;
export type ViewCalendarInput = CalendarEventsInput;

const urgencySchema = z.object({
	level: z.string(),
	label: z.string(),
	soft: z.string(),
	text: z.string(),
	fill: z.string(),
	border: z.string(),
	percentElapsed: z.number().nullable(),
	daysUntilDeadline: z.number().nullable()
});

const calendarBadgeSchema = z.enum([
	'overdue',
	'blocked',
	'under_review',
	'milestone',
	'critical_path',
	'conflict',
	'qms_pending',
	'outsourced'
]);

const calendarTaskEventSchema = z.object({
	id: z.string(),
	taskId: z.string(),
	projectId: z.string(),
	projectName: z.string().nullable(),
	stageId: z.string().nullable(),
	stageName: z.string().nullable(),
	stageColor: z.string().nullable(),
	title: z.string(),
	assigneeId: z.string().nullable(),
	assigneeName: z.string().nullable(),
	status: z.string(),
	type: z.enum(['task_start', 'task_due']),
	date: z.string(),
	dateMeaning: z.enum(['starts', 'due', 'overdue']),
	taskType: z.string().nullable(),
	kind: z.string(),
	isMilestone: z.boolean(),
	progressPct: z.number().nullable(),
	badges: z.array(calendarBadgeSchema),
	urgency: urgencySchema
});

export const viewCalendarOutputSchema = z.array(calendarTaskEventSchema);
export type ViewCalendarOutput = z.infer<typeof viewCalendarOutputSchema>;
