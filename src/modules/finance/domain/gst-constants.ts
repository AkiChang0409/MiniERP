/**
 * Singapore GST constants aligned with IRAS requirements.
 * Rate effective from 1 Jan 2024 per Budget 2022 announcement.
 */

export const SG_GST_RATE = 0.09;
export const SG_GST_RATE_PERCENT = 9;

export const GST_SUPPLY_CODES = ['SR', 'ZR', 'ES', 'OP'] as const;
export type GstSupplyCode = (typeof GST_SUPPLY_CODES)[number];

export const GST_SUPPLY_CODE_LABELS: Record<GstSupplyCode, string> = {
	SR: 'Standard-Rated',
	ZR: 'Zero-Rated',
	ES: 'Exempt Supply',
	OP: 'Out-of-Scope Supply'
};

export const GST_SUPPLY_CODE_RATE: Record<GstSupplyCode, number> = {
	SR: SG_GST_RATE,
	ZR: 0,
	ES: 0,
	OP: 0
};

export const INVOICE_TYPE_TO_GST_CODE: Record<string, GstSupplyCode> = {
	standard: 'SR',
	tax_invoice: 'SR',
	zero_rate: 'ZR',
	exempt: 'ES',
	out_of_scope: 'OP'
};

export const GST_CODE_TO_INVOICE_TYPES: Record<GstSupplyCode, string[]> = {
	SR: ['standard', 'tax_invoice'],
	ZR: ['zero_rate'],
	ES: ['exempt'],
	OP: ['out_of_scope']
};

export function calcGstFromSubtotal(subtotal: number, rate = SG_GST_RATE): number {
	return Math.round(subtotal * rate * 100) / 100;
}

export function calcGstFromGrossAmount(gross: number, rate = SG_GST_RATE): number {
	return Math.round((gross * rate) / (1 + rate) * 100) / 100;
}

export function calcSubtotalFromGross(gross: number, rate = SG_GST_RATE): number {
	return Math.round((gross / (1 + rate)) * 100) / 100;
}

export function resolveGstCode(invoiceType: string | null, gstCode: string | null): GstSupplyCode {
	if (gstCode && GST_SUPPLY_CODES.includes(gstCode as GstSupplyCode)) {
		return gstCode as GstSupplyCode;
	}
	return INVOICE_TYPE_TO_GST_CODE[invoiceType ?? 'standard'] ?? 'SR';
}
