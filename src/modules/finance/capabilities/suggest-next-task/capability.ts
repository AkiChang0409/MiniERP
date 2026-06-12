import type { FinanceCapability } from '../types';
import { suggestNextTaskInputSchema } from './schema';
import { pickFollowUp, type SuggestedNextTask } from './mock';

export interface SuggestNextTaskInput {
	afterWorkflowId?: string;
	afterSupplierName?: string;
}

export interface SuggestNextTaskOutput {
	task: SuggestedNextTask | null;
	provider: 'mock-v1';
}

export const suggestNextFinanceTaskCapability: FinanceCapability<
	SuggestNextTaskInput,
	SuggestNextTaskOutput
> = {
	id: 'finance.suggest-next-finance-task',
	description: 'Suggest the next finance task once the current workflow has completed.',
	riskLevel: 'R1',
	inputSchema: suggestNextTaskInputSchema,

	async execute(input) {
		const task = pickFollowUp({ afterSupplierName: input.afterSupplierName });
		return { task, provider: 'mock-v1' };
	}
};
