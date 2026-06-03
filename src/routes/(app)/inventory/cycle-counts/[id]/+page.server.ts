import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { createInventoryApi } from '$modules/inventory';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(503, 'Platform unavailable');
	const ctx = await createModuleContext(event);
	const inventory = createInventoryApi(ctx);
	try {
		const detail = await inventory.getCycleCountDetail(event.params.id!);
		const warehouses = await inventory.listWarehouses();
		const warehouse = warehouses.find((w) => w.id === detail.session.warehouseId);
		const bins = warehouse ? await inventory.listBinsForWarehouse(warehouse.id) : [];
		const binsById = Object.fromEntries(bins.map((b) => [b.id, b]));
		const items = await inventory.listItems();
		const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
		return {
			session: detail.session,
			lines: detail.lines.map((line) => ({
				...line,
				item: itemsById[line.itemId] ?? null,
				bin: binsById[line.binLocationId] ?? null
			})),
			warehouse
		};
	} catch (e) {
		if ((e as { code?: string }).code === 'NOT_FOUND') throw error(404, 'Cycle count not found');
		throw e;
	}
};

export const actions: Actions = {
	record: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const data = await event.request.formData();
		const lineIds = data.getAll('line_id');
		const counts = data.getAll('counted_qty');
		const notesAll = data.getAll('line_notes');
		const records: Array<{ lineId: string; countedQuantity: number; notes?: string }> = [];
		for (let i = 0; i < lineIds.length; i++) {
			const lineId = String(lineIds[i] ?? '');
			const raw = String(counts[i] ?? '').trim();
			if (!lineId || raw === '') continue;
			const q = Number(raw);
			if (!Number.isFinite(q)) continue;
			records.push({ lineId, countedQuantity: q, notes: String(notesAll[i] ?? '').trim() || undefined });
		}
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.recordCycleCounts(event.params.id!, records);
			return { recorded: records.length };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	post: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.postCycleCount(event.params.id!);
			return { posted: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	cancel: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			await inventory.cancelCycleCount(event.params.id!);
			return { cancelled: true };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},

	attachDocument: async (event) => {
		if (!event.platform) return fail(503, { message: 'Platform unavailable' });
		const form = await event.request.formData();
		const file = form.get('file');
		const manualRef = String(form.get('documentRef') ?? '').trim();
		const sessionId = event.params.id!;
		try {
			const ctx = await createModuleContext(event);
			const inventory = createInventoryApi(ctx);
			if (file instanceof File && file.size > 0) {
				const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'signed-count.pdf';
				const key = `cycle-counts/${sessionId}/${Date.now()}-${safeName}`;
				await event.platform.env.R2.put(key, await file.arrayBuffer(), {
					httpMetadata: { contentType: file.type || 'application/octet-stream' }
				});
				await inventory.attachCycleCountDocument(sessionId, {
					documentRef: `r2:${key}`,
					fileName: file.name,
					contentType: file.type || 'application/octet-stream',
					sizeBytes: file.size
				});
				return { documentAttached: true, fileName: file.name };
			}
			if (manualRef) {
				await inventory.attachCycleCountDocument(sessionId, { documentRef: manualRef });
				return { documentAttached: true, fileName: manualRef };
			}
			return fail(400, { message: 'Upload a file or provide a manual reference.' });
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	}
};
