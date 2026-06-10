import type { ModuleContext } from '$platform/modules/types';
import { createFinanceBillingApi, type FinanceBillingApi } from './billing-service';
import { createCategoryService, type CategoryServiceApi } from './category-service';
import { createFinanceDocumentApi, type FinanceDocumentsApi } from './document-service';
import { createFinanceEInvoiceApi, type FinanceEInvoiceApi } from './einvoice-service';
import { createFinanceExpenseApi, type FinanceExpensesApi } from './expense-service';
import { createFinanceInsightApi, type FinanceInsightsApi } from './insight-service';
import { createFinanceRevenueApi, type FinanceRevenueApi } from './revenue-service';
import { createFinanceTaxApi, type FinanceTaxesApi } from './tax-service';

/**
 * SDK-for-code surface shape — the groups routes / other modules / jobs call
 * via createFinanceApi(ctx). (Formerly contracts/inbound.ts FinanceInboundContract.)
 */
export interface FinanceApi {
	documents: FinanceDocumentsApi;
	billing: FinanceBillingApi;
	expenses: FinanceExpensesApi;
	revenue: FinanceRevenueApi;
	taxes: FinanceTaxesApi;
	insights: FinanceInsightsApi;
	categories: CategoryServiceApi;
	einvoice: FinanceEInvoiceApi;
}

export const FINANCE_PUBLIC_GROUPS = [
	'documents',
	'billing',
	'expenses',
	'revenue',
	'taxes',
	'insights',
	'categories',
	'einvoice'
] as const;

export type FinancePublicGroup = (typeof FINANCE_PUBLIC_GROUPS)[number];

export function createFinanceApi(ctx: ModuleContext): FinanceApi {
	return {
		documents: createFinanceDocumentApi(ctx),
		billing: createFinanceBillingApi(ctx),
		expenses: createFinanceExpenseApi(ctx),
		revenue: createFinanceRevenueApi(ctx),
		taxes: createFinanceTaxApi(ctx),
		insights: createFinanceInsightApi(ctx),
		categories: createCategoryService(ctx),
		einvoice: createFinanceEInvoiceApi(ctx)
	};
}
