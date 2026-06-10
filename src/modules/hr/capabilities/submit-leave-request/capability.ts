import { resolveCurrentPersonId } from '$platform/auth/resolve-current-person';
import { createEmployeeLeaveApi } from '../../employee-leave-api';
import type { HrCapability } from '../types';
import {
	submitLeaveRequestInputSchema,
	submitLeaveRequestOutputSchema,
	type SubmitLeaveRequestInput,
	type SubmitLeaveRequestOutput
} from './schema';

/**
 * Write (R4, requires confirmation): submit a leave request as the CURRENT
 * employee. personId is resolved from the bound login user via
 * resolveCurrentPersonId — never taken from `input`. Then it goes through the
 * employee self-service facade, which itself injects the personId and does not
 * expose approve/reject.
 */
export const submitLeaveRequestCapability: HrCapability<
	SubmitLeaveRequestInput,
	SubmitLeaveRequestOutput
> = {
	id: 'hr.submit-leave-request',
	description: 'Submit a leave request on behalf of the current employee (self-service).',
	riskLevel: 'R4',
	inputSchema: submitLeaveRequestInputSchema,
	outputSchema: submitLeaveRequestOutputSchema,
	idempotencyKey: (input) => {
		const i = input as SubmitLeaveRequestInput;
		return `hr.submit-leave-request:${i.leaveTypeId}:${i.startDate}:${i.endDate}`;
	},

	async execute(input, ctx) {
		const mc = ctx.moduleContext;
		if (!mc) {
			throw new Error('hr.submit-leave-request requires a moduleContext');
		}

		// Identity is resolved server-side from the bound login user. A personId
		// in the input would be ignored — there is no such field in the schema.
		const personId = await resolveCurrentPersonId(mc.db, mc.user?.id);
		if (!personId) {
			throw new Error('Your account is not linked to an employee profile.');
		}

		const api = createEmployeeLeaveApi(mc, personId);
		if ((await api.getProfileStatus()) !== 'active') {
			throw new Error('Your employee profile is not active.');
		}

		const result = await api.submitRequest({
			leaveTypeId: input.leaveTypeId,
			startDate: input.startDate,
			endDate: input.endDate,
			reason: input.reason
		});
		return { id: result.id, totalDays: result.totalDays, status: result.status };
	}
};
