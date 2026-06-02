import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import {
	createProjectApi,
	ProjectPermissionError,
	ProjectValidationError
} from '$modules/project';
import { createEmployeeApi } from '$modules/hr';
import { createFinanceApi } from '$modules/finance';
import { NotFoundError } from '$platform/modules/errors';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		const finance = createFinanceApi(ctx);
		const billing = finance.billing;
		const employee = createEmployeeApi(ctx);
		const expenses = finance.expenses;

		const p = await project.getById(event.params.id);

		const financials = await project.getProjectFinancials(event.params.id, {
			getRevenue: () => billing.getProjectRevenue(event.params.id),
			getPurchaseCost: () => billing.getProjectPurchaseCost(event.params.id),
			getStaffCost: () => employee.getProjectStaffCost(event.params.id),
			getExpenseSums: async () => {
				const sums = await expenses.getProjectExpenseSums(event.params.id);
				return { cogs: sums.salesCost, opex: sums.opex };
			}
		});

		return ok({
			...p,
			profit: {
				revenue: financials.revenue,
				cost:
					financials.purchaseCost +
					financials.staffCost +
					financials.expenseCogs +
					financials.expenseOpex,
				net: financials.netProfit
			}
		});
	} catch (e) {
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const PATCH: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		const body = (await event.request.json()) as {
			name?: string;
			status?: string;
			description?: string | null;
			notes?: string | null;
			startDate?: string | null;
			endDate?: string | null;
			deadline?: string | null;
			priority?: number | null;
			attachmentUrl?: string | null;
			attachmentName?: string | null;
			recurrenceFrequency?: 'daily' | 'weekly' | 'monthly' | 'custom' | null;
			recurrenceInterval?: number | null;
			ownerId?: string | null;
		};

		const updates: Record<string, unknown> = {};
		const allowed = [
			'name',
			'status',
			'description',
			'notes',
			'startDate',
			'endDate',
			'deadline',
			'priority',
			'attachmentUrl',
			'attachmentName',
			'recurrenceFrequency',
			'recurrenceInterval',
			'ownerId'
		] as const;
		for (const key of allowed) {
			if (Object.prototype.hasOwnProperty.call(body, key)) {
				updates[key] = (body as Record<string, unknown>)[key];
			}
		}

		await project.update(event.params.id, updates);
		return ok({ id: event.params.id, updated: true });
	} catch (e) {
		if (e instanceof ProjectValidationError) {
			return fail(e.message + ': ' + Object.values(e.fields).join('; '), 400);
		}
		if (e instanceof ProjectPermissionError) {
			return fail(e.message, 403);
		}
		if (e instanceof NotFoundError) return fail(e.message, 404);
		return fail((e as Error).message, 500);
	}
};

export const DELETE: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);

		await project.softDelete(event.params.id);

		return ok({ id: event.params.id, deleted: true });
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};
