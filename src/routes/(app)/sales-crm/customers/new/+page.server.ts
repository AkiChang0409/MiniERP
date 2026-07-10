import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

import { createModuleContext } from '$platform/modules';
import { createSalesCrmApi } from '$modules/sales-crm';

export const actions: Actions = {
	default: async (event) => {
		if (!event.platform) {
			return fail(500, { message: 'Cloudflare platform bindings are required' });
		}

		const form = await event.request.formData();
		const name = String(form.get('name') ?? '').trim();
		const address = String(form.get('address') ?? '').trim();
		const contactName = String(form.get('contactName') ?? '').trim();
		const contactPosition = String(form.get('contactPosition') ?? '').trim();
		const contactPhone = String(form.get('contactPhone') ?? '').trim();
		const contactEmail = String(form.get('contactEmail') ?? '').trim();
		const gstRegNo = String(form.get('gstRegNo') ?? '').trim();

		if (!name) {
			return fail(400, { message: 'Customer name is required.' });
		}

		const ctx = await createModuleContext(event);
		const salesCrm = createSalesCrmApi(ctx);
		await salesCrm.createCustomer({
			name,
			address: address || undefined,
			contactName: contactName || undefined,
			contactPosition: contactPosition || undefined,
			contactPhone: contactPhone || undefined,
			contactEmail: contactEmail || undefined,
			isMainContact: true,
			gstRegNo: gstRegNo || undefined,
			metadata: undefined
		});

		throw redirect(303, '/sales-crm/customers');
	}
};

