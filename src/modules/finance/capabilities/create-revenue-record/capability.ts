import { createFinanceApi } from '../../api';
import type { FinanceCapability } from '../types';
import {
	createRevenueRecordInputSchema,
	type CreateRevenueRecordInput,
	type CreateRevenueRecordOutput
} from './schema';

/**
 * R4 governed write (plan Phase 8): persist a reviewed revenue record. Forwards
 * to `createFinanceApi(ctx).revenue.createRevenue`. Registered with
 * `sideEffect: 'write'` + `requiresConfirmation: true`; denied without a
 * confirmationRef. Replaces the direct `finance.revenue.createRevenue` call in
 * `confirmInbox`.
 */
export const createRevenueRecordCapability: FinanceCapability<
	CreateRevenueRecordInput,
	CreateRevenueRecordOutput
> = {
	id: 'finance.create-revenue-record',
	description: 'Persist a confirmed revenue / customer-invoice record to the finance ledger.',
	riskLevel: 'R4',
	inputSchema: createRevenueRecordInputSchema,

	async execute(input, ctx): Promise<CreateRevenueRecordOutput> {
		if (!ctx.moduleContext) {
			throw new Error('finance.create-revenue-record requires a module context');
		}
		const created = await createFinanceApi(ctx.moduleContext).revenue.createRevenue(input);
		return { id: created.id };
	}
};
