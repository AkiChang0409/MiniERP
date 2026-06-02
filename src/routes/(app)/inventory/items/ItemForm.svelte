<script lang="ts">
	type Barcode = {
		_uiId: string;
		barcodeValue: string;
		barcodeType: string;
		packagingLevel: string;
		isPrimary: boolean;
	};

	type Attachment = {
		_uiId: string;
		attachmentType: string;
		title: string;
		fileName: string;
		fileUrl: string;
		mimeType: string;
		isPrimaryImage: boolean;
	};

	type Initial = {
		code?: string;
		name?: string;
		description?: string;
		itemType?: string;
		status?: string;
		category?: string;
		uom?: string;
		uomCategory?: string;
		preferredSupplierId?: string;
		reorderPoint?: number | null;
		minLevel?: number | null;
		maxLevel?: number | null;
		leadTimeDays?: number | null;
		lotControl?: boolean;
		serialControl?: boolean;
		shelfLifeDays?: number | null;
		valuationMethod?: string;
		standardCost?: number | null;
		lastCost?: number | null;
		averageCost?: number | null;
		currency?: string;
		primaryImageUrl?: string;
		notes?: string;
		barcodes?: Array<{
			barcodeValue: string;
			barcodeType: string;
			packagingLevel: string;
			isPrimary: boolean;
		}>;
		attachments?: Array<{
			attachmentType: string;
			title: string;
			fileName: string | null;
			fileUrl: string | null;
			mimeType: string | null;
			isPrimaryImage: boolean;
		}>;
	};

	let {
		initial = {},
		suppliers,
		message,
		submitLabel = 'Save item',
		action = ''
	}: {
		initial?: Initial;
		suppliers: Array<{ id: string; name: string }>;
		message?: string | null;
		submitLabel?: string;
		action?: string;
	} = $props();

	const seed = initial as Initial;
	let code = $state(seed.code ?? '');
	let name = $state(seed.name ?? '');
	let description = $state(seed.description ?? '');
	let itemType = $state(seed.itemType ?? 'raw_material');
	let status = $state(seed.status ?? 'active');
	let category = $state(seed.category ?? '');
	let uom = $state(seed.uom ?? 'unit');
	let uomCategory = $state(seed.uomCategory ?? '');
	let preferredSupplierId = $state(seed.preferredSupplierId ?? '');
	let reorderPoint = $state(seed.reorderPoint?.toString() ?? '');
	let minLevel = $state(seed.minLevel?.toString() ?? '');
	let maxLevel = $state(seed.maxLevel?.toString() ?? '');
	let leadTimeDays = $state(seed.leadTimeDays?.toString() ?? '');
	let lotControl = $state(!!seed.lotControl);
	let serialControl = $state(!!seed.serialControl);
	let shelfLifeDays = $state(seed.shelfLifeDays?.toString() ?? '');
	let valuationMethod = $state(seed.valuationMethod ?? 'weighted_average');
	let standardCost = $state(seed.standardCost?.toString() ?? '');
	let lastCost = $state(seed.lastCost?.toString() ?? '');
	let averageCost = $state(seed.averageCost?.toString() ?? '');
	let currency = $state(seed.currency ?? 'SGD');
	let primaryImageUrl = $state(seed.primaryImageUrl ?? '');
	let notes = $state(seed.notes ?? '');

	const seedBarcodes = (seed.barcodes ?? []).map((b) => ({
		_uiId: crypto.randomUUID(),
		barcodeValue: b.barcodeValue,
		barcodeType: b.barcodeType,
		packagingLevel: b.packagingLevel,
		isPrimary: !!b.isPrimary
	}));
	let barcodes = $state<Barcode[]>(
		seedBarcodes.length > 0
			? seedBarcodes
			: [{ _uiId: crypto.randomUUID(), barcodeValue: '', barcodeType: 'code128', packagingLevel: 'each', isPrimary: true }]
	);

	const seedAttachments = (seed.attachments ?? []).map((a) => ({
		_uiId: crypto.randomUUID(),
		attachmentType: a.attachmentType,
		title: a.title,
		fileName: a.fileName ?? '',
		fileUrl: a.fileUrl ?? '',
		mimeType: a.mimeType ?? '',
		isPrimaryImage: !!a.isPrimaryImage
	}));
	let attachments = $state<Attachment[]>(
		seedAttachments.length > 0
			? seedAttachments
			: [
					{
						_uiId: crypto.randomUUID(),
						attachmentType: 'image',
						title: '',
						fileName: '',
						fileUrl: '',
						mimeType: '',
						isPrimaryImage: true
					}
				]
	);

	function addBarcode() {
		barcodes = [
			...barcodes,
			{
				_uiId: crypto.randomUUID(),
				barcodeValue: '',
				barcodeType: 'code128',
				packagingLevel: 'each',
				isPrimary: false
			}
		];
	}

	function removeBarcode(uiId: string) {
		barcodes = barcodes.filter((b) => b._uiId !== uiId);
	}

	function markPrimaryBarcode(uiId: string) {
		barcodes = barcodes.map((b) => ({ ...b, isPrimary: b._uiId === uiId }));
	}

	async function generateBarcode(uiId: string) {
		try {
			const res = await fetch(
				`/api/inventory/barcode-generate?itemCode=${encodeURIComponent(code || 'ITEM')}`
			);
			const json = (await res.json()) as { ok?: boolean; data?: { value: string } };
			if (json?.data?.value) {
				barcodes = barcodes.map((b) => (b._uiId === uiId ? { ...b, barcodeValue: json.data!.value } : b));
			}
		} catch {
			// silent fallback — user can manually type
		}
	}

	function addAttachment() {
		attachments = [
			...attachments,
			{
				_uiId: crypto.randomUUID(),
				attachmentType: 'other',
				title: '',
				fileName: '',
				fileUrl: '',
				mimeType: '',
				isPrimaryImage: false
			}
		];
	}

	function removeAttachment(uiId: string) {
		attachments = attachments.filter((a) => a._uiId !== uiId);
	}

	function markPrimaryImage(uiId: string) {
		attachments = attachments.map((a) => ({ ...a, isPrimaryImage: a._uiId === uiId }));
	}
