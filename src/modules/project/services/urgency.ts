/**
 * Deadline urgency — computed in one place so the colour is identical across
 * the list, detail, dashboard, calendar, and Gantt views. The user no longer
 * picks a priority number; instead each project radiates green / yellow / red
 * based on how much of its time window has elapsed.
 *
 * Thresholds (configurable later via companySettings):
 *   - remaining > 70%                 → green   ("on_track")
 *   - 20% ≤ remaining ≤ 70%           → yellow  ("watch")
 *   - 0% ≤ remaining < 20%            → red     ("urgent")
 *   - remaining < 0% and not done     → red + overdue badge
 *   - status = completed              → grey-green ("done")
 *
 * "Remaining" is the fraction of (deadline − today) over (deadline − start).
 * When `startDate` is missing we fall back to `createdAt`, since TKMGMT1
 * already enforces a non-null deadline on new projects.
 */

export type UrgencyLevel = 'on_track' | 'watch' | 'urgent' | 'overdue' | 'done' | 'unknown';

export interface UrgencyResult {
	level: UrgencyLevel;
	label: string;
	/** Background colour for soft chips (use with `text`). */
	soft: string;
	/** Foreground (text + dark accent). */
	text: string;
	/** Solid fill for Gantt bars / heat indicators. */
	fill: string;
	/** Border colour for chips with rings. */
	border: string;
	/** 0 → 100 percent elapsed (capped). null when we can't compute. */
	percentElapsed: number | null;
	/** Whole-day count until/past the deadline. Negative = overdue. */
	daysUntilDeadline: number | null;
}

const TOKENS: Record<UrgencyLevel, Omit<UrgencyResult, 'percentElapsed' | 'daysUntilDeadline'>> = {
	on_track: {
		level: 'on_track',
		label: 'On track',
		soft: '#dcfce7',
		text: '#166534',
		fill: '#16a34a',
		border: '#bbf7d0'
	},
	watch: {
		level: 'watch',
		label: 'Watch',
		soft: '#fef3c7',
		text: '#92400e',
		fill: '#f59e0b',
		border: '#fde68a'
	},
	urgent: {
		level: 'urgent',
		label: 'Urgent',
		soft: '#fee2e2',
		text: '#b91c1c',
		fill: '#dc2626',
		border: '#fecaca'
	},
	overdue: {
		level: 'overdue',
		label: 'Overdue',
		soft: '#fee2e2',
		text: '#991b1b',
		fill: '#b91c1c',
		border: '#fca5a5'
	},
	done: {
		level: 'done',
		label: 'Done',
		soft: '#e2e8f0',
		text: '#475569',
		fill: '#64748b',
		border: '#cbd5e1'
	},
	unknown: {
		level: 'unknown',
		label: '—',
		soft: '#f1f5f9',
		text: '#64748b',
		fill: '#cbd5e1',
		border: '#e2e8f0'
	}
};

const ONE_DAY = 86_400_000;

function parseDateIso(value: string | null | undefined): number | null {
	if (!value) return null;
	const t = Date.parse(value);
	return Number.isNaN(t) ? null : t;
}

export function computeUrgency(input: {
	status?: string | null;
	startDate?: string | null;
	createdAt?: string | null;
	deadline?: string | null;
	now?: Date;
}): UrgencyResult {
	const status = (input.status ?? '').toLowerCase();
	const now = (input.now ?? new Date()).getTime();
	const deadlineMs = parseDateIso(input.deadline ?? null);
	const startMs = parseDateIso(input.startDate ?? input.createdAt ?? null);

	if (status === 'completed') {
		const daysUntil = deadlineMs == null ? null : Math.round((deadlineMs - now) / ONE_DAY);
		return { ...TOKENS.done, percentElapsed: 100, daysUntilDeadline: daysUntil };
	}

	if (deadlineMs == null) {
		return { ...TOKENS.unknown, percentElapsed: null, daysUntilDeadline: null };
	}

	const daysUntil = Math.round((deadlineMs - now) / ONE_DAY);

	// Past the deadline (and not completed) — straight red with an overdue flag.
	if (deadlineMs < now) {
		return { ...TOKENS.overdue, percentElapsed: 100, daysUntilDeadline: daysUntil };
	}

	// Without a start, we can't compute "% elapsed" meaningfully; fall back to a
	// simple "days remaining" heuristic to still produce a useful colour.
	if (startMs == null || startMs >= deadlineMs) {
		if (daysUntil <= 3) return { ...TOKENS.urgent, percentElapsed: null, daysUntilDeadline: daysUntil };
		if (daysUntil <= 14) return { ...TOKENS.watch, percentElapsed: null, daysUntilDeadline: daysUntil };
		return { ...TOKENS.on_track, percentElapsed: null, daysUntilDeadline: daysUntil };
	}

	const span = deadlineMs - startMs;
	const elapsed = now - startMs;
	const percentElapsed = Math.max(0, Math.min(100, Math.round((elapsed / span) * 100)));
	const remainingPct = 100 - percentElapsed;

	if (remainingPct < 20) {
		return { ...TOKENS.urgent, percentElapsed, daysUntilDeadline: daysUntil };
	}
	if (remainingPct <= 70) {
		return { ...TOKENS.watch, percentElapsed, daysUntilDeadline: daysUntil };
	}
	return { ...TOKENS.on_track, percentElapsed, daysUntilDeadline: daysUntil };
}

/** Convenience for "give me only the badge colours" without re-typing. */
export function urgencyBadgeClasses(level: UrgencyLevel): { style: string } {
	const t = TOKENS[level];
	return { style: `background:${t.soft};color:${t.text}` };
}
