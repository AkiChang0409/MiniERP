/**
 * HR Agent manifest (Phase 1 MVP). Mirrors the Finance Agent shape. Scope is
 * intentionally narrow: leave list / submit / approve. Attendance, overtime,
 * payroll, and master-data edits are explicitly out of scope.
 */
export interface HrAgentManifest {
	id: 'hr-agent';
	name: 'HR Agent';
	domain: 'hr';
	version: string;
	description: string;
	canHandle: readonly string[];
	cannotHandle: readonly string[];
	forbiddenActions: readonly string[];
}

export const hrAgentManifest: HrAgentManifest = {
	id: 'hr-agent',
	name: 'HR Agent',
	domain: 'hr',
	version: '0.1.0',
	description:
		'Domain-bounded agent for HR leave: list pending requests, submit a leave request as the current employee, and approve a pending request.',
	canHandle: ['list_pending_leave', 'submit_leave', 'approve_leave'],
	cannotHandle: [
		'reject_leave',
		'edit_employee_master_data',
		'edit_compensation',
		'run_payroll',
		'manage_attendance',
		'manage_overtime',
		'delete_record'
	],
	forbiddenActions: [
		'delete_record',
		'edit_employee_master_data',
		'edit_compensation',
		'settle_payout',
		'bypass_confirmation',
		'bypass_validation'
	]
};
