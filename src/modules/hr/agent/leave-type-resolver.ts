/**
 * Backend leave-type resolver. The LLM only proposes a free-text `leaveTypeRef`
 * (e.g. "年假", "annual", "lt-annual"); the authoritative mapping to a real
 * leaveTypeId happens here against the live leave-types list — never purely on
 * the LLM's word.
 */

export interface LeaveTypeLike {
	id: string;
	code: string;
	name: string;
}

/** code → recognised aliases (Chinese + English). Used by both the resolver and the classifier prompt. */
export const LEAVE_TYPE_ALIASES: Record<string, string[]> = {
	ANNUAL: ['年假', '年休假', 'annual leave', 'annual', 'al'],
	SICK: ['病假', '生病', 'sick leave', 'sick', 'mc'],
	HOSP: ['住院', '住院假', 'hospitalisation leave', 'hospitalization leave', 'hosp'],
	UNPAID: ['无薪假', '无薪', '事假', 'unpaid leave', 'unpaid']
};

/**
 * Resolve a free-text reference to a concrete leave type.
 * Order: exact id → exact code → exact name → alias exact → alias/code substring
 * → name/code substring. Returns null when nothing matches.
 */
export function resolveLeaveType(types: LeaveTypeLike[], ref: string): LeaveTypeLike | null {
	const q = (ref ?? '').trim().toLowerCase();
	if (!q) return null;

	const byId = types.find((t) => t.id.toLowerCase() === q);
	if (byId) return byId;
	const byCode = types.find((t) => t.code.toLowerCase() === q);
	if (byCode) return byCode;
	const byName = types.find((t) => t.name.toLowerCase() === q);
	if (byName) return byName;

	// Alias exact, then alias-contained-in-query.
	for (const pass of ['exact', 'contains'] as const) {
		for (const [code, aliases] of Object.entries(LEAVE_TYPE_ALIASES)) {
			const hit = aliases.some((a) => {
				const al = a.toLowerCase();
				return pass === 'exact' ? al === q : q.includes(al);
			});
			if (hit) {
				const match = types.find((t) => t.code.toUpperCase() === code);
				if (match) return match;
			}
		}
	}

	// Last resort: the query mentions a type's code or name.
	return (
		types.find((t) => q.includes(t.code.toLowerCase()) || q.includes(t.name.toLowerCase())) ?? null
	);
}
