import type { ModuleContext } from '$platform/modules/types';

/**
 * Project profit summary. Cross-module figures (revenue / purchase cost / staff
 * cost / expense sums) are passed in via `deps` — the route wires them from
 * finance + hr APIs, keeping this service free of cross-module imports. This is
 * the gateway-injection seam formalised in `integrations/` (Phase C).
 *
 * Future capability: `project.financials`.
 */
export class ProjectFinancialsService {
	constructor(_ctx: ModuleContext) {}

	async getProjectFinancials(
		projectId: string,
		deps: {
			getRevenue: () => Promise<number>;
			getPurchaseCost: () => Promise<number>;
			getStaffCost: () => Promise<number>;
			getExpenseSums: () => Promise<{ cogs: number; opex: number }>;
		}
	) {
		void projectId;
		const [revenue, purchaseCost, staffCost, expenseSums] = await Promise.all([
			deps.getRevenue(),
			deps.getPurchaseCost(),
			deps.getStaffCost(),
			deps.getExpenseSums()
		]);

		const expenseCogs = expenseSums.cogs;
		const expenseOpex = expenseSums.opex;
		const grossProfit = revenue - purchaseCost - staffCost - expenseCogs;
		const netProfit = grossProfit - expenseOpex;
		const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

		return {
			revenue,
			purchaseCost,
			staffCost,
			expenseCogs,
			expenseOpex,
			grossProfit,
			netProfit,
			margin: Math.round(margin * 100) / 100
		};
	}
}
