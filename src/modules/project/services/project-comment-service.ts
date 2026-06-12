import type { ModuleContext } from '$platform/modules/types';
import {
	ProjectCommentRepository,
	ProjectUserDirectory
} from '../repositories/project-repository';
import { ProjectPermissionError, ProjectValidationError } from '../domain';

/** Extract @-mention tokens. Tokens may be either a userId or an email-prefix. */
function extractMentionTokens(body: string): string[] {
	const matches = body.match(/@[A-Za-z0-9_.+\-]+/g);
	if (!matches) return [];
	return Array.from(new Set(matches.map((m) => m.slice(1))));
}

/**
 * Project comments with @-mention resolution (TKMGMT9).
 *
 * Future capability: `project.comment`.
 */
export class ProjectCommentService {
	private commentRepo: ProjectCommentRepository;
	private userDirectory: ProjectUserDirectory;

	constructor(private ctx: ModuleContext) {
		this.commentRepo = new ProjectCommentRepository(ctx.db);
		this.userDirectory = new ProjectUserDirectory(ctx.db);
	}

	async listComments(projectId: string) {
		const rows = await this.commentRepo.listForProject(projectId);
		return rows.map((c) => ({
			...c,
			mentions: c.mentions
				? (JSON.parse(c.mentions) as Array<{ userId: string; email: string; name: string }>)
				: []
		}));
	}

	async addComment(input: { projectId: string; body: string }) {
		const body = input.body.trim();
		if (!body) {
			throw new ProjectValidationError({ body: 'Comment body cannot be empty.' });
		}

		const user = this.ctx.user;
		if (!user) {
			throw new ProjectPermissionError('Sign in to post a comment.');
		}

		const tokens = extractMentionTokens(body);
		const resolvedMentions: Array<{ userId: string; email: string; name: string }> = [];
		if (tokens.length > 0) {
			// A token may be an exact userId, an email, or an email-prefix.
			for (const token of tokens) {
				const byEmail = await this.userDirectory.findByEmail(token);
				if (byEmail) {
					resolvedMentions.push({ userId: byEmail.id, email: byEmail.email, name: byEmail.name });
					continue;
				}
				const candidates = await this.userDirectory.findByEmailPrefix(token, 1);
				if (candidates.length > 0) {
					const u = candidates[0];
					resolvedMentions.push({ userId: u.id, email: u.email, name: u.name });
				}
			}
		}

		const id = crypto.randomUUID();
		await this.commentRepo.create({
			id,
			projectId: input.projectId,
			authorUserId: user.id,
			authorEmail: user.email,
			authorName: user.email.split('@')[0] ?? user.email,
			body,
			mentions: resolvedMentions.length > 0 ? JSON.stringify(resolvedMentions) : null
		});

		return { id, mentions: resolvedMentions };
	}
}
