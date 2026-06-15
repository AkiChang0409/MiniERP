import type { z } from 'zod';
import type { FinanceCapability, SuggestedNextTask } from '../types';
import { suggestNextTaskInputSchema } from './schema';

export type SuggestNextTaskInput = z.infer<typeof suggestNextTaskInputSchema>;

export interface SuggestNextTaskOutput {
	task: SuggestedNextTask | null;
	/** `service` when the suggest-next-task port served real data; `unavailable`
	 *  when no port was injected. */
	provider: 'service' | 'unavailable';
}

/**
 * Suggest the next finance task once the current workflow has completed. Thin
 * agent-facing tool: it forwards to the injected `suggestNextTask` port
 * (→ `finance-task-service.suggestNextFinanceTask`, the SDK-for-code source of
 * truth). It computes nothing itself.
 */
export const suggestNextFinanceTaskCapability: FinanceCapability<
	SuggestNextTaskInput,
	SuggestNextTaskOutput
> = {
	id: 'finance.suggest-next-finance-task',
	description: 'Suggest the next finance task once the current workflow has completed.',
	riskLevel: 'R1',
	inputSchema: suggestNextTaskInputSchema,

	async execute(input, ctx) {
		const task = await ctx.deps?.suggestNextTask?.(input);
		if (task === undefined) return { task: null, provider: 'unavailable' };
		return { task, provider: 'service' };
	}
};
