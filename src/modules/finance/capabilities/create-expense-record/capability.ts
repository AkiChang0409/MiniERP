import { createFinanceApi } from '../../api';
import type { FinanceCapability } from '../types';
import {
	createExpenseRecordInputSchema,
	type CreateExpenseRecordInput,
	type CreateExpenseRecordOutput
} from './schema';

/**
 * R4 governed write (plan Phase 8): persist a reviewed expense record. Forwards
 * to the finance api facade (`createFinanceApi(ctx).expenses.create`) — the
 * single business-truth path. Registered with `sideEffect: 'write'` +
 * `requiresConfirmation: true`, so the governed runtime (executeGuardedCapability /
 * runGovernedCapability) denies it without a confirmationRef. This replaces the
 * direct `finance.expenses.create` call that `confirmInbox` used to make, so the
 * Lark + web confirm paths now go through one policy + audit gate.
 */
export const createExpenseRecordCapability: FinanceCapability<
	CreateExpenseRecordInput,
	CreateExpenseRecordOutput
> = {
	id: 'finance.create-expense-record',
	description: 'Persist a confirmed expense record to the finance ledger.',
	riskLevel: 'R4',
	inputSchema: createExpenseRecordInputSchema,

	async execute(input, ctx): Promise<CreateExpenseRecordOutput> {
		if (!ctx.moduleContext) {
			throw new Error('finance.create-expense-record requires a module context');
		}
		const created = await createFinanceApi(ctx.moduleContext).expenses.create(input);
		return { id: created.id };
	}
};
