import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

import { createModuleContext } from '$platform/modules';
import { createFinanceApi } from '$modules/finance';
import type { ExpenseType } from '$modules/finance/domain/expense-upload';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return { expenses: [], employees: [], totals: { total: 0, opex: 0, salesCost: 0 } };
	}

	const ctx = await createModuleContext(event);
	const { expenses } = createFinanceApi(ctx);
	return expenses.getExpenseListPage();
};

export const actions: Actions = {
	create: async (event) => {
		const { request, platform } = event;
		if (!platform) {
			return fail(500, { error: 'Platform not available' });
		}

		const formData = await request.formData();
		const now = new Date().toISOString();

		const expenseType = (formData.get('expenseType') as ExpenseType) || 'opex';
		const category = (formData.get('category') as string) || 'others';
		const amount = Number(formData.get('amount') || 0);
		const currency = String(formData.get('currency') || 'SGD').trim().toUpperCase();
		const date = String(formData.get('date') || now.slice(0, 10));
		const vendorOrSupplier = String(formData.get('vendorOrSupplier') || '') || null;
		const staffName = String(formData.get('staffName') || '') || null;
		const reimbursement = formData.get('reimbursement') === 'on';
		const businessTrip = formData.get('businessTrip') === 'on';
		const destination = String(formData.get('destination') || '') || null;
		const notes = String(formData.get('notes') || '') || null;

		const ctx = await createModuleContext(event);
		const { expenses } = createFinanceApi(ctx);
		await expenses.createStandaloneExpense({
			expenseType,
			category,
			amount,
			currency,
			date,
			vendorOrSupplier,
			staffName,
			reimbursement,
			businessTrip,
			destination,
			notes
		});

		return { success: true };
	}
};


