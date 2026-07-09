import { z } from 'zod';

export const ProjectAnswerInputSchema = z.object({
	question: z.string().min(1).describe('A natural-language question about the project portfolio.')
});

export const ProjectAnswerOutputSchema = z.object({
	answer: z.string().min(1),
	needsHuman: z.boolean()
});

export type ProjectAnswerInput = z.infer<typeof ProjectAnswerInputSchema>;
export type ProjectAnswerOutput = z.infer<typeof ProjectAnswerOutputSchema>;
