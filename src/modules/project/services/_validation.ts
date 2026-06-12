import { ProjectValidationError } from '../domain';

/** Required fields per TKMGMT1 / TKMGMT2 acceptance criteria. */
export function validateRequired(
	name: string | undefined,
	deadline: string | null | undefined
) {
	const fields: Record<string, string> = {};
	if (name !== undefined && (!name || !name.trim())) {
		fields.name = 'Project name is required.';
	}
	if (deadline !== undefined && (!deadline || !String(deadline).trim())) {
		fields.deadline = 'Deadline is required.';
	}
	if (Object.keys(fields).length > 0) throw new ProjectValidationError(fields);
}
