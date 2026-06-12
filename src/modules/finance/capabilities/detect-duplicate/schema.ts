import { z } from 'zod';

const duplicateCandidateSchema = z.object({
	documentNumber: z.string().nullish(),
	amount: z.number().nullish(),
	counterparty: z.string().nullish()
});

/** Agent-facing input contract for `finance.detect-duplicate`. */
export const detectDuplicateInputSchema = z.object({
	candidate: duplicateCandidateSchema,
	existing: z.array(duplicateCandidateSchema)
});