</script>

<form class="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" method="POST" {action}>
	{#if message}
		<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p>
	{/if}

	<section class="space-y-3">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Identification</h2>
		<div class="grid gap-4 md:grid-cols-2">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Item code<span class="text-rose-600"> *</span></span>
				<input name="code" required bind:value={code} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. SKU-001" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Name<span class="text-rose-600"> *</span></span>
				<input name="name" required bind:value={name} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Item name" />
			</label>
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Description</span>
				<textarea name="description" bind:value={description} rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Long-form description"></textarea>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Item type</span>
				<select name="itemType" bind:value={itemType} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="raw_material">Raw material</option>
					<option value="finished_good">Finished good</option>
					<option value="consumable">Consumable</option>
					<option value="sub_assembly">Sub-assembly</option>
					<option value="service">Service</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Status</span>
				<select name="status" bind:value={status} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="active">Active</option>
					<option value="inactive">Inactive</option>
					<option value="discontinued">Discontinued</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Category / group</span>
				<input name="category" bind:value={category} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. Stationery / Electronics" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Unit of measure (UoM)</span>
				<input name="uom" bind:value={uom} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="unit / piece / kg / m" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">UoM category</span>
				<input name="uomCategory" bind:value={uomCategory} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="quantity / weight / length" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Preferred supplier</span>
				<select name="preferredSupplierId" bind:value={preferredSupplierId} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="">None</option>
					{#each suppliers as supplier}
						<option value={supplier.id}>{supplier.name}</option>
					{/each}
				</select>
			</label>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Inventory parameters</h2>
		<div class="grid gap-4 md:grid-cols-3">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Reorder point</span>
				<input name="reorderPoint" type="number" step="any" bind:value={reorderPoint} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Min level</span>
				<input name="minLevel" type="number" step="any" bind:value={minLevel} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Max level</span>
				<input name="maxLevel" type="number" step="any" bind:value={maxLevel} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Lead time (days)</span>
				<input name="leadTimeDays" type="number" step="1" min="0" bind:value={leadTimeDays} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Shelf life (days)</span>
				<input name="shelfLifeDays" type="number" step="1" min="0" bind:value={shelfLifeDays} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<div class="flex items-end gap-4">
				<label class="flex items-center gap-2 text-sm">
					<input type="hidden" name="lotControl" value={lotControl ? 'on' : 'off'} />
					<input type="checkbox" bind:checked={lotControl} class="rounded border-slate-300" />
					<span class="text-slate-700">Lot controlled</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<input type="hidden" name="serialControl" value={serialControl ? 'on' : 'off'} />
					<input type="checkbox" bind:checked={serialControl} class="rounded border-slate-300" />
					<span class="text-slate-700">Serial controlled</span>
				</label>
			</div>
		</div>
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Valuation</h2>
		<div class="grid gap-4 md:grid-cols-4">
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Method</span>
				<select name="valuationMethod" bind:value={valuationMethod} class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="fifo">FIFO</option>
					<option value="weighted_average">Weighted average</option>
					<option value="standard_cost">Standard cost</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Currency</span>
				<input name="currency" bind:value={currency} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Standard cost</span>
				<input name="standardCost" type="number" step="0.01" bind:value={standardCost} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Last purchase cost</span>
				<input name="lastCost" type="number" step="0.01" bind:value={lastCost} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Average cost</span>
				<input name="averageCost" type="number" step="0.01" bind:value={averageCost} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
		</div>
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Barcodes</h2>
			<button type="button" onclick={addBarcode} class="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">+ Add barcode</button>
		</div>
		{#each barcodes as b (b._uiId)}
			<div class="grid gap-3 rounded-md border border-slate-200 bg-slate-50/40 p-3 md:grid-cols-[1fr_180px_140px_120px_auto]">
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Barcode value</span>
					<div class="flex gap-2">
						<input
							name="barcode_value"
							bind:value={b.barcodeValue}
							class="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
							placeholder="e.g. 7613036050203"
						/>
						<button
							type="button"
							onclick={() => generateBarcode(b._uiId)}
							class="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
						>
							Generate
						</button>
					</div>
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Symbology</span>
					<select name="barcode_type" bind:value={b.barcodeType} class="w-full rounded-md border border-slate-300 px-3 py-2">
						<option value="code128">Code 128</option>
						<option value="ean13">EAN-13</option>
						<option value="ean8">EAN-8</option>
						<option value="upc_a">UPC-A</option>
						<option value="code39">Code 39</option>
						<option value="qr">QR</option>
						<option value="datamatrix">DataMatrix</option>
						<option value="custom">Custom</option>
					</select>
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Packaging</span>
					<select name="barcode_packaging" bind:value={b.packagingLevel} class="w-full rounded-md border border-slate-300 px-3 py-2">
						<option value="each">Each</option>
						<option value="inner">Inner</option>
						<option value="case">Case</option>
						<option value="pallet">Pallet</option>
					</select>
				</label>
				<label class="flex items-end gap-2 text-xs">
					<input type="hidden" name="barcode_is_primary" value={b.isPrimary ? 'true' : 'false'} />
					<input type="checkbox" checked={b.isPrimary} onchange={() => markPrimaryBarcode(b._uiId)} class="rounded border-slate-300" />
					<span class="text-slate-600">Primary</span>
				</label>
				<button type="button" onclick={() => removeBarcode(b._uiId)} class="text-xs text-rose-500 hover:underline">Remove</button>
			</div>
		{/each}
	</section>

	<section class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Images & attachments</h2>
			<button type="button" onclick={addAttachment} class="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">+ Add attachment</button>
		</div>
		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Primary image URL (optional shortcut)</span>
			<input name="primaryImageUrl" bind:value={primaryImageUrl} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="https://..." />
		</label>
		{#each attachments as a (a._uiId)}
			<div class="grid gap-3 rounded-md border border-slate-200 bg-slate-50/40 p-3 md:grid-cols-[1fr_1fr_140px_120px_auto]">
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Title</span>
					<input name="attachment_title" bind:value={a.title} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. Product photo" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">File URL</span>
					<input name="attachment_url" bind:value={a.fileUrl} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="https://..." />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Type</span>
					<select name="attachment_type" bind:value={a.attachmentType} class="w-full rounded-md border border-slate-300 px-3 py-2">
						<option value="image">Image</option>
						<option value="datasheet">Datasheet</option>
						<option value="certificate">Certificate</option>
						<option value="manual">Manual</option>
						<option value="safety_doc">Safety doc</option>
						<option value="other">Other</option>
					</select>
				</label>
				<label class="flex items-end gap-2 text-xs">
					<input type="hidden" name="attachment_is_primary_image" value={a.isPrimaryImage ? 'true' : 'false'} />
					<input type="checkbox" checked={a.isPrimaryImage} onchange={() => markPrimaryImage(a._uiId)} class="rounded border-slate-300" />
					<span class="text-slate-600">Primary image</span>
				</label>
				<button type="button" onclick={() => removeAttachment(a._uiId)} class="text-xs text-rose-500 hover:underline">Remove</button>
				<input type="hidden" name="attachment_filename" value={a.fileName} />
				<input type="hidden" name="attachment_mime" value={a.mimeType} />
			</div>
		{/each}
	</section>

	<section class="space-y-3">
		<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h2>
		<textarea name="notes" bind:value={notes} rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Internal notes (not customer-facing)"></textarea>
	</section>

	<div class="flex justify-end gap-3">
		<a href="/inventory/items" class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</a>
		<button type="submit" class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">
			{submitLabel}
		</button>
	</div>
</form>
