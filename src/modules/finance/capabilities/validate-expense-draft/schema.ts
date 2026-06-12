import { z } from 'zod';

/**
 * Agent-facing input contract for `finance.validate-expense-draft`.
 * The draft is validated against the deterministic finance expense schema
 * inside the capability (see `rules/validate-expense`), so the agent-level
 * contract accepts an arbitrary draft object.
 */
export const validateExpenseDraftInputSchema = z.unknown();
