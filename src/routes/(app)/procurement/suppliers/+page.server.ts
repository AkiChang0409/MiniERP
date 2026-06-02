import type { PageServerLoad, Actions } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { createModuleContext } from '$platform/modules';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async (event) => {
	const q = (event.url.searchParams.get('q') ?? '').trim().toLowerCase();
	const project = (event.url.searchParams.get('project') ?? '').trim().toLowerCase();
	const status = (event.url.searchParams.get('status') ?? '').trim().toLowerCase();

	if (!event.platform) {
		return {
			filters: { q, project, status },
			projectOptions: [] as string[],
			suppliers: [] as {
				id: string;
				name: string;
				contact: string | null;
				address: string | null;
				profile: {
					supplierType: string;
					supplierStatus: string;
					acraUen: string | null;
					businessRegistrationNo: string | null;
					gstRegistrationStatus: string;
					taxCode: string | null;
					paymentTerms: string | null;
					creditTerms: string | null;
				} | null;
				itemDescription: string | null;
				dateCreate: string | null;
				projectRelated: string | null;
				contacts: Array<{
					id: string;
					name: string;
					phoneEmail: string | null;
					wechat: string | null;
					position: string | null;
				}>;
			}[]
		};
	}

	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const rows = await procurement.listSuppliers();
	const contacts = await procurement.listPartnerContacts(rows.map((r) => r.id));
	const byPartnerId = new Map<string, typeof contacts>();
	for (const c of contacts) {
		const list = byPartnerId.get(c.partnerId) ?? [];
		list.push(c);
		byPartnerId.set(c.partnerId, list);
	}
	const suppliers = [...rows].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
	const normalized = suppliers.map((s) => ({
		id: s.id,
		name: s.name,
		contact: s.contact ?? null,
		address: s.address ?? null,
		profile: s.profile
			? {
					supplierType: s.profile.supplierType,
					supplierStatus: s.profile.supplierStatus,
					acraUen: s.profile.acraUen ?? null,
					businessRegistrationNo: s.profile.businessRegistrationNo ?? null,
					gstRegistrationStatus: s.profile.gstRegistrationStatus,
					taxCode: s.profile.taxCode ?? null,
					paymentTerms: s.profile.paymentTerms ?? null,
					creditTerms: s.profile.creditTerms ?? null
				}
			: null,
		itemDescription: s.itemDescription ?? null,
		dateCreate: s.dateCreate ?? null,
		projectRelated: s.projectRelated ?? null,
		contacts: (byPartnerId.get(s.id) ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			phoneEmail: c.phoneEmail ?? null,
			wechat: c.wechat ?? null,
			position: c.position ?? null
		}))
	}));
	const projectOptions = Array.from(
		new Set(
			normalized
				.map((s) => s.projectRelated?.trim() ?? '')
				.filter((v) => v.length > 0)
		)
	).sort((a, b) => a.localeCompare(b));
	const filtered = normalized.filter((s) => {
		if (project && (s.projectRelated ?? '').toLowerCase() !== project) return false;
		if (status && (s.profile?.supplierStatus ?? '').toLowerCase() !== status) return false;
		if (!q) return true;
		const haystack = [
			s.name,
			s.contact ?? '',
			s.profile?.acraUen ?? '',
			s.profile?.businessRegistrationNo ?? '',
			s.profile?.taxCode ?? '',
			s.profile?.paymentTerms ?? '',
			s.profile?.creditTerms ?? '',
			s.itemDescription ?? '',
			s.projectRelated ?? '',
			s.address ?? '',
			...s.contacts.flatMap((c) => [c.name, c.phoneEmail ?? '', c.wechat ?? '', c.position ?? ''])
		]
			.join(' ')
			.toLowerCase();
		return haystack.includes(q);
	});

	return {
		filters: { q, project, status },
		projectOptions,
		suppliers: filtered
	};
};

export const actions: Actions = {
	delete: async (event) => {
		if (!event.platform) return fail(503, { error: 'Platform unavailable' });
		const data = await event.request.formData();
		const id = data.get('id');
		if (!id || typeof id !== 'string') return fail(400, { error: 'Missing id' });
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.deleteSupplier(id);
		return { success: true };
	}
};

