<script lang="ts">
	// Public, no-login Purchase Order generator. Lives outside the (app) shell
	// (like /qc/submit/[token]) so anonymous users can reach it — `needsAppAuth`
	// in hooks.server.ts does not gate `/po`. Pure client-side: fill the form,
	// see a live preview, and Print / Save as PDF via the browser dialog.
	import axiomLogo from '$app-layer/assets/axiom-logo.svg';

	type LineItem = {
		id: string;
		description: string;
		unit: string;
		unitPrice: string;
	};

	const today = new Date();
	const ymd = (d: Date) => d.toISOString().slice(0, 10);

	function newLine(): LineItem {
		return {
			id: crypto.randomUUID(),
			description: '',
			unit: '1',
			unitPrice: '0'
		};
	}

	function defaultPoNumber(): string {
		const y = today.getFullYear();
		const m = String(today.getMonth() + 1).padStart(2, '0');
		const d = String(today.getDate()).padStart(2, '0');
		return `PO_${y}_${m}${d}`;
	}

	// -- Company (issuer) header — prefilled Axiom defaults, editable --
	let companyName = $state('AXIOM TECH PTE LTD');
	let companyAddr = $state('5008 Ang Mo Kio Ave 5, #04-09 (M04), Techplace II, Singapore 569874');
	let companyGst = $state('202330082W');

	// -- Bill To --
	let billToName = $state('Axiom Tech Pte Ltd');
	let billToAddr = $state('Blk 5008, Ang Mo Kio Ave 5, #04-09 (W58), Techplace II, Singapore 569874');

	// -- PO meta --
	let poNumber = $state(defaultPoNumber());
	let poDate = $state(ymd(today));
	let currency = $state('SGD');

	// -- Requestor --
	let requestor = $state('');
	let requestorContact = $state('');

	// -- Supplier --
	let supplierName = $state('');
	let supplierAddr = $state('');
	let supplierContactPerson = $state('');

	// -- Authorisation --
	let authorisedBy = $state('');
	let authorisedDate = $state(ymd(today));

	let lineItems = $state<LineItem[]>([newLine()]);

	const totals = $derived.by(() => {
		const rows = lineItems.map((item) => {
			const unit = Number.parseFloat(item.unit) || 0;
			const unitPrice = Number.parseFloat(item.unitPrice) || 0;
			return {
				...item,
				unitNumber: unit,
				unitPriceNumber: unitPrice,
				amount: unit * unitPrice
			};
		});
		const total = rows.reduce((sum, item) => sum + item.amount, 0);
		return { rows, total };
	});

	function addLine() {
		lineItems = [...lineItems, newLine()];
	}

	function removeLine(id: string) {
		lineItems = lineItems.filter((item) => item.id !== id);
		if (lineItems.length === 0) lineItems = [newLine()];
	}

	function fmtMoney(value: number): string {
		return value.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function fmtPreviewDate(raw: string): string {
		if (!raw) return '-';
		const [year, month, day] = raw.split('-').map((part) => Number.parseInt(part, 10));
		if (!year || !month || !day) return raw;
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${day} ${months[month - 1]} ${year}`;
	}

	// -- Quotation upload → OCR + LLM extraction → prefill variable fields --
	type QuotationSuggestions = {
		supplierName: string | null;
		currency: string | null;
		quotationDate: string | null;
		description: string | null;
		lineItems: Array<{ description: string; unit: number; unitPrice: number }>;
	};

	let extracting = $state(false);
	let extractError = $state('');
	let extractSuccess = $state('');
	let dragOver = $state(false);

	function onFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) startExtraction(input.files[0]);
		input.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) startExtraction(file);
	}

	async function startExtraction(file: File) {
		extractError = '';
		extractSuccess = '';
		extracting = true;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/public/po/extract-quotation', { method: 'POST', body: fd });
			const json = (await res.json()) as {
				ok: boolean;
				data?: { suggestions: QuotationSuggestions; confidence: number };
				error?: string;
			};
			if (!res.ok || !json.ok || !json.data) {
				extractError = json.error ?? 'Extraction failed';
				return;
			}
			applySuggestions(json.data.suggestions);
			const conf = Math.round((json.data.confidence ?? 0) * 100);
			extractSuccess = `Prefilled from ${file.name} (confidence: ${conf}%). Review before printing.`;
		} catch (e) {
			extractError = e instanceof Error ? e.message : 'Network error';
		} finally {
			extracting = false;
		}
	}

	function applySuggestions(s: QuotationSuggestions) {
		if (s.supplierName) supplierName = s.supplierName;
		if (s.currency) currency = s.currency;
		if (s.lineItems.length > 0) {
			lineItems = s.lineItems.map((item) => ({
				id: crypto.randomUUID(),
				description: item.description || '',
				unit: String(item.unit ?? 1),
				unitPrice: String(item.unitPrice ?? 0)
			}));
		}
	}

	function printPreview() {
		window.print();
	}
</script>

<svelte:head>
	<title>Generate Purchase Order · MiniERP</title>
	<style>
		/* Zero the page margin so the browser drops its auto header/footer
		   (date, title, URL, page number). Whitespace comes from the
		   .sf-print-root padding instead. */
		@page {
			margin: 0;
		}

		@media print {
			body * {
				visibility: hidden;
			}

			.sf-print-root,
			.sf-print-root * {
				visibility: visible;
			}

			.sf-print-root {
				position: fixed !important;
				inset: 0 auto auto 0 !important;
				width: 100% !important;
				max-width: none !important;
				margin: 0 !important;
				padding: 16mm 14mm !important;
				border: 0 !important;
				border-radius: 0 !important;
				box-shadow: none !important;
				background: #fff !important;
			}

			.sf-no-print {
				display: none !important;
			}
		}
	</style>
</svelte:head>

<div class="min-h-screen bg-slate-50">
	<!-- Brand header (tool chrome, not printed) -->
	<header class="sf-no-print flex items-center gap-2.5 border-b border-slate-200 bg-white px-6 py-4">
		<img src={axiomLogo} alt="MiniERP" class="h-8 w-8 rounded-lg" />
		<span class="text-sm font-semibold text-slate-800">MiniERP&nbsp;·&nbsp;Generate Purchase Order</span>
		<span class="ml-auto text-xs text-slate-400">No login required</span>
	</header>

	<div class="mx-auto max-w-6xl p-4 sm:p-6">
		<div class="grid gap-5 lg:grid-cols-2 lg:items-start">
			<!-- ── Form ── -->
			<div class="sf-no-print overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
				<!-- Auto-fill from a supplier quotation / pro-forma (OCR + AI) -->
				<div class="border-b border-slate-200 bg-indigo-50 p-4">
					<p class="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-700">Auto-fill from quotation</p>
					<div
						class="relative rounded-lg border-2 border-dashed transition-colors {dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-white'}"
						role="region"
						aria-label="Upload quotation file"
						ondragover={(e: DragEvent) => { e.preventDefault(); dragOver = true; }}
						ondragleave={() => { dragOver = false; }}
						ondrop={onDrop}
					>
						<label class="flex cursor-pointer flex-col items-center gap-1 px-4 py-5 text-center">
							{#if extracting}
								<svg class="h-6 w-6 animate-spin text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
								</svg>
								<span class="text-sm text-indigo-600">Reading quotation…</span>
							{:else}
								<svg class="h-6 w-6 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
								</svg>
								<span class="text-sm text-slate-600">
									Drop a quotation here or <span class="font-medium text-indigo-600 hover:underline">browse</span>
								</span>
								<span class="text-[11px] text-slate-400">PDF, image, or DOCX — AI extracts supplier, items, and currency</span>
							{/if}
							<input type="file" class="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" onchange={onFileSelect} disabled={extracting} />
						</label>
					</div>
					{#if extractError}
						<p class="mt-2 text-xs text-red-600">{extractError}</p>
					{/if}
					{#if extractSuccess}
						<p class="mt-2 text-xs text-emerald-600">{extractSuccess}</p>
					{/if}
				</div>

				<div class="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
					Purchase Order details
				</div>

				<div class="space-y-0 divide-y divide-slate-200">
					<!-- Rarely-changed fields (company header + bill-to) — collapsed by default -->
					<details class="group">
						<summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-slate-500 hover:bg-slate-50">
							<span class="transition-transform group-open:rotate-90">›</span>
							More edit · Company &amp; Bill To
							<span class="ml-auto font-normal normal-case text-slate-400">rarely changes</span>
						</summary>
						<div class="divide-y divide-slate-200 border-t border-slate-200">
					<!-- Company (issuer) -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Company (issuer)</p>
						<div class="mt-3 space-y-2">
							<label class="block text-xs text-slate-600" for="companyName">
								Company name
								<input id="companyName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={companyName} />
							</label>
							<label class="block text-xs text-slate-600" for="companyAddr">
								Address
								<textarea id="companyAddr" class="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed" rows="2" bind:value={companyAddr}></textarea>
							</label>
							<label class="block text-xs text-slate-600" for="companyGst">
								GST No.
								<input id="companyGst" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={companyGst} />
							</label>
						</div>
					</div>

					<!-- Bill To -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Bill to</p>
						<div class="mt-3 space-y-2">
							<label class="block text-xs text-slate-600" for="billToName">
								Company / Name
								<input id="billToName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={billToName} />
							</label>
							<label class="block text-xs text-slate-600" for="billToAddr">
								Address
								<textarea id="billToAddr" class="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed" rows="2" bind:value={billToAddr}></textarea>
							</label>
						</div>
					</div>
						</div>
					</details>

					<!-- PO info -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">PO info</p>
						<div class="mt-3 grid grid-cols-3 gap-2">
							<label class="col-span-1 block text-xs text-slate-600" for="poNumber">
								PO No.
								<input id="poNumber" class="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" bind:value={poNumber} />
							</label>
							<label class="block text-xs text-slate-600" for="poDate">
								Date
								<input id="poDate" class="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" type="date" bind:value={poDate} />
							</label>
							<label class="block text-xs text-slate-600" for="currency">
								Currency
								<select id="currency" class="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm" bind:value={currency}>
									<option>SGD</option>
									<option>USD</option>
									<option>CNY</option>
								</select>
							</label>
						</div>
					</div>

					<!-- Requestor -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Requestor</p>
						<div class="mt-3 grid grid-cols-2 gap-2">
							<label class="block text-xs text-slate-600" for="requestor">
								Requestor
								<input id="requestor" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={requestor} placeholder="e.g. Clara Zhao" />
							</label>
							<label class="block text-xs text-slate-600" for="requestorContact">
								Contact
								<input id="requestorContact" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={requestorContact} placeholder="Phone / email" />
							</label>
						</div>
					</div>

					<!-- Supplier -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Supplier</p>
						<div class="mt-3 space-y-2">
							<label class="block text-xs text-slate-600" for="supplierName">
								Supplier name
								<input id="supplierName" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={supplierName} placeholder="e.g. Wenext" />
							</label>
							<label class="block text-xs text-slate-600" for="supplierAddr">
								Address
								<textarea id="supplierAddr" class="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed" rows="2" bind:value={supplierAddr}></textarea>
							</label>
							<label class="block text-xs text-slate-600" for="supplierContactPerson">
								Contact person
								<input id="supplierContactPerson" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={supplierContactPerson} />
							</label>
						</div>
					</div>

					<!-- Line items -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Items</p>
						<div class="mt-2 grid grid-cols-[1fr_70px_100px_28px] gap-2 pb-1 text-[11px] font-medium text-slate-500">
							<span>Description</span>
							<span class="text-right">Unit</span>
							<span class="text-right">Unit price</span>
							<span></span>
						</div>
						{#each lineItems as item (item.id)}
							<div class="mb-2 grid grid-cols-[1fr_70px_100px_28px] items-start gap-2">
								<textarea class="resize-none rounded-md border border-slate-200 px-2 py-1.5 text-sm leading-relaxed" rows="2" placeholder="Item description" bind:value={item.description}></textarea>
								<input class="rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm" type="number" min="0" step="any" bind:value={item.unit} />
								<input class="rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm" type="number" min="0" step="any" bind:value={item.unitPrice} />
								<button type="button" class="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700" onclick={() => removeLine(item.id)} aria-label="Remove line">
									x
								</button>
							</div>
						{/each}
						<button type="button" class="mt-1 text-xs font-medium text-indigo-600 hover:underline" onclick={addLine}>+ Add item</button>
					</div>

					<!-- Authorisation -->
					<div class="p-4">
						<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Authorisation</p>
						<div class="mt-3 grid grid-cols-2 gap-2">
							<label class="block text-xs text-slate-600" for="authorisedBy">
								Authorised by
								<input id="authorisedBy" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={authorisedBy} placeholder="e.g. Dr Clara Zhao" />
							</label>
							<label class="block text-xs text-slate-600" for="authorisedDate">
								Date
								<input id="authorisedDate" class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="date" bind:value={authorisedDate} />
							</label>
						</div>
					</div>
				</div>

				<div class="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
					<button type="button" class="rounded-md bg-[var(--sf-green,#356534)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" onclick={printPreview}>
						Print / Save PDF
					</button>
					<span class="ml-auto self-center text-[11px] text-slate-400">Total: {currency} {fmtMoney(totals.total)}</span>
				</div>
			</div>

			<!-- ── Live preview / printable PO ── -->
			<div class="lg:sticky lg:top-4 lg:self-start">
				<div class="sf-no-print rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 px-4 py-3">
					<p class="text-sm font-medium text-slate-600">Live preview</p>
				</div>
				<div class="sf-print-root rounded-b-xl border border-slate-200 bg-white p-8 text-xs leading-relaxed text-slate-800 shadow-sm">
					<!-- Company header -->
					<div class="flex justify-end">
						<div class="min-w-[280px] text-right">
							<p class="text-sm font-bold text-slate-900">{companyName}</p>
							<p class="mt-1 whitespace-pre-line text-xs text-slate-600">{companyAddr}</p>
							{#if companyGst.trim()}
								<p class="mt-1 text-xs text-slate-600">GST: <span class="font-medium text-slate-900">{companyGst}</span></p>
							{/if}
						</div>
					</div>

					<h1 class="mt-8 text-center text-lg font-bold text-slate-900">Purchase Order</h1>

					<!-- Bill To + PO meta -->
					<div class="mt-8 grid gap-6 sm:grid-cols-2">
						<div>
							<p class="text-xs">
								<span class="font-semibold text-slate-900">Bill To:</span>
								<span class="ml-1 font-semibold text-slate-900">{billToName || '-'}</span>
							</p>
							<p class="mt-1 whitespace-pre-line text-xs text-slate-600">
								<span class="font-semibold text-slate-900">Address:</span> {billToAddr}
							</p>
						</div>
						<div>
							<p class="text-xs font-semibold text-slate-700">
								PO No.: <span class="font-medium text-slate-900">{poNumber || '-'}</span>
							</p>
							<p class="mt-1 text-xs font-semibold text-slate-700">
								Date: <span class="font-medium text-slate-900">{fmtPreviewDate(poDate)}</span>
							</p>
						</div>
					</div>

					<!-- Requestor -->
					<div class="mt-6">
						<p class="text-xs text-slate-700"><span class="font-semibold text-slate-900">Requestor:</span> {requestor || '-'}</p>
						<p class="mt-1 text-xs text-slate-700"><span class="font-semibold text-slate-900">Contact:</span> {requestorContact || '-'}</p>
					</div>

					<!-- Supplier -->
					<div class="mt-6 grid gap-6 sm:grid-cols-2">
						<div>
							<p class="text-xs text-slate-700"><span class="font-semibold text-slate-900">Supplier:</span> {supplierName || '-'}</p>
							<p class="mt-1 whitespace-pre-line text-xs text-slate-700">
								<span class="font-semibold text-slate-900">Address:</span> {supplierAddr || '-'}
							</p>
						</div>
						<div>
							<p class="text-xs text-slate-700"><span class="font-semibold text-slate-900">Contact Person:</span> {supplierContactPerson || '-'}</p>
						</div>
					</div>

					<!-- Items table -->
					<table class="mt-8 w-full border-collapse text-xs">
						<thead>
							<tr class="bg-slate-50 text-slate-700">
								<th class="w-12 border border-slate-300 px-2 py-1.5 text-center font-semibold">Item</th>
								<th class="border border-slate-300 px-2 py-1.5 text-left font-semibold">Description</th>
								<th class="w-14 border border-slate-300 px-2 py-1.5 text-center font-semibold">Unit</th>
								<th class="w-28 border border-slate-300 px-2 py-1.5 text-right font-semibold">Unit Price ({currency})</th>
								<th class="w-28 border border-slate-300 px-2 py-1.5 text-right font-semibold">Amount ({currency})</th>
							</tr>
						</thead>
						<tbody>
							{#each totals.rows as row, i}
								<tr>
									<td class="border border-slate-300 px-2 py-1.5 text-center align-top">{i + 1}</td>
									<td class="border border-slate-300 px-2 py-1.5 align-top whitespace-pre-wrap font-medium text-slate-800">{row.description || '-'}</td>
									<td class="border border-slate-300 px-2 py-1.5 text-center align-top">{row.unitNumber}</td>
									<td class="border border-slate-300 px-2 py-1.5 text-right align-top">{fmtMoney(row.unitPriceNumber)}</td>
									<td class="border border-slate-300 px-2 py-1.5 text-right align-top">{fmtMoney(row.amount)}</td>
								</tr>
							{/each}
							<tr>
								<td class="border border-slate-300 px-2 py-1.5" colspan="3"></td>
								<td class="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">Total ({currency})</td>
								<td class="border border-slate-300 px-2 py-1.5 text-right font-bold text-slate-900">{fmtMoney(totals.total)}</td>
							</tr>
						</tbody>
					</table>

					<!-- Authorisation -->
					<div class="mt-12 text-xs text-slate-800">
						<p><span class="font-semibold">Authorised by:</span> {authorisedBy || '_______________________'}</p>
						<p class="mt-6"><span class="font-semibold">Date:</span> {authorisedDate ? fmtPreviewDate(authorisedDate) : '_______________________'}</p>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
