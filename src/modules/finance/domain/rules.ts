/**
 * Canonical domain-rules barrel. Pure business rules, no route/DB wiring.
 */
export { validateExpenseRecord } from './validate-expense';
export { validateRevenueRecord } from './validate-revenue';
export { detectDuplicateFinanceRecord } from './detect-duplicate';
export { estimateSingaporeResidentTax } from './estimate-singapore-resident-tax';
export {
	SG_GST_RATE,
	SG_GST_RATE_PERCENT,
	GST_SUPPLY_CODES,
	GST_SUPPLY_CODE_LABELS,
	GST_SUPPLY_CODE_RATE,
	INVOICE_TYPE_TO_GST_CODE,
	GST_CODE_TO_INVOICE_TYPES,
	calcGstFromSubtotal,
	calcGstFromGrossAmount,
	calcSubtotalFromGross,
	resolveGstCode
} from './gst-constants';
export type { GstSupplyCode } from './gst-constants';
