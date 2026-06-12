import type { DBClient } from '$infrastructure/db';
import { DocumentArtifactRepository } from '$modules/document-intake';
import { financeCapabilities, financeCapabilityIds } from '../capabilities';
import type { SuggestedNextTask } from '../capabilities/types';
import { financeWorkflows, financeWorkflowIds } from '../workflows';
import { GstReturnRepository } from '../repositories/tax-repository';

export function createFinanceTaskService() {
	return {
		listWorkflowIds: () => [...financeWorkflowIds],
		listCapabilityIds: () => [...financeCapabilityIds],
		getWorkflowDefinitions: () => financeWorkflows,
		getCapabilityDefinitions: () => financeCapabilities
	};
}

export type FinanceTaskService = ReturnType<typeof createFinanceTaskService>;

// ---------------------------------------------------------------------------
// Today Brief
// ---------------------------------------------------------------------------

export interface TodayBriefItem {
	id: string;
	title: string;
	detail: string;
	workflowId?: string;
	urgency: 'normal' | 'due-soon' | 'overdue';
	count?: number;
}

export interface TodayBriefData {
	items: TodayBriefItem[];
	greeting: string;
}

/**
 * Returns the next Singapore GST quarterly filing deadline relative to `now`.
 * Deadlines: Apr 30 (Q1), Jul 31 (Q2), Oct 31 (Q3), Jan 31 next year (Q4).
 */
function getNextGstDeadline(now: Date): { deadline: Date; quarter: string; year: string } {
	const y = now.getUTCFullYear();
	const candidates = [
		// Q4 of previous year → due Jan 31 current year
		{ deadline: new Date(Date.UTC(y, 0, 31)), quarter: '4', year: String(y - 1) },
		// Q1 → Apr 30
		{ deadline: new Date(Date.UTC(y, 3, 30)), quarter: '1', year: String(y) },
		// Q2 → Jul 31
		{ deadline: new Date(Date.UTC(y, 6, 31)), quarter: '2', year: String(y) },
		// Q3 → Oct 31
		{ deadline: new Date(Date.UTC(y, 9, 31)), quarter: '3', year: String(y) },
		// Q4 of current year → due Jan 31 next year
		{ deadline: new Date(Date.UTC(y + 1, 0, 31)), quarter: '4', year: String(y) }
	];
	return candidates.find((c) => c.deadline >= now) ?? candidates[candidates.length - 1];
}

/**
 * Aggregate real-time signals into today's brief item list for the AI Panel.
 *
 * Signal priority:
 *  1. Documents `ready_for_review` in the Inbox (primary action driver)
 *  2. Documents still in-flight (informational; only shown when inbox is empty)
 *  3. Upcoming or overdue GST quarterly deadline (within 14-day window)
 */
