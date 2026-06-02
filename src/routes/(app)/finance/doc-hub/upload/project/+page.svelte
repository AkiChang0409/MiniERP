<script lang="ts">
	import { invalidate } from '$app/navigation';
	import PageShell from '$app-layer/components/PageShell.svelte';
	import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import { preprocessImageForOcr } from '$lib/utils/preprocess-image';

	let { data } = $props();

	type DocType = 'contract' | 'quotation' | 'purchase_order';
	type ProjectInfo = {
		id: string;
		name: string;
		customerName: string | null;
		status: string;
		startDate: string | null;
		endDate: string | null;
	};

	const initialDocType = (data.initialDocType as DocType) || 'contract';
	let docType = $state<DocType>(initialDocType);
	let status = $state(docType === 'contract' ? 'active' : docType === 'quotation' ? 'draft' : 'pending');

	let selectedProject = $state<ProjectInfo | null>(null);

	/** Server resolves ?projectId=�?and links the project when the page loads */
	$effect(() => {
		const incoming = data.preselectedProject;
		if (incoming) selectedProject = incoming;
	});
	let showProjectPicker = $state(false);
	let projectSearchQ = $state('');
	let projectSearchStatus = $state('');
	let projectSearchStartedAfter = $state('');
	let projectSearchResults = $state<ProjectInfo[]>([]);
	let projectSearching = $state(false);

	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let previewZoomPct = $state(100);
	const previewScale = $derived(previewZoomPct / 100);

	let extracting = $state(false);
	let uploading = $state(false);
	let message = $state('');
	let error = $state('');
	let rawText = $state('');
	let documentId = $state<string | null>(null);
	let entityId = $state<string | null>(null);

	let amount = $state('');
	let currency = $state('SGD');
	let notes = $state('');
	let clientName = $state('');

	let contractNumber = $state('');
	let effectiveDate = $state('');
	let expiryDate = $state('');
	let paymentTerms = $state('');
	let scope = $state('');
	let contractType = $state<'customer_contract' | 'supplier_contract'>('customer_contract');

	let quotationNumber = $state('');
	let quotationDate = $state('');
	let validUntil = $state('');
	let quotationLineItems = $state('');

	let poNumber = $state('');
	let supplierName = $state('');
	let poDate = $state('');
	let description = $state('');
	let poLineItems = $state('');

	const pageTitle = $derived(
		selectedProject ? `Upload Document �?Project: ${selectedProject.name}` : 'Upload Document'
	);

	$effect(() => {
		if (!selectedFile) {
			previewUrl = null;
			return;
		}
		const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
		const isImg = selectedFile.type.startsWith('image/');
		if (!isPdf && !isImg) {
			previewUrl = null;
			return;
		}
		const url = URL.createObjectURL(selectedFile);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	function onDocTypeChange(next: DocType) {
		docType = next;
		status = next === 'contract' ? 'active' : next === 'quotation' ? 'draft' : 'pending';
	}

	function setPreviewZoom(next: number): void {
		previewZoomPct = Math.min(200, Math.max(50, Math.round(next / 5) * 5));
	}

	function onPickFile(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		selectedFile = input.files?.[0] ?? null;
		message = '';
		error = '';
		rawText = '';
		documentId = null;
		entityId = null;
		previewZoomPct = 100;
	}

	async function searchProjects() {
		projectSearching = true;
		try {
			const params = new URLSearchParams();
			if (projectSearchQ) params.set('q', projectSearchQ);
			if (projectSearchStatus) params.set('status', projectSearchStatus);
			const res = await fetch(`/api/projects?${params.toString()}`);
			const json = (await res.json()) as {
				ok?: boolean;
				data?: Array<{ project: { id: string; name: string; status: string; startDate: string | null; endDate: string | null }; customerName: string | null }>;
			};
			if (json.ok && json.data) {
				projectSearchResults = json.data
					.filter((r) => !projectSearchStartedAfter || (r.project.startDate ?? '') >= projectSearchStartedAfter)
					.map((r) => ({
						id: r.project.id,
						name: r.project.name,
						customerName: r.customerName,
						status: r.project.status,
						startDate: r.project.startDate,
						endDate: r.project.endDate
					}));
			}
		} finally {
			projectSearching = false;
		}
	}

	function pickProject(p: ProjectInfo) {
		selectedProject = p;
		showProjectPicker = false;
	}

	function clearProject() {
		selectedProject = null;
	}

	function parseLineItems(text: string): Array<Record<string, unknown>> | null {
		try {
			const parsed = JSON.parse(text || 'null');
			return Array.isArray(parsed) ? parsed : null;
		} catch {
			return null;
		}
	}

	function buildExtractedPayload(): Record<string, unknown> {
		if (docType === 'contract') {
			return {
				contract_number: contractNumber || null,
				client_name: clientName || null,
				effective_date: effectiveDate || null,
				expiry_date: expiryDate || null,
				amount: amount ? Number(amount) : null,
				currency,
				payment_terms: paymentTerms || null,
				scope: scope || null,
				type: contractType
			};
		}
		if (docType === 'quotation') {
			return {
				quotation_number: quotationNumber || null,
				client_name: clientName || null,
				date: quotationDate || null,
				valid_until: validUntil || null,
				amount: amount ? Number(amount) : null,
				currency,
				line_items: parseLineItems(quotationLineItems)
			};
		}
		return {
			po_number: poNumber || null,
			supplier_name: supplierName || null,
			client_name: clientName || null,
			date: poDate || null,
			amount: amount ? Number(amount) : null,
			currency,
			description: description || null,
			line_items: parseLineItems(poLineItems)
		};
	}

	type DetectData = {
		rawText?: string;
		confidence?: number;
		confidenceBand?: string;
		isImageFile?: boolean;
		message?: string | null;
		extracted?: Record<string, unknown> | null;
	};

	// --- Client-side PDF / image extraction (pdfjs-dist + server image OCR) ---
	let _pdfJsCache: (typeof import('pdfjs-dist')) | null = null;

	async function loadPdfJs() {
		if (_pdfJsCache) return _pdfJsCache;
		const lib = await import('pdfjs-dist');
		lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
		_pdfJsCache = lib;
		return lib;
	}

	async function extractPdfTextClient(file: File): Promise<string> {
		const pdfjs = await loadPdfJs();
		const data = new Uint8Array(await file.arrayBuffer());
		const pdf = await Promise.race([
			pdfjs.getDocument({ data }).promise,
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF parse timeout')), 15000))
		]);
		const maxPages = Math.min(pdf.numPages, 8);
		const chunks: string[] = [];
		for (let i = 1; i <= maxPages; i++) {
			const page = await pdf.getPage(i);
			const content = await page.getTextContent();
			const line = content.items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' ').trim();
			if (line) chunks.push(line);
		}
		return chunks.join('\n').trim();
	}

	async function renderPdfFirstPageToJpeg(file: File): Promise<Blob | null> {
		try {
			const pdfjs = await loadPdfJs();
			const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
			if (pdf.numPages < 1) return null;
			const page = await pdf.getPage(1);
			const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / Math.max(page.getViewport({ scale: 1 }).width, 1)) });
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d');
			if (!ctx) return null;
			await page.render({ canvasContext: ctx, viewport, canvas }).promise;
			return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88));
		} catch {
			return null;
		}
	}

	async function runImageOcr(blob: Blob, fileName: string): Promise<string> {
		const fd = new FormData();
		fd.append('file', blob, fileName);
		const res = await fetch('/api/ocr/image', { method: 'POST', body: fd });
		const payload = (await res.json()) as { ok?: boolean; data?: { text?: string }; error?: string };
		if (!res.ok || !payload.ok || typeof payload.data?.text !== 'string') {
			throw new Error(payload.error ?? `Image OCR failed (${res.status})`);
		}
		return payload.data.text;
	}

	function applyExtracted(data: DetectData) {
		const ex = data.extracted as Record<string, unknown> | null | undefined;
		if (!ex) return;

		// Common fields across all doc types
		if (ex.amount != null) amount = String(ex.amount);
		if (typeof ex.currency === 'string' && ex.currency.trim()) currency = ex.currency.trim();
		if (typeof ex.client_name === 'string' && ex.client_name.trim()) clientName = ex.client_name.trim();

		if (docType === 'contract') {
			if (typeof ex.contract_number === 'string') contractNumber = ex.contract_number;
			if (typeof ex.effective_date === 'string') effectiveDate = ex.effective_date;
			if (typeof ex.expiry_date === 'string') expiryDate = ex.expiry_date;
			if (typeof ex.payment_terms === 'string') paymentTerms = ex.payment_terms;
			if (typeof ex.scope === 'string') scope = ex.scope;
		} else if (docType === 'quotation') {
			if (typeof ex.quotation_number === 'string') quotationNumber = ex.quotation_number;
			if (typeof ex.date === 'string') quotationDate = ex.date;
			if (typeof ex.valid_until === 'string') validUntil = ex.valid_until;
			if (Array.isArray(ex.line_items)) quotationLineItems = JSON.stringify(ex.line_items, null, 2);
		} else {
			// purchase_order
			if (typeof ex.po_number === 'string') poNumber = ex.po_number;
			if (typeof ex.supplier_name === 'string') supplierName = ex.supplier_name;
			if (typeof ex.date === 'string') poDate = ex.date;
			if (typeof ex.description === 'string') description = ex.description;
			if (Array.isArray(ex.line_items)) poLineItems = JSON.stringify(ex.line_items, null, 2);
		}
	}

	async function runDetect() {
		if (!selectedFile) return;
		extracting = true;
		error = '';
		message = '';
		try {
			const fd = new FormData();
			fd.set('file', selectedFile);
			fd.set('docType', docType);

			// Client-side text extraction before sending to server
			const mime = selectedFile.type.toLowerCase();
			const fname = selectedFile.name.toLowerCase();
			const isPdf = mime === 'application/pdf' || fname.endsWith('.pdf');
			const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(fname);

			if (isImage) {
				const processed = await preprocessImageForOcr(selectedFile);
				const ocrText = await runImageOcr(processed, processed.name);
				if (ocrText.trim()) fd.set('rawText', ocrText);
			} else if (isPdf) {
				try {
					const text = await extractPdfTextClient(selectedFile);
					if (text.trim().length >= 48) {
						fd.set('rawText', text);
					} else {
						// Scanned PDF: render first page and run server image OCR
						const jpeg = await renderPdfFirstPageToJpeg(selectedFile);
						if (jpeg) {
							const baseName = fname.replace(/\.pdf$/i, '') || 'document';
							const processed = await preprocessImageForOcr(jpeg);
							const ocrText = await runImageOcr(processed, `${baseName}-p1.jpg`);
							if (ocrText.trim()) fd.set('rawText', ocrText);
						}
					}
				} catch { /* fall back to server-side extraction */ }
			}

			const detectRes = await fetch('/api/doc-hub/detect', { method: 'POST', body: fd });
			const detectJson = (await detectRes.json()) as {
				ok?: boolean;
				error?: string;
				details?: { message?: string };
				data?: DetectData;
			};
			if (!detectRes.ok || !detectJson.ok) {
				const detail = detectJson.details?.message ? ` (${detectJson.details.message})` : '';
				throw new Error(`${detectJson.error || 'Extraction failed'}${detail}`);
			}
			const data = detectJson.data ?? {};
			rawText = String(data.rawText || '');

			if (data.isImageFile) {
				message = 'Image file: OCR is not available yet. Please fill the fields manually.';
			} else {
				applyExtracted(data);
				const warn = data.message ? `\nNote: ${data.message}` : '';
				const filled = data.extracted
					? 'Fields were prefilled automatically �?review before saving.'
					: 'Text was extracted but the LLM returned no structured fields �?fill the form manually.';
				message = filled + warn;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Detection failed';
		} finally {
			extracting = false;
		}
	}

	async function upload() {
		if (!selectedFile) {
			error = 'Please choose a file first.';
			return;
		}
		uploading = true;
		error = '';
		message = '';
		try {
			const presignRes = await fetch('/api/upload/presign', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					fileName: selectedFile.name,
					contentType: selectedFile.type || 'application/octet-stream',
					projectId: selectedProject?.id ?? 'company',
					entityType: docType,
					entityId: crypto.randomUUID()
				})
			});
			const presignJson = (await presignRes.json()) as {
				ok?: boolean;
				error?: string;
				data?: { key: string; uploadUrl: string };
			};
			if (!presignRes.ok || !presignJson.ok || !presignJson.data) throw new Error(presignJson.error || 'Could not create upload target');

			const putRes = await fetch(presignJson.data.uploadUrl, {
				method: 'PUT',
				headers: { 'content-type': selectedFile.type || 'application/octet-stream' },
				body: selectedFile
			});
			if (!putRes.ok) throw new Error('File upload to storage failed');

			const saveRes = await fetch('/api/doc-hub/upload', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					key: presignJson.data.key,
					fileName: selectedFile.name,
					fileType: selectedFile.type || 'application/octet-stream',
					projectId: selectedProject?.id ?? null,
					docType,
					status,
					notes,
					extracted: buildExtractedPayload()
				})
			});
			const saveJson = (await saveRes.json()) as {
				ok?: boolean;
				error?: string;
				data?: { documentId?: string; entityId?: string };
			};
			if (!saveRes.ok || !saveJson.ok) throw new Error(saveJson.error || 'Save failed');

			documentId = saveJson.data?.documentId ?? null;
			entityId = saveJson.data?.entityId ?? null;
			message = 'Saved to archive (does not affect live P&L).';
			const pid = selectedProject?.id;
			if (pid) void invalidate(`app:project-activity:${pid}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}
</script>

<PageShell eyebrow="Finance / Documents" title={pageTitle} description="After you pick a file, preview it on the right. For text-based PDFs and .docx, use Extract text to prefill. Upload Files writes to R2, documents, and the matching business record.">
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			{#if selectedProject}
				<span class="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
					{selectedProject.name}
					{#if selectedProject.customerName}<span class="text-emerald-600">({selectedProject.customerName})</span>{/if}
					<button type="button" class="ml-1 text-emerald-500 hover:text-emerald-800" onclick={clearProject} title="Unlink project">-</button>
				</span>
			{/if}
			<button type="button" class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50" onclick={() => { showProjectPicker = true; void searchProjects(); }}>
				<span aria-hidden="true">📁</span>{selectedProject ? 'Change Project' : 'Link Project'}
			</button>
		</div>
	{/snippet}

	<div class="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-8">
		<section class="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 class="text-sm font-semibold text-slate-900">Archive document intake</h2>
			<div class="mt-4 space-y-4">
				<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This flow is for filing documents and metadata only; it does not post to live revenue or expenses.</div>
				<div class="grid gap-3 md:grid-cols-2">
					<label><span class="mb-1 block text-xs font-medium text-slate-700">Document Type</span><select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={docType} onchange={(e) => onDocTypeChange((e.currentTarget as HTMLSelectElement).value as DocType)}><option value="contract">Contract</option><option value="quotation">Quotation</option><option value="purchase_order">Purchase Order</option></select></label>
					<label><span class="mb-1 block text-xs font-medium text-slate-700">Status</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={status} /></label>
				</div>
				<label class="block"><span class="mb-1 block text-xs font-medium text-slate-700">File</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.txt,.csv,.doc,.docx,.xls,.xlsx" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" onchange={onPickFile} /></label>
				<div class="grid gap-3 md:grid-cols-2">
					<label><span class="mb-1 block text-xs font-medium text-slate-700">Amount</span><input type="number" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={amount} /></label>
					<label><span class="mb-1 block text-xs font-medium text-slate-700">Currency</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={currency} /></label>
				</div>
				<label><span class="mb-1 block text-xs font-medium text-slate-700">Client Name</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={clientName} /></label>

				{#if docType === 'contract'}
					<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
						<p class="text-xs font-semibold text-blue-800">Contract fields</p>
						<div class="grid gap-3 md:grid-cols-2">
							<label><span class="mb-1 block text-xs font-medium text-slate-700">contract_number</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={contractNumber} /></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">type</span><select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={contractType}><option value="customer_contract">customer_contract</option><option value="supplier_contract">supplier_contract</option></select></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">effective_date</span><input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={effectiveDate} /></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">expiry_date</span><input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={expiryDate} /></label>
						</div>
						<label><span class="mb-1 block text-xs font-medium text-slate-700">payment_terms</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={paymentTerms} /></label>
						<label><span class="mb-1 block text-xs font-medium text-slate-700">scope</span><textarea class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={scope}></textarea></label>
					</div>
				{:else if docType === 'quotation'}
					<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
						<p class="text-xs font-semibold text-blue-800">Quotation fields</p>
						<div class="grid gap-3 md:grid-cols-2">
							<label><span class="mb-1 block text-xs font-medium text-slate-700">quotation_number</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={quotationNumber} /></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">date</span><input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={quotationDate} /></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">valid_until</span><input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={validUntil} /></label>
						</div>
						<label><span class="mb-1 block text-xs font-medium text-slate-700">line_items[] (JSON)</span><textarea class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={quotationLineItems}></textarea></label>
					</div>
				{:else}
					<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
						<p class="text-xs font-semibold text-blue-800">Purchase order fields</p>
						<div class="grid gap-3 md:grid-cols-2">
							<label><span class="mb-1 block text-xs font-medium text-slate-700">po_number</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={poNumber} /></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">supplier_name</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={supplierName} /></label>
							<label><span class="mb-1 block text-xs font-medium text-slate-700">date</span><input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={poDate} /></label>
						</div>
						<label><span class="mb-1 block text-xs font-medium text-slate-700">description</span><textarea class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={description}></textarea></label>
						<label><span class="mb-1 block text-xs font-medium text-slate-700">line_items[] (JSON)</span><textarea class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={poLineItems}></textarea></label>
					</div>
				{/if}

				<label class="block"><span class="mb-1 block text-xs font-medium text-slate-700">Notes</span><input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={notes} /></label>
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-3"><p class="text-xs font-semibold text-slate-700">Payload Preview</p><pre class="mt-2 overflow-x-auto text-[11px] leading-relaxed text-slate-700">{JSON.stringify(buildExtractedPayload(), null, 2)}</pre></div>
				<div class="flex items-center gap-2">
					<button type="button" class="rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-2 text-xs font-medium text-[var(--sf-green)] hover:bg-[#dcefd8] disabled:opacity-50" disabled={extracting || !selectedFile} onclick={() => void runDetect()}>{extracting ? 'Extracting...' : 'Extract text'}</button>
					<button type="button" class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-50" disabled={uploading || !selectedFile} onclick={() => void upload()}>{uploading ? 'Saving...' : 'Upload Files'}</button>
				</div>
				{#if message}<p class="text-sm text-emerald-700">{message}</p>{/if}
				{#if error}<p class="text-sm text-rose-700">{error}</p>{/if}
			</div>
		</section>

		<section class="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4">
			<h2 class="text-sm font-semibold text-slate-900">File preview</h2>
			{#if selectedFile && previewUrl}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<span class="text-[11px] font-medium text-slate-500">Zoom</span>
					<button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={previewZoomPct <= 50} onclick={() => setPreviewZoom(previewZoomPct - 10)}>-</button>
					<button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums text-slate-700 hover:bg-slate-50" onclick={() => { previewZoomPct = 100; }}>{previewZoomPct}%</button>
					<button type="button" class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={previewZoomPct >= 200} onclick={() => setPreviewZoom(previewZoomPct + 10)}>+</button>
					<a href={previewUrl} target="_blank" rel="noreferrer" class="ml-auto text-xs font-medium text-[var(--sf-green)] hover:underline">Open in new tab</a>
				</div>
				<div class="mt-2 max-h-[min(72vh,820px)] w-full overflow-auto rounded-lg border border-slate-200 bg-slate-100/80">
					<div class="origin-top-left" style="transform: scale({previewScale}); width: {previewScale > 0 ? (100 / previewScale).toFixed(4) : 100}%;"><!-- zoom -->
						{#if selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')}
							<iframe title="PDF preview" class="block h-[min(65vh,720px)] w-full border-0 bg-white" src={previewUrl}></iframe>
						{:else if selectedFile.type.startsWith('image/')}
							<img alt="Preview" class="block max-h-[min(65vh,720px)] w-full object-contain bg-white" src={previewUrl} />
						{:else}
							<p class="p-4 text-xs text-slate-600">Inline preview is not available for this type: <span class="font-medium">{selectedFile.name}</span></p>
						{/if}
					</div>
				</div>
			{:else}
				<p class="mt-3 text-xs text-slate-500">Choose a file to see a preview here.</p>
			{/if}
			<h2 class="mt-6 text-sm font-semibold text-slate-900">Save result</h2>
			<div class="mt-2 space-y-1 text-xs text-slate-600">
				<p><span class="font-medium text-slate-800">Document ID:</span> {documentId ?? '-'}</p>
				<p><span class="font-medium text-slate-800">Entity ID:</span> {entityId ?? '-'}</p>
			</div>
			<h2 class="mt-4 text-sm font-semibold text-slate-900">Extracted text</h2>
			<pre class="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700">{rawText || 'Not extracted yet'}</pre>
		</section>
	</div>
</PageShell>

{#if showProjectPicker}
	<div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[8vh]" role="dialog" aria-modal="true">
		<div class="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="flex items-center justify-between border-b border-slate-200 px-5 py-3"><h2 class="text-sm font-semibold text-slate-900">Select Project</h2><button type="button" class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onclick={() => { showProjectPicker = false; }}>-</button></div>
			<div class="border-b border-slate-100 px-5 py-3">
				<div class="grid gap-3 lg:grid-cols-[2fr_1fr_1.3fr_auto]">
					<label class="space-y-1"><span class="text-xs font-medium text-slate-600">Project search</span><input class="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Project name / Project ID / Customer name" bind:value={projectSearchQ} onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchProjects(); } }} /></label>
					<label class="space-y-1"><span class="text-xs font-medium text-slate-600">Status</span><select class="w-full rounded border border-slate-300 px-3 py-2 text-sm" bind:value={projectSearchStatus}><option value="">All status</option><option value="active">active</option><option value="on_hold">on_hold</option><option value="completed">completed</option><option value="archived">archived</option></select></label>
					<label class="space-y-1"><span class="text-xs font-medium text-slate-600">Started on or after</span><input class="w-full rounded border border-slate-300 px-3 py-2 text-sm" type="date" bind:value={projectSearchStartedAfter} /></label>
					<button type="button" class="h-10 self-end rounded border border-[var(--sf-green)] bg-[var(--sf-green)] px-4 text-sm font-medium text-white hover:bg-[#2f5e2c]" onclick={() => void searchProjects()}>{projectSearching ? 'Searching...' : 'Apply'}</button>
				</div>
			</div>
			<div class="max-h-[50vh] overflow-auto px-5 py-3">
				{#if projectSearchResults.length === 0}
					<p class="py-6 text-center text-sm text-slate-400">{projectSearching ? 'Searching...' : 'No projects found. Try a different search.'}</p>
				{:else}
					<div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
						<table class="min-w-full divide-y divide-slate-200 text-xs">
							<thead class="bg-slate-50 text-left text-slate-600"><tr><th class="px-3 py-2">Project</th><th class="px-3 py-2">Customer</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Start / End</th><th class="px-3 py-2">Action</th></tr></thead>
							<tbody class="divide-y divide-slate-100">
								{#each projectSearchResults as p (p.id)}
									<tr class="hover:bg-slate-50/80"><td class="px-3 py-2"><p class="font-medium text-slate-800">{p.name}</p><p class="text-[11px] text-slate-400">{p.id}</p></td><td class="px-3 py-2">{p.customerName ?? '-'}</td><td class="px-3 py-2">{p.status}</td><td class="px-3 py-2">{p.startDate ?? '-'} / {p.endDate ?? '-'}</td><td class="px-3 py-2"><button type="button" class="rounded border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-2 py-1 text-[var(--sf-green)] hover:bg-[#dcefd8]" onclick={() => pickProject(p)}>Select</button></td></tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}


