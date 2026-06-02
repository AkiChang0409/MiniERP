import type { ItemAttachmentInput, ItemBarcodeInput, ItemInput } from '$modules/inventory';

export function parseItemFormData(data: FormData): ItemInput {
	const get = (key: string) => {
		const v = data.get(key);
		return typeof v === 'string' ? v.trim() : '';
	};
	const getNumber = (key: string): number | undefined => {
		const v = data.get(key);
		if (typeof v !== 'string' || v.trim() === '') return undefined;
		const num = Number(v);
		return Number.isFinite(num) ? num : undefined;
	};
	const getBool = (key: string) => data.get(key) === 'on' || data.get(key) === 'true';

	const barcodes: ItemBarcodeInput[] = [];
	const barcodeValues = data.getAll('barcode_value');
	const barcodeTypes = data.getAll('barcode_type');
	const barcodePackaging = data.getAll('barcode_packaging');
	const barcodePrimary = data.getAll('barcode_is_primary');
	for (let i = 0; i < barcodeValues.length; i++) {
		const value = String(barcodeValues[i] ?? '').trim();
		if (!value) continue;
		barcodes.push({
			barcodeValue: value,
			barcodeType: String(barcodeTypes[i] ?? 'code128') as ItemBarcodeInput['barcodeType'],
			packagingLevel: String(barcodePackaging[i] ?? 'each') as ItemBarcodeInput['packagingLevel'],
			isPrimary: String(barcodePrimary[i] ?? 'false') === 'true'
		});
	}

	const attachments: ItemAttachmentInput[] = [];
	const attTitles = data.getAll('attachment_title');
	const attTypes = data.getAll('attachment_type');
	const attUrls = data.getAll('attachment_url');
	const attFileNames = data.getAll('attachment_filename');
	const attMimes = data.getAll('attachment_mime');
	const attPrimary = data.getAll('attachment_is_primary_image');
	for (let i = 0; i < attTitles.length; i++) {
		const title = String(attTitles[i] ?? '').trim();
		if (!title) continue;
		attachments.push({
			title,
			attachmentType: String(attTypes[i] ?? 'other') as ItemAttachmentInput['attachmentType'],
			fileUrl: String(attUrls[i] ?? '').trim() || undefined,
			fileName: String(attFileNames[i] ?? '').trim() || undefined,
			mimeType: String(attMimes[i] ?? '').trim() || undefined,
			isPrimaryImage: String(attPrimary[i] ?? 'false') === 'true'
		});
	}

	return {
		code: get('code'),
		name: get('name'),
		description: get('description') || undefined,
		itemType: (get('itemType') as any) || 'raw_material',
		status: (get('status') as any) || 'active',
		category: get('category') || undefined,
		uom: get('uom') || 'unit',
		uomCategory: get('uomCategory') || undefined,
		preferredSupplierId: get('preferredSupplierId') || undefined,
		reorderPoint: getNumber('reorderPoint'),
		minLevel: getNumber('minLevel'),
		maxLevel: getNumber('maxLevel'),
		leadTimeDays: getNumber('leadTimeDays'),
		lotControl: getBool('lotControl'),
		serialControl: getBool('serialControl'),
		shelfLifeDays: getNumber('shelfLifeDays'),
		valuationMethod: (get('valuationMethod') as any) || 'weighted_average',
		standardCost: getNumber('standardCost'),
		lastCost: getNumber('lastCost'),
		averageCost: getNumber('averageCost'),
		currency: get('currency') || 'SGD',
		primaryImageUrl: get('primaryImageUrl') || undefined,
		notes: get('notes') || undefined,
		barcodes,
		attachments
	};
}