export async function getTodayBriefItems(
	db: DBClient,
	tenantId: string,
	now: Date
): Promise<TodayBriefData> {
	const artifactRepo = new DocumentArtifactRepository(db);
	const gstRepo = new GstReturnRepository(db);

	const [readyCount, inFlightCount] = await Promise.all([
		artifactRepo.countByStatuses(tenantId, ['ready_for_review']),
		artifactRepo.countByStatuses(tenantId, [
			'received',
			'stored',
			'text_extraction_pending',
			'text_extracted',
			'classification_pending',
			'classified',
			'fields_extraction_pending'
		])
	]);

	const gstInfo = getNextGstDeadline(now);
	const daysToDeadline = Math.ceil(
		(gstInfo.deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
	);
	const gstReturn = await gstRepo.findByQuarter(gstInfo.year, gstInfo.quarter);
	const gstFiled = gstReturn?.status === 'filed' || gstReturn?.status === 'submitted';

	const items: TodayBriefItem[] = [];

	if (readyCount > 0) {
		items.push({
			id: 'brief-inbox',
			title:
				readyCount === 1
					? '1 document waiting for review'
					: `${readyCount} documents waiting for review`,
			detail: 'AI has pre-filled the fields. Tap to confirm or adjust.',
			workflowId: 'finance-inbox',
			urgency: 'due-soon',
			count: readyCount
		});
	} else if (inFlightCount > 0) {
		items.push({
			id: 'brief-processing',
			title:
				inFlightCount === 1
					? '1 document being processed'
					: `${inFlightCount} documents being processed`,
			detail: 'AI is extracting fields — should be ready shortly.',
			urgency: 'normal',
			count: inFlightCount
		});
	}

	if (!gstFiled) {
		if (daysToDeadline >= 0 && daysToDeadline <= 14) {
			items.push({
				id: 'brief-gst',
				title: `GST Q${gstInfo.quarter} due in ${daysToDeadline} day${daysToDeadline === 1 ? '' : 's'}`,
				detail: "I've tallied input/output tax so far. Ready when you are.",
				urgency: daysToDeadline <= 3 ? 'overdue' : 'due-soon'
			});
		} else if (daysToDeadline < 0) {
			items.push({
				id: 'brief-gst',
				title: `GST Q${gstInfo.quarter} return overdue`,
				detail: 'Filing deadline has passed. Please file as soon as possible.',
				urgency: 'overdue'
			});
		}
	}

	const greeting = buildGreeting(readyCount, inFlightCount, items.length);
	return { items, greeting };
}

function buildGreeting(readyCount: number, inFlightCount: number, totalItems: number): string {
	if (totalItems === 0) return 'All clear. Nothing pending right now.';
	if (readyCount > 0) {
		return readyCount === 1
			? "1 document pre-drafted, ready for your eyes."
			: `${readyCount} documents pre-drafted. Tap any to confirm.`;
	}
	if (inFlightCount > 0) {
		return `AI is working on ${inFlightCount} document${inFlightCount === 1 ? '' : 's'}.`;
	}
	return `${totalItems} thing${totalItems === 1 ? '' : 's'} need${totalItems === 1 ? 's' : ''} your attention.`;
}

// ---------------------------------------------------------------------------
// Next-task suggestion (replaces the former suggest-next-task capability mock)
// ---------------------------------------------------------------------------

/**
 * Suggest the next finance task once a workflow completes, from real signals:
 * documents still waiting in the inbox take priority (carrying the just-recorded
 * supplier as context), otherwise an open GST quarter. Returns null when there
 * is nothing pending. This is the SDK-for-code source of truth; the
 * `finance.suggest-next-finance-task` capability forwards to it via an injected
 * port.
 */
export async function suggestNextFinanceTask(
	db: DBClient,
	tenantId: string,
	input: { afterWorkflowId?: string; afterSupplierName?: string },
	now: Date
): Promise<SuggestedNextTask | null> {
	const artifactRepo = new DocumentArtifactRepository(db);
	const readyCount = await artifactRepo.countByStatuses(tenantId, ['ready_for_review']);

	if (readyCount > 0) {
		return {
			title:
				readyCount === 1
					? '1 document waiting for review'
					: `${readyCount} documents waiting for review`,
			detail: input.afterSupplierName
				? `Recorded ${input.afterSupplierName}. ${readyCount} more in the inbox — want to keep going?`
				: 'AI has pre-filled the fields. Tap to confirm or adjust.',
			workflowId: 'finance-inbox',
			count: readyCount
		};
	}

	const gstInfo = getNextGstDeadline(now);
	const gstRepo = new GstReturnRepository(db);
	const gstReturn = await gstRepo.findByQuarter(gstInfo.year, gstInfo.quarter);
	const gstFiled = gstReturn?.status === 'filed' || gstReturn?.status === 'submitted';
	if (!gstFiled) {
		return {
			title: `GST Q${gstInfo.quarter} review is open`,
			detail: "I've tallied input/output tax so far. Want a draft for review?",
			workflowId: null,
			count: 1
		};
	}

	return null;
}
