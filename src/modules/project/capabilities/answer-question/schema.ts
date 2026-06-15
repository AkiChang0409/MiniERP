import { z } from 'zod';

/** Agent-facing input contract for `project.answer-question`. */
export const AnswerQuestionInputSchema = z.object({
	question: z.string().min(1),
	contextBundle: z.object({
		project: z.object({
			id: z.string(),
			name: z.string(),
			status: z.string(),
			deadline: z.string().nullable()
		}),
		tasks: z.array(
			z.object({
				id: z.string(),
				name: z.string(),
				status: z.string(),
				assignee: z.string().nullable()
			})
		),
		recentComments: z.array(
			z.object({
				author: z.string(),
				body: z.string(),
				createdAt: z.string()
			})
		),
		attachments: z.array(
			z.object({
				id: z.string(),
				fileName: z.string()
			})
		)
	})
});
