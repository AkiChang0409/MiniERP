/**
 * Project domain rules — pure business calculations, no DB/framework/AI deps
 * (mirrors `finance/domain/rules.ts`). Currently: recurrence deadline math.
 */

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'custom';

function addDaysIso(dateIso: string, days: number): string {
	// Treat the deadline as a date (YYYY-MM-DD). Adding days in UTC keeps the
	// math timezone-agnostic — we never round-trip to a wall-clock time.
	const base = new Date(`${dateIso}T00:00:00Z`);
	if (Number.isNaN(base.getTime())) return dateIso;
	base.setUTCDate(base.getUTCDate() + days);
	return base.toISOString().slice(0, 10);
}

function addMonthsIso(dateIso: string, months: number): string {
	const base = new Date(`${dateIso}T00:00:00Z`);
	if (Number.isNaN(base.getTime())) return dateIso;
	const targetMonth = base.getUTCMonth() + months;
	base.setUTCMonth(targetMonth);
	return base.toISOString().slice(0, 10);
}

/** Compute the *next* deadline in a recurring series. */
export function computeNextDeadline(
	currentDeadline: string,
	frequency: RecurrenceFrequency,
	intervalDays?: number | null
): string {
	switch (frequency) {
		case 'daily':
			return addDaysIso(currentDeadline, 1);
		case 'weekly':
			return addDaysIso(currentDeadline, 7);
		case 'monthly':
			return addMonthsIso(currentDeadline, 1);
		case 'custom':
			return addDaysIso(currentDeadline, Math.max(1, intervalDays ?? 1));
	}
}
