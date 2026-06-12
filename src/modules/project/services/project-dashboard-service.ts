import type { ModuleContext } from '$platform/modules/types';
import { ProjectRepository } from '../repositories/project-repository';

/**
 * Project portfolio dashboard + calendar entries (TKMGMT8 / TKMGMT10).
 *
 * Future capabilities: `project.dashboard` / `project.calendar`.
 */
export class ProjectDashboardService {
	private repo: ProjectRepository;

	constructor(_ctx: ModuleContext) {
		this.repo = new ProjectRepository(_ctx.db);
	}

	async getDashboard() {
		const now = new Date();
		const todayIso = now.toISOString().slice(0, 10);
		const inSevenDays = new Date(now);
		inSevenDays.setDate(inSevenDays.getDate() + 7);
		const inSevenIso = inSevenDays.toISOString().slice(0, 10);

		const [statusSummary, upcoming, overdue] = await Promise.all([
			this.repo.getStatusSummary(),
			this.repo.getUpcomingDeadlines({ fromIso: todayIso, toIso: inSevenIso, limit: 5 }),
			this.repo.getOverdue({ nowIso: todayIso })
		]);

		return {
			generatedAt: now.toISOString(),
			statusSummary,
			upcoming,
			overdue,
			lookahead: { from: todayIso, to: inSevenIso }
		};
	}

	async getCalendarEntries(opts: { fromIso: string; toIso: string }) {
		return this.repo.getCalendarEntries(opts);
	}
}
