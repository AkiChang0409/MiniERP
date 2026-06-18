import { z } from 'zod';

export const answerFinanceQuestionInputSchema = z.object({
	question: z.string().min(1).describe('A natural-language question about company finances.')
});

export type AnswerFinanceQuestionInput = z.infer<typeof answerFinanceQuestionInputSchema>;

export const answerFinanceQuestionOutputSchema = z.object({
	answer: z.string().min(1),
	needsHuman: z.boolean()
});

export type AnswerFinanceQuestionOutput = z.infer<typeof answerFinanceQuestionOutputSchema>;
