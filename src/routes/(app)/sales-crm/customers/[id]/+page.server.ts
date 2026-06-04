import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';
import { NotFoundError } from '$platform/modules/errors';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const salesCrm = createSalesCrmApi(ctx);
	try {
		const detail = await salesCrm.getCustomerDetail(event.params.id);
		return detail;
	} catch (e) {
		if (e instanceof NotFoundError) throw error(404, 'Customer not found');
		throw error(500, (e as Error).message);
	}
};

function num(v: FormDataEntryValue | null) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

export const actions: Actions = {
	updateCustomer: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.updateCustomer(
			event.params.id,
			{
				name: String(f.get('name') ?? ''),
				address: String(f.get('address') ?? ''),
				contact: String(f.get('contact') ?? ''),
				gstRegNo: String(f.get('gstRegNo') ?? ''),
				registrationNo: String(f.get('registrationNo') ?? ''),
				country: String(f.get('country') ?? ''),
				currency: String(f.get('currency') ?? '')
			},
			{
				customerStatus: (String(f.get('customerStatus') ?? 'active') as any) || 'active',
				customerTier: String(f.get('customerTier') ?? ''),
				gstRegistrationStatus:
					(String(f.get('gstRegistrationStatus') ?? 'unknown') as any) || 'unknown',
				taxCode: (String(f.get('taxCode') ?? '') as any) || undefined,
				billingAddress: String(f.get('billingAddress') ?? ''),
				shippingAddress: String(f.get('shippingAddress') ?? ''),
				billingTerms: String(f.get('billingTerms') ?? ''),
				creditTerms: String(f.get('creditTerms') ?? ''),
				creditLimit: num(f.get('creditLimit')),
				preferredCurrency: String(f.get('preferredCurrency') ?? '')
			}
		);
		return { success: true };
	},

	setCreditHold: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.setCreditHold(event.params.id, {
			hold: f.get('hold') === 'true',
			reason: String(f.get('reason') ?? '')
		});
		return { success: true };
	},

	addContact: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.addCustomerContact(event.params.id, {
			name: String(f.get('name') ?? ''),
			phoneEmail: String(f.get('phoneEmail') ?? ''),
			position: String(f.get('position') ?? ''),
			isPrimary: f.get('isPrimary') === 'on'
		});
		return { success: true };
	},

	deleteContact: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.deleteCustomerContact(String(f.get('id') ?? ''));
		return { success: true };
	},

	logCommunication: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.logCommunication(event.params.id, {
			channel: (String(f.get('channel') ?? 'note') as any) || 'note',
			subject: String(f.get('subject') ?? ''),
			body: String(f.get('body') ?? ''),
			occurredAt: String(f.get('occurredAt') ?? ''),
			contactName: String(f.get('contactName') ?? '')
		});
		return { success: true };
	},

	addAttachment: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.addCustomerAttachment(event.params.id, {
			attachmentType: (String(f.get('attachmentType') ?? 'contract') as any) || 'contract',
			title: String(f.get('title') ?? ''),
			fileName: String(f.get('fileName') ?? ''),
			fileUrl: String(f.get('fileUrl') ?? ''),
			expiryDate: String(f.get('expiryDate') ?? '')
		});
		return { success: true };
	},

	deleteAttachment: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.deleteCustomerAttachment(String(f.get('id') ?? ''));
		return { success: true };
	},

	createPriceList: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.createPriceList({
			partnerId: event.params.id,
			name: String(f.get('name') ?? ''),
			currency: String(f.get('currency') ?? 'SGD'),
			validFrom: String(f.get('validFrom') ?? ''),
			validTo: String(f.get('validTo') ?? '')
		});
		return { success: true };
	},

	addPriceListItem: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.addPriceListItem(String(f.get('priceListId') ?? ''), {
			itemCode: String(f.get('itemCode') ?? ''),
			description: String(f.get('description') ?? ''),
			uom: String(f.get('uom') ?? 'unit'),
			unitPrice: num(f.get('unitPrice')),
			minQuantity: num(f.get('minQuantity')),
			discountPct: num(f.get('discountPct'))
		});
		return { success: true };
	},

	deletePriceList: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.deletePriceList(String(f.get('id') ?? ''));
		return { success: true };
	},

	deletePriceListItem: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const f = await event.request.formData();
		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.deletePriceListItem(String(f.get('id') ?? ''));
		return { success: true };
	}
};
