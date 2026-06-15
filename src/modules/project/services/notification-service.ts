import type { ModuleContext } from '$platform/modules/types';
import { ProjectNotificationRepository, ProjectTaskRepository } from '../repositories';
import { ProjectPermissionError } from '../domain';

/**
 * In-app notification feed (Gantt P3). Project-scoped — no platform-wide
 * notification system exists yet.
 *
 * Overdue notifications are produced *lazily* when the user reads their feed
 * (there is no cron infrastructure in the project today). A deterministic
 * `dedupeKey` keeps repeated reads idempotent; the unique index on
 * (recipient_id, dedupe_key) is the final backstop against races.
 */
export class ProjectNotificationService {
	private notifRepo: ProjectNotificationRepository;
	private taskRepo: ProjectTaskRepository;

	constructor(private ctx: ModuleContext) {
		this.notifRepo = new ProjectNotificationRepository(ctx.db);
		this.taskRepo = new ProjectTaskRepository(ctx.db);
	}

	private requireUser() {
		const u = this.ctx.user;
		if (!u) throw new ProjectPermissionError('Sign in required.');
		return u;
	}

	/** Materialise overdue notifications for tasks assigned to the current user. */
	async syncOverdue() {
		const user = this.requireUser();
		const today = new Date().toISOString().slice(0, 10);
		const overdue = await this.taskRepo.overdueAssignedTo(user.id, today);
		for (const t of overdue) {
			const dedupeKey = `overdue:${t.id}:${t.endDate ?? ''}`;
			const existing = await this.notifRepo.findByDedupe(user.id, dedupeKey);
			if (existing) continue;
			try {
				await this.notifRepo.create({
					id: crypto.randomUUID(),
					recipientId: user.id,
					projectId: t.projectId,
					taskId: t.id,
					kind: 'overdue',
					message: `Task "${t.name}" is overdue (due ${t.endDate}).`,
					isRead: false,
					dedupeKey
				});
			} catch {
				/* unique (recipient, dedupeKey) race — another request beat us */
			}
		}
	}

	async list(opts?: { unreadOnly?: boolean }) {
		const user = this.requireUser();
		await this.syncOverdue();
		const [items, unreadCount] = await Promise.all([
			this.notifRepo.listForUser(user.id, opts),
			this.notifRepo.unreadCount(user.id)
		]);
		return { items, unreadCount };
	}

	async markRead(id: string) {
		const user = this.requireUser();
		await this.notifRepo.markRead(id, user.id);
		return { ok: true };
	}

	async markAllRead() {
		const user = this.requireUser();
		await this.notifRepo.markAllRead(user.id);
		return { ok: true };
	}
}
