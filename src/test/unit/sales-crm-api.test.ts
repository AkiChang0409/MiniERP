import { describe, expect, it } from 'vitest';
import { createSalesCrmApi } from '$modules/sales-crm/api';

describe('createSalesCrmApi', () => {
	it('fails fast when the Lark Business Partner table is not configured', () => {
		expect(() =>
			createSalesCrmApi({
				db: {},
				env: {}
			} as never)
		).toThrow(/LARK_BP_TABLE_ID is required/);
	});

	it('fails fast when the Bitable Base app token is not configured', () => {
		expect(() =>
			createSalesCrmApi({
				db: {},
				env: { LARK_BP_TABLE_ID: 'bp_table' }
			} as never)
		).toThrow(/LARK_BITABLE_APP_TOKEN is required/);
	});
});
