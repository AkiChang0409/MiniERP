/**
 * Rule-based Lark text command parser (Phase 3B/3C). Pure — no HR knowledge,
 * no leave-type id resolution (the webhook does that via the HR facade).
 *
 * Fixed formats:
 *   查看待审批请假
 *   提交请假 <leaveTypeName或Code或Id> <startDate> <endDate> [reason...]
 *   批准请假 <leaveRequestId> [comment...]
 *   确认 <code>      （确认待执行的写操作）
 *   取消             （放弃待执行的写操作）
 */

export type LarkCommand =
	| { kind: 'list_pending' }
	| { kind: 'submit'; leaveTypeRef: string; startDate: string; endDate: string; reason?: string }
	| { kind: 'approve'; leaveRequestId: string; comment?: string }
	| { kind: 'confirm'; code?: string }
	| { kind: 'cancel' }
	| { kind: 'unknown' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLarkCommand(text: string): LarkCommand {
	const t = (text ?? '').trim();
	if (!t) return { kind: 'unknown' };

	if (t.startsWith('查看待审批请假')) return { kind: 'list_pending' };
	if (t.startsWith('取消')) return { kind: 'cancel' };
	if (t.startsWith('确认')) {
		const code = t.slice('确认'.length).trim() || undefined;
		return { kind: 'confirm', code };
	}

	if (t.startsWith('提交请假')) {
		const parts = t.slice('提交请假'.length).trim().split(/\s+/).filter(Boolean);
		// Anchor on the two date tokens so a multi-word type name still works:
		//   [type words...] <startDate> <endDate> [reason words...]
		const dateIdx = parts.flatMap((p, i) => (ISO_DATE.test(p) ? [i] : []));
		if (dateIdx.length < 2) return { kind: 'unknown' };
		const [startIdx, endIdx] = dateIdx;
		const leaveTypeRef = parts.slice(0, startIdx).join(' ').trim();
		if (!leaveTypeRef) return { kind: 'unknown' };
		const reason = parts.slice(endIdx + 1).join(' ').trim() || undefined;
		return { kind: 'submit', leaveTypeRef, startDate: parts[startIdx], endDate: parts[endIdx], reason };
	}

	if (t.startsWith('批准请假')) {
		const parts = t.slice('批准请假'.length).trim().split(/\s+/).filter(Boolean);
		if (parts.length < 1) return { kind: 'unknown' };
		const [leaveRequestId, ...rest] = parts;
		return { kind: 'approve', leaveRequestId, comment: rest.join(' ').trim() || undefined };
	}

	return { kind: 'unknown' };
}
