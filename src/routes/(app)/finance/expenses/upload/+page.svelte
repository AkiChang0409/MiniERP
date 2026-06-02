<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import { preprocessImageForOcr } from '$lib/utils/preprocess-image';
	import {
		isLegacyDocMimeOrName,
		isLikelyDocxMimeOrName,
		looksLikeLegacyWordDoc,
		looksLikeZip,
		shouldParseAsDocx,
		tryExtractDocxPlainText
	} from '$platform/files/docx/extract-plain-text';
	import {
		EXPENSE_CATEGORY_OPTIONS,
		CATEGORY_DOC_TYPE_MAP,
		CATEGORY_DEFAULTS,
		CATEGORY_LABELS,
		EXPENSE_TYPE_LABELS,
		ALLOWANCE_RATES,
		CATEGORY_METADATA_FIELDS,
		CATEGORY_COMMON_FIELDS,
		EXPENSE_UPLOAD_CURRENCIES,
		normalizeExpenseCurrency,
		type ExpenseType,
		type ExpenseCategory
	} from '$modules/finance/schemas/expense-upload';

	let { data } = $props();

	// --- Project picker state ---
	type ProjectInfo = { id: string; name: string; customerName: string | null; status: string; startDate: string | null; endDate: string | null };
	let selectedProject = $state<ProjectInfo | null>(null);

	/** Server resolves ?projectId=�?(e.g. from project Expenses) and links the project automatically */
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

	const pageTitle = $derived(
		selectedProject ? `Upload Expense �?Project: ${selectedProject.name}` : 'Upload Expense'
	);

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
					.filter((r) => {
						if (!projectSearchStartedAfter) return true;
						return (r.project.startDate ?? '') >= projectSearchStartedAfter;
					})
					.map((r) => ({
						id: r.project.id,
						name: r.project.name,
						customerName: r.customerName,
						status: r.project.status,
						startDate: r.project.startDate,
						endDate: r.project.endDate
					}));
			}
		} catch { /* ignore */ }
		finally { projectSearching = false; }
	}

	function pickProject(p: ProjectInfo) {
		selectedProject = p;
		showProjectPicker = false;
	}

	function clearProject() {
		selectedProject = null;
	}

	// --- Core classification state ---
	let expenseType = $state<ExpenseType>('opex');
	let category = $state<ExpenseCategory>('transport');

	// --- File state ---
	let selectedFile = $state<File | null>(null);
	let previewUrl = $state<string | null>(null);
	let uploading = $state(false);
	let detecting = $state(false);
	let message = $state('');
	let error = $state('');
	let uploadedDocumentId = $state<string | null>(null);
	let detectSnapshot = $state<unknown>(null);
	let detectRawText = $state('');
	let expenseId = $state<string | null>(null);
	let duplicateExpenseId = $state<string | null>(null);

	/** Plain-text preview for .docx (same extraction path as detection) */
	let wordPreviewText = $state('');
	let wordPreviewStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let wordPreviewError = $state('');

	const isWordCandidateFile = $derived.by(() => {
		const f = selectedFile;
		if (!f) return false;
		return isLikelyDocxMimeOrName(f.type, f.name) || isLegacyDocMimeOrName(f.type, f.name);
	});

	/** PDF/image preview zoom (100 = native size; scroll outer container) */
	let previewZoomPct = $state(100);
	const previewScale = $derived(previewZoomPct / 100);

	function setPreviewZoom(next: number): void {
		previewZoomPct = Math.min(200, Math.max(50, Math.round(next / 5) * 5));
	}

	$effect(() => {
		if (!selectedFile) {
			previewUrl = null;
			return;
		}
		const f = selectedFile;
		const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
		const isImg = f.type.startsWith('image/');
		if (!isPdf && !isImg) {
			previewUrl = null;
			return;
		}
		const url = URL.createObjectURL(f);
		previewUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	$effect(() => {
		if (!selectedFile || !needsFile) {
			wordPreviewText = '';
			wordPreviewStatus = 'idle';
			wordPreviewError = '';
			return;
		}
		const f = selectedFile;
		if (!isLikelyDocxMimeOrName(f.type, f.name) && !isLegacyDocMimeOrName(f.type, f.name)) {
			wordPreviewText = '';
			wordPreviewStatus = 'idle';
			wordPreviewError = '';
			return;
		}

		wordPreviewStatus = 'loading';
		wordPreviewError = '';
		wordPreviewText = '';

		let cancelled = false;
		void f.arrayBuffer().then((buf) => {
			if (cancelled) return;
			if (looksLikeLegacyWordDoc(buf) && !looksLikeZip(buf)) {
				wordPreviewStatus = 'error';
				wordPreviewError =
					'Legacy Word (.doc) cannot be previewed or detected here. In Word use Save As �?.docx, then upload.';
				wordPreviewText = '';
				return;
			}
			if (!shouldParseAsDocx(f.type, f.name, buf)) {
				wordPreviewStatus = 'error';
				wordPreviewError = 'This file is not a valid .docx (missing Word document.xml).';
				wordPreviewText = '';
				return;
			}
			const t = tryExtractDocxPlainText(buf);
			if (!t) {
				wordPreviewStatus = 'error';
				wordPreviewError = 'Could not extract text from this .docx (file may be corrupt or image-only).';
				wordPreviewText = '';
				return;
			}
			wordPreviewText =
				t.length > 80_000 ? `${t.slice(0, 80_000)}\n\n�?(preview truncated; detection still uses full text)` : t;
			wordPreviewStatus = 'ready';
		});
		return () => {
			cancelled = true;
		};
	});

	// --- Common fields ---
	let amount = $state('');
	let currency = $state('SGD');
	let expenseDate = $state(new Date().toISOString().slice(0, 10));
	let vendorOrSupplier = $state('');
	let staffName = $state('');
	let gstAmount = $state('');
	let notes = $state('');

	// --- Boolean tags ---
	let reimbursement = $state(false);
	let businessTrip = $state(false);
	let destination = $state('');

	// --- Allowance-specific ---
	let allowanceDateStart = $state('');
	let allowanceDateEnd = $state('');
	let allowanceDailyRate = $state('');

	// --- Scene-specific metadata fields ---
	let metaFields = $state<Record<string, string>>({});

	const currentCategories = $derived(EXPENSE_CATEGORY_OPTIONS[expenseType]);
	const autoDocType = $derived(CATEGORY_DOC_TYPE_MAP[category] ?? null);
	const isAllowance = $derived(category === 'allowance');
	const needsFile = $derived(!isAllowance);
	const metadataFieldDefs = $derived(CATEGORY_METADATA_FIELDS[category] ?? []);
	const commonVisibility = $derived(CATEGORY_COMMON_FIELDS[category] ?? { vendorOrSupplier: true, staffName: true, gstAmount: true });

	const allowanceDays = $derived.by(() => {
		if (!allowanceDateStart || !allowanceDateEnd) return 0;
		const start = new Date(allowanceDateStart);
		const end = new Date(allowanceDateEnd);
		const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
		return diff > 0 ? diff : 0;
	});

	const allowanceTotal = $derived.by(() => {
		const rate = Number(allowanceDailyRate) || 0;
		return allowanceDays * rate;
	});

	$effect(() => {
		if (!currentCategories.includes(category as never)) {
			category = currentCategories[0] as ExpenseCategory;
		}
	});

	$effect(() => {
		const defaults = CATEGORY_DEFAULTS[category];
		if (defaults) {
			reimbursement = defaults.reimbursement;
			businessTrip = defaults.businessTrip;
		}
		const fresh: Record<string, string> = {};
		for (const f of (CATEGORY_METADATA_FIELDS[category] ?? [])) {
			fresh[f.key] = '';
		}
		metaFields = fresh;
	});

	$effect(() => {
		const lower = destination.toLowerCase();
		if (lower in ALLOWANCE_RATES) {
			allowanceDailyRate = String(ALLOWANCE_RATES[lower]);
		}
	});

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

	function onPickFile(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		selectedFile = input.files?.[0] ?? null;
		detectSnapshot = null;
		detectRawText = '';
		message = '';
		error = '';
		previewZoomPct = 100;
		wordPreviewText = '';
		wordPreviewStatus = 'idle';
		wordPreviewError = '';
	}

	async function runOcrDetect(): Promise<void> {
		if (!selectedFile || isAllowance) return;
		detecting = true;
		error = '';
		message = '';
		try {
			const fd = new FormData();
			fd.set('file', selectedFile);
			fd.set('expenseType', expenseType);
			fd.set('category', category);
			if (autoDocType) fd.set('docType', autoDocType);

			// Client-side text extraction before sending to server
			const mime = selectedFile.type.toLowerCase();
			const fname = selectedFile.name.toLowerCase();
			const isPdf = mime === 'application/pdf' || fname.endsWith('.pdf');
			const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(fname);

			if (isImage) {
				// Image: preprocess then run OCR
				const processed = await preprocessImageForOcr(selectedFile);
				const ocrText = await runImageOcr(processed, processed.name);
				if (ocrText.trim()) fd.set('rawText', ocrText);
			} else if (isPdf) {
				// PDF: try pdfjs text extraction first
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

			const res = await fetch('/api/finance/expenses/detect', { method: 'POST', body: fd });
			const txt = await res.text();
			let json: any = null;
			try {
				json = txt ? JSON.parse(txt) : null;
			} catch {
				/* ignore */
			}
			if (!res.ok || !json?.ok) {
				const detailMsg = json?.details?.message;
				throw new Error([json?.error || 'Detection failed', detailMsg, txt].filter(Boolean).join(': '));
			}
			const data = json.data as {
				suggestions?: Record<string, unknown>;
				metaHints?: Record<string, string>;
				extracted?: unknown;
				rawTextPreview?: string;
				rawTextLength?: number;
				confidence?: number;
				provider?: string;
				ocr?: { warnings?: string[] };
			};
			detectSnapshot = data.extracted ?? null;
			detectRawText = typeof data.rawTextPreview === 'string' ? data.rawTextPreview : '';
			const s = data.suggestions ?? {};
			if (typeof s.amount === 'number') amount = String(s.amount);
			if (typeof s.currency === 'string') {
				const c = normalizeExpenseCurrency(s.currency);
				if (c) currency = c;
			}
			if (typeof s.expenseDate === 'string' && s.expenseDate) expenseDate = s.expenseDate;
			if (typeof s.vendorOrSupplier === 'string' && s.vendorOrSupplier) vendorOrSupplier = s.vendorOrSupplier;
			if (typeof s.gstAmount === 'number') gstAmount = String(s.gstAmount);
			const hints = data.metaHints ?? {};
			const nextMeta = { ...metaFields };
			for (const f of metadataFieldDefs) {
				const v = hints[f.key];
				if (v != null && v !== '') nextMeta[f.key] = String(v);
			}
			metaFields = nextMeta;
			const confidenceLabel =
				typeof data.confidence === 'number' ? `, confidence ${Math.round(data.confidence)}%` : '';
			const providerLabel = data.provider ? ` (${data.provider})` : '';
			const textLen = data.rawTextLength ?? 0;
			const textLenLabel = textLen > 0 ? `, ${textLen} characters extracted` : ', no text extracted';
			const ocrWarnings = data.ocr?.warnings ?? [];
			const warnLabel = ocrWarnings.length > 0 ? `\nNote: ${ocrWarnings.join('; ')}` : '';
			message = `OCR+AI detection finished${providerLabel}${confidenceLabel}${textLenLabel}. Review before saving.${warnLabel}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Detection failed';
		} finally {
			detecting = false;
		}
	}

	function buildPayload() {
		const filteredMeta: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(metaFields)) {
			if (v !== '') {
				const def = metadataFieldDefs.find((d) => d.key === k);
				filteredMeta[k] = def?.type === 'number' ? Number(v) : v;
			}
		}

		const base: Record<string, unknown> = {
			expenseType,
			category,
			docType: autoDocType,
			projectId: selectedProject?.id ?? null,
			date: expenseDate || null,
			amount: amount ? Number(amount) : null,
			currency,
			gstAmount: gstAmount ? Number(gstAmount) : null,
			vendorOrSupplier: vendorOrSupplier || null,
			staffName: staffName || null,
			reimbursement,
			businessTrip,
			destination: destination || null,
			notes: notes || null,
			metadata: Object.keys(filteredMeta).length > 0 ? filteredMeta : null
		};
		if (isAllowance) {
			base.amount = allowanceTotal;
			base.metadata = {
				days: allowanceDays,
				daily_rate: Number(allowanceDailyRate) || 0,
				date_start: allowanceDateStart,
				date_end: allowanceDateEnd
			};
			base.date = allowanceDateStart || expenseDate;
		}
		return base;
	}

	async function upload(): Promise<void> {
		if (needsFile && !selectedFile) {
			error = 'Please choose a file first.';
			return;
		}

		uploading = true;
		error = '';
		message = '';
		duplicateExpenseId = null;

		try {
			const payload = buildPayload();

			if (isAllowance) {
				if (!staffName) {
					throw new Error('Allowance requires Staff Name.');
				}
				if (!allowanceDateStart || !allowanceDateEnd) {
					throw new Error('Allowance requires start and end dates.');
				}
				const res = await fetch('/api/finance/expenses/upload', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ ...payload, allowance: true })
				});
				const txt = await res.text();
				let json: any = null;
				try {
					json = txt ? JSON.parse(txt) : null;
				} catch {
					// keep json null, use txt below
				}
				if (!res.ok || !json?.ok) {
					const detailMsg = json?.details?.message;
					throw new Error(
						[json?.error || 'Save failed', detailMsg, txt].filter(Boolean).join(': ')
					);
				}
				expenseId = json.data?.expenseId ?? null;
				message = `Allowance record created. Expense ID: ${expenseId ?? '-'}`;
				return;
			}

			if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
				throw new Error('Enter a valid Amount before saving (stored on the expense record).');
			}
			if (!expenseDate?.trim()) {
				throw new Error('Please set the Date.');
			}

			const entityId = crypto.randomUUID();
			const presignRes = await fetch('/api/upload/presign', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					fileName: selectedFile!.name,
					contentType: selectedFile!.type || 'application/octet-stream',
					projectId: selectedProject?.id ?? 'company',
					entityType: 'expense',
					entityId
				})
			});
			const presignTxt = await presignRes.text();
			let presignJson: any = null;
			try {
				presignJson = presignTxt ? JSON.parse(presignTxt) : null;
			} catch {
				// keep presignJson null
			}
			if (!presignRes.ok || !presignJson?.ok || !presignJson?.data) {
				throw new Error(presignJson?.error || presignTxt || `Could not create upload target (${presignRes.status})`);
			}

			const putRes = await fetch(presignJson.data.uploadUrl, {
				method: 'PUT',
				headers: { 'content-type': selectedFile!.type || 'application/octet-stream' },
				body: selectedFile
			});
			if (!putRes.ok) throw new Error('File upload to storage failed');

			const saveRes = await fetch('/api/finance/expenses/upload', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					idempotencyKey: crypto.randomUUID(),
					key: presignJson.data.key,
					fileName: selectedFile!.name,
					fileType: selectedFile!.type || 'application/octet-stream',
					...payload
				})
			});
			const saveTxt = await saveRes.text();
			let saveJson:
				| {
						ok?: boolean;
						error?: string;
						details?: { code?: string; existingEntityId?: string; message?: string };
						data?: { documentId?: string; expenseId?: string };
				  }
				| null = null;
			try {
				saveJson = saveTxt ? JSON.parse(saveTxt) : null;
			} catch {
				// keep saveJson null
			}
			if (saveRes.status === 409 && saveJson?.details?.code === 'DUPLICATE_FILE_UPLOAD') {
				duplicateExpenseId = saveJson.details.existingEntityId ?? null;
				error = duplicateExpenseId
					? 'This file has already been recorded as an expense. Duplicate upload is not allowed. You can open the existing record below.'
					: 'This file has already been recorded as an expense. Duplicate upload is not allowed.';
				return;
			}
			if (!saveRes.ok || !saveJson?.ok) {
				const detailMsg = saveJson?.details?.message;
				throw new Error(
					[saveJson?.error || 'Save failed', detailMsg, saveTxt].filter(Boolean).join(': ')
				);
			}

			uploadedDocumentId = saveJson.data?.documentId ?? null;
			expenseId = saveJson.data?.expenseId ?? null;
			message = `Saved: Document ${uploadedDocumentId ?? '-'}, Expense ${expenseId ?? '-'}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}
</script>

<PageShell
	eyebrow="Finance / Expenses"
	title={pageTitle}
	description="After you pick a file, preview it on the right. Optionally run OCR+AI to prefill the form. Upload Document writes to R2, documents, and expenses."
>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-2">
			{#if selectedProject}
				<span class="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
					<span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
					{selectedProject.name}
					{#if selectedProject.customerName}
						<span class="text-emerald-600">({selectedProject.customerName})</span>
					{/if}
					<button type="button" class="ml-1 text-emerald-500 hover:text-emerald-800" onclick={clearProject} title="Unlink project">-</button>
				</span>
			{/if}
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
				onclick={() => { showProjectPicker = true; void searchProjects(); }}
			>
				<span aria-hidden="true">📁</span>
				{selectedProject ? 'Change Project' : 'Link Project'}
			</button>
		</div>
	{/snippet}
	<div
		class="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-8"
	>
		<!-- Left: Upload form -->
		<section class="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
			<h2 class="text-sm font-semibold text-slate-900">Expense intake</h2>

			<div class="mt-4 space-y-4">
				<!-- Expense Type + Category -->
				<div class="grid gap-3 md:grid-cols-2">
					<label>
						<span class="mb-1 block text-xs font-medium text-slate-700">Expense Type</span>
						<select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={expenseType}>
							{#each Object.entries(EXPENSE_TYPE_LABELS) as [key, label]}
								<option value={key}>{label}</option>
							{/each}
						</select>
					</label>
					<label>
						<span class="mb-1 block text-xs font-medium text-slate-700">Category</span>
						<select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={category}>
							{#each currentCategories as item}
								<option value={item}>{CATEGORY_LABELS[item] ?? item}</option>
							{/each}
						</select>
					</label>
				</div>

				<!-- Auto-derived doc type display -->
				<div class="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
					Auto Doc Type: <span class="font-medium">{autoDocType ?? 'None (no file)'}</span>
				</div>

				<!-- File upload (hidden for allowance) -->
				{#if needsFile}
					<label class="block">
						<span class="mb-1 block text-xs font-medium text-slate-700">File</span>
						<input
							type="file"
							accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.txt,.csv,.eml,.doc,.docx,.xls,.xlsx"
							class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
							onchange={onPickFile}
						/>
					</label>
				{/if}

				<!-- Allowance-specific fields -->
				{#if isAllowance}
					<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
						<p class="text-xs font-semibold text-amber-800">Trip daily allowance (no file �?manual entry)</p>
						<label class="block">
							<span class="mb-1 block text-xs font-medium text-slate-700">Staff Name</span>
							<select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={staffName}>
								<option value="">-- Select --</option>
								{#each data.employees as emp}
									<option value={emp.name}>{emp.name}</option>
								{/each}
							</select>
						</label>
						<label class="block">
							<span class="mb-1 block text-xs font-medium text-slate-700">Destination</span>
							<select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={destination}>
								<option value="">-- Select --</option>
								<option value="china">China (SGD 50/day)</option>
								<option value="malaysia">Malaysia (SGD 45/day)</option>
								<option value="other">Other (manual rate)</option>
							</select>
						</label>
						{#if destination === 'other'}
							<label class="block">
								<span class="mb-1 block text-xs font-medium text-slate-700">Daily Rate (SGD)</span>
								<input type="number" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={allowanceDailyRate} />
							</label>
						{/if}
						<div class="grid gap-3 md:grid-cols-2">
							<label>
								<span class="mb-1 block text-xs font-medium text-slate-700">Start Date</span>
								<input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={allowanceDateStart} />
							</label>
							<label>
								<span class="mb-1 block text-xs font-medium text-slate-700">End Date</span>
								<input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={allowanceDateEnd} />
							</label>
						</div>
						<div class="grid grid-cols-3 gap-3 text-sm">
							<div><span class="text-xs text-slate-500">Days:</span> <strong>{allowanceDays}</strong></div>
							<div><span class="text-xs text-slate-500">Rate:</span> <strong>{allowanceDailyRate || '-'}</strong></div>
							<div><span class="text-xs text-slate-500">Total:</span> <strong class="text-emerald-700">SGD {allowanceTotal.toFixed(2)}</strong></div>
						</div>
					</div>
				{/if}

			<!-- Common financial fields (non-allowance) -->
			{#if !isAllowance}
				{#if needsFile}
					<p class="text-[11px] text-slate-500">With a file: Amount and Date are required before save. Use OCR + AI on the right to prefill.</p>
				{/if}
				<div class="grid gap-3 md:grid-cols-2">
					<label>
						<span class="mb-1 block text-xs font-medium text-slate-700">Amount</span>
						<input type="number" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={amount} placeholder="Required (OCR can prefill)" />
					</label>
					<label>
						<span class="mb-1 block text-xs font-medium text-slate-700">Currency</span>
						<select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={currency}>
							{#each EXPENSE_UPLOAD_CURRENCIES as code (code)}
								<option value={code}>{code}</option>
							{/each}
						</select>
					</label>
				</div>

				<div class="grid gap-3 md:grid-cols-2">
					<label>
						<span class="mb-1 block text-xs font-medium text-slate-700">Date</span>
						<input type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={expenseDate} />
					</label>
					{#if commonVisibility.gstAmount}
						<label>
							<span class="mb-1 block text-xs font-medium text-slate-700">GST Amount</span>
							<input type="number" step="0.01" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={gstAmount} placeholder="0" />
						</label>
					{/if}
				</div>

				<div class="grid gap-3 md:grid-cols-2">
					{#if commonVisibility.vendorOrSupplier}
						<label>
							<span class="mb-1 block text-xs font-medium text-slate-700">Vendor / Supplier</span>
							<input type="text" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={vendorOrSupplier} placeholder="Vendor / merchant name" />
						</label>
					{/if}
					{#if commonVisibility.staffName}
						<label>
							<span class="mb-1 block text-xs font-medium text-slate-700">Staff Name</span>
							<select class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={staffName}>
								<option value="">-- none --</option>
								{#each data.employees as emp}
									<option value={emp.name}>{emp.name}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>
			{/if}

			<!-- Dynamic metadata fields per category -->
			{#if metadataFieldDefs.length > 0 && !isAllowance}
				<div class="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
					<p class="text-xs font-semibold text-blue-800">
						{CATEGORY_LABELS[category] ?? category} �?extra fields
						<span class="ml-1 font-normal text-blue-600">(LLM may fill these; you can edit manually)</span>
					</p>
					<div class="grid gap-3 md:grid-cols-2">
						{#each metadataFieldDefs as field (field.key)}
							<label>
								<span class="mb-1 flex items-center gap-1 text-xs font-medium text-slate-700">
									{field.label}
									{#if field.source === 'llm'}
										<span class="rounded bg-blue-100 px-1 py-0.5 text-[10px] text-blue-600">LLM</span>
									{:else}
										<span class="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">Manual</span>
									{/if}
								</span>
								{#if field.type === 'date'}
									<input
										type="date"
										class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
										value={metaFields[field.key] ?? ''}
										oninput={(e) => { metaFields[field.key] = (e.currentTarget as HTMLInputElement).value; }}
									/>
								{:else if field.type === 'number'}
									<input
										type="number"
										step="0.01"
										class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
										value={metaFields[field.key] ?? ''}
										oninput={(e) => { metaFields[field.key] = (e.currentTarget as HTMLInputElement).value; }}
									/>
								{:else}
									<input
										type="text"
										class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
										value={metaFields[field.key] ?? ''}
										oninput={(e) => { metaFields[field.key] = (e.currentTarget as HTMLInputElement).value; }}
									/>
								{/if}
							</label>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Boolean tags -->
			<div class="flex flex-wrap items-center gap-4">
				<label class="flex items-center gap-2 text-sm text-slate-700">
					<input type="checkbox" class="rounded border-slate-300" bind:checked={reimbursement} />
					Reimbursement (staff paid out of pocket)
				</label>
				<label class="flex items-center gap-2 text-sm text-slate-700">
					<input type="checkbox" class="rounded border-slate-300" bind:checked={businessTrip} />
					Business trip
				</label>
			</div>

			{#if businessTrip && !isAllowance}
				<label class="block">
					<span class="mb-1 block text-xs font-medium text-slate-700">Destination</span>
					<input type="text" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={destination} placeholder="Trip destination" />
				</label>
			{/if}

			<!-- Notes -->
			<label class="block">
				<span class="mb-1 block text-xs font-medium text-slate-700">Notes</span>
				<input type="text" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" bind:value={notes} placeholder="Notes" />
			</label>

				<!-- Preview -->
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
					<p class="text-xs font-semibold text-slate-700">Payload Preview</p>
					<pre class="mt-2 overflow-x-auto text-[11px] leading-relaxed text-slate-700">{JSON.stringify(buildPayload(), null, 2)}</pre>
				</div>

				<!-- Actions -->
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-50"
						disabled={uploading}
						onclick={() => void upload()}
					>
						{uploading ? 'Saving...' : isAllowance ? 'Create Allowance' : 'Upload Document'}
					</button>
					<a href="/finance/expenses" class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Back</a>
				</div>

				{#if message}
					<p class="text-sm text-emerald-700">{message}</p>
				{/if}
				{#if error}
					<p class="text-sm text-rose-700">{error}</p>
					{#if duplicateExpenseId}
						<p class="text-xs text-slate-600">
							<a class="text-[var(--sf-green)] hover:underline" href={`/finance/expenses/${duplicateExpenseId}`}>
								View existing expense record
							</a>
						</p>
					{/if}
				{/if}
			</div>
		</section>

		<!-- Right: preview + optional OCR (same column width as form) -->
		<section class="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-4">
			<h2 class="text-sm font-semibold text-slate-900">File preview</h2>
			{#if needsFile && selectedFile && previewUrl}
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<span class="text-[11px] font-medium text-slate-500">Zoom</span>
					<button
						type="button"
						class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
						disabled={previewZoomPct <= 50}
						onclick={() => setPreviewZoom(previewZoomPct - 10)}
						title="Zoom out"
					>
						�?
					</button>
					<button
						type="button"
						class="rounded border border-slate-300 bg-white px-2 py-1 text-xs tabular-nums text-slate-700 hover:bg-slate-50"
						onclick={() => { previewZoomPct = 100; }}
						title="Reset to 100%"
					>
						{previewZoomPct}%
					</button>
					<button
						type="button"
						class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
						disabled={previewZoomPct >= 200}
						onclick={() => setPreviewZoom(previewZoomPct + 10)}
						title="Zoom in"
					>
						+
					</button>
					<a
						href={previewUrl}
						target="_blank"
						rel="noreferrer"
						class="ml-auto text-xs font-medium text-[var(--sf-green)] hover:underline"
					>
						Open in new tab
					</a>
				</div>
				<div
					class="mt-2 max-h-[min(72vh,820px)] w-full overflow-auto rounded-lg border border-slate-200 bg-slate-100/80"
				>
					<div
						class="origin-top-left"
						style="transform: scale({previewScale}); width: {previewScale > 0 ? (100 / previewScale).toFixed(4) : 100}%;"
					>
						{#if selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')}
							<iframe
								title="PDF preview"
								class="block h-[min(65vh,720px)] w-full border-0 bg-white"
								src={previewUrl}
							></iframe>
						{:else if selectedFile.type.startsWith('image/')}
							<img
								alt="Preview"
								class="block max-h-[min(65vh,720px)] w-full object-contain bg-white"
								src={previewUrl}
							/>
						{:else}
							<p class="p-4 text-xs text-slate-600">
								Inline preview not available for this type. Selected: <span class="font-medium">{selectedFile.name}</span>
							</p>
						{/if}
					</div>
				</div>
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-[#dcefd8] disabled:opacity-50"
						disabled={detecting}
						onclick={() => void runOcrDetect()}
					>
						{detecting ? 'Detecting...' : 'OCR + AI detect & fill'}
					</button>
					<p class="text-[11px] text-slate-500 self-center">Optional; skip for fully manual entry. Detection does not save a record.</p>
				</div>
			{:else if needsFile && selectedFile && isWordCandidateFile}
				<p class="mt-2 text-[11px] text-slate-500">
					Word (.docx) shows extracted body text here; detection uses that text (no vision OCR).
				</p>
				{#if wordPreviewStatus === 'loading'}
					<p class="mt-4 text-sm text-slate-600">Reading Word text-</p>
				{:else if wordPreviewStatus === 'error'}
					<p class="mt-4 text-sm text-rose-700">{wordPreviewError}</p>
				{:else if wordPreviewStatus === 'ready' && wordPreviewText}
					<div class="mt-3 flex flex-wrap items-center gap-2">
						<span class="text-[11px] font-medium text-slate-500">Font size</span>
						<button
							type="button"
							class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
							onclick={() => setPreviewZoom(previewZoomPct - 10)}
						>
							�?
						</button>
						<span class="text-xs tabular-nums text-slate-600">{previewZoomPct}%</span>
						<button
							type="button"
							class="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
							onclick={() => setPreviewZoom(previewZoomPct + 10)}
						>
							+
						</button>
					</div>
					<div
						class="mt-2 max-h-[min(72vh,820px)] overflow-auto rounded-lg border border-slate-200 bg-white p-3"
					>
						<pre
							class="whitespace-pre-wrap break-words font-sans text-slate-800 leading-relaxed"
							style="font-size: {Math.max(10, Math.round(13 * (previewZoomPct / 100)))}px;"
						>{wordPreviewText}</pre>
					</div>
				{/if}
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-[#dcefd8] disabled:opacity-50"
						disabled={detecting || wordPreviewStatus === 'loading' || wordPreviewStatus === 'error'}
						onclick={() => void runOcrDetect()}
					>
						{detecting ? 'Detecting...' : 'Detect & fill'}
					</button>
					<p class="text-[11px] text-slate-500 self-center">Full .docx text is sent to the model for field parsing.</p>
				</div>
			{:else if needsFile && selectedFile}
				<p class="mt-3 text-xs text-slate-600">
					No in-browser preview for <span class="font-medium">{selectedFile.name}</span>. You can still complete the form and save; try Detect for autofill when the format allows it.
				</p>
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						class="rounded-md border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] hover:bg-[#dcefd8] disabled:opacity-50"
						disabled={detecting}
						onclick={() => void runOcrDetect()}
					>
						{detecting ? 'Detecting...' : 'OCR + AI detect & fill'}
					</button>
				</div>
			{:else if needsFile}
				<p class="mt-3 text-xs text-slate-500">Choose a file to see a preview here.</p>
			{/if}

			<h2 class="mt-6 text-sm font-semibold text-slate-900">Save result</h2>
			<div class="mt-2 space-y-1 text-xs text-slate-600">
				<p><span class="font-medium text-slate-800">Document ID:</span> {uploadedDocumentId ?? '-'}</p>
				<p><span class="font-medium text-slate-800">Expense ID:</span> {expenseId ?? '-'}</p>
				{#if expenseId}
					<p><a class="text-[var(--sf-green)] hover:underline" href="/finance/expenses">View in expense list</a></p>
				{/if}
			</div>

			{#if detectRawText || (detectSnapshot !== null)}
				<details class="mt-4 rounded-lg border border-slate-200 bg-slate-50" open={!!detectRawText}>
					<summary class="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100/80">
						OCR text ({detectRawText.length} chars) �?click to expand/collapse
					</summary>
					{#if detectRawText}
						<pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-slate-200 px-3 py-2 text-[11px] leading-relaxed text-slate-700">{detectRawText}</pre>
					{:else}
						<p class="border-t border-slate-200 px-3 py-2 text-[11px] text-amber-700">No text extracted (image-only PDF or scan)</p>
					{/if}
				</details>
			{/if}

			<h2 class="mt-4 text-sm font-semibold text-slate-900">Category Notes</h2>
			<ul class="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600">
				<li><strong>OpEx</strong>: transport, accommodation, meal, gift, allowance, ai_subscription, logistics, purchase, others</li>
				<li><strong>Sales Cost</strong>: invoice, receipt</li>
				<li><strong>Allowance</strong>: no file upload; manual entry only. Daily rate is suggested from the destination.</li>
				<li>Boolean flags (reimbursement / business_trip) default per category presets.</li>
			</ul>
		</section>
	</div>
</PageShell>

<!-- Project Picker Modal -->
{#if showProjectPicker}
	<div class="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[8vh]" role="dialog" aria-modal="true">
		<div class="w-full max-w-3xl rounded-xl border border-slate-200 bg-white shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-slate-200 px-5 py-3">
				<h2 class="text-sm font-semibold text-slate-900">Select Project</h2>
				<button type="button" class="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onclick={() => { showProjectPicker = false; }}>-</button>
			</div>

			<!-- Filters -->
			<div class="border-b border-slate-100 px-5 py-3">
				<div class="grid gap-3 lg:grid-cols-[2fr_1fr_1.3fr_auto]">
					<label class="space-y-1">
						<span class="text-xs font-medium text-slate-600">Project search</span>
						<input
							class="w-full rounded border border-slate-300 px-3 py-2 text-sm"
							placeholder="Project name / Project ID / Customer name"
							bind:value={projectSearchQ}
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchProjects(); } }}
						/>
					</label>
					<label class="space-y-1">
						<span class="text-xs font-medium text-slate-600">Status</span>
						<select class="w-full rounded border border-slate-300 px-3 py-2 text-sm" bind:value={projectSearchStatus}>
							<option value="">All status</option>
							<option value="active">active</option>
							<option value="on_hold">on_hold</option>
							<option value="completed">completed</option>
							<option value="archived">archived</option>
						</select>
					</label>
					<label class="space-y-1">
						<span class="text-xs font-medium text-slate-600">Started on or after</span>
						<input class="w-full rounded border border-slate-300 px-3 py-2 text-sm" type="date" bind:value={projectSearchStartedAfter} />
					</label>
					<button
						type="button"
						class="h-10 self-end rounded border border-[var(--sf-green)] bg-[var(--sf-green)] px-4 text-sm font-medium text-white hover:bg-[#2f5e2c]"
						onclick={() => void searchProjects()}
					>
						{projectSearching ? 'Searching...' : 'Apply'}
					</button>
				</div>
			</div>

			<!-- Results -->
			<div class="max-h-[50vh] overflow-auto px-5 py-3">
				{#if projectSearchResults.length === 0}
					<p class="py-6 text-center text-sm text-slate-400">
						{projectSearching ? 'Searching...' : 'No projects found. Try a different search.'}
					</p>
				{:else}
					<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Matched projects</p>
					<div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
						<table class="min-w-full divide-y divide-slate-200 text-xs">
							<thead class="bg-slate-50 text-left text-slate-600">
								<tr>
									<th class="px-3 py-2">Project</th>
									<th class="px-3 py-2">Customer</th>
									<th class="px-3 py-2">Status</th>
									<th class="px-3 py-2">Start / End</th>
									<th class="px-3 py-2">Action</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-slate-100">
								{#each projectSearchResults as p (p.id)}
									<tr class="hover:bg-slate-50/80">
										<td class="px-3 py-2">
											<p class="font-medium text-slate-800">{p.name}</p>
											<p class="text-[11px] text-slate-400">{p.id}</p>
										</td>
										<td class="px-3 py-2">{p.customerName ?? '-'}</td>
										<td class="px-3 py-2">
											<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{p.status}</span>
										</td>
										<td class="px-3 py-2">{p.startDate ?? '-'} / {p.endDate ?? '-'}</td>
										<td class="px-3 py-2">
											<button
												type="button"
												class="rounded border border-[var(--sf-green)] bg-[var(--sf-green-soft)] px-2 py-1 text-[var(--sf-green)] hover:bg-[#dcefd8]"
												onclick={() => pickProject(p)}
											>
												Select
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between border-t border-slate-100 px-5 py-3">
				<p class="text-xs text-slate-500">{projectSearchResults.length} project(s) found</p>
				<div class="flex gap-2">
					{#if selectedProject}
						<button type="button" class="rounded border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50" onclick={() => { clearProject(); showProjectPicker = false; }}>
							Unlink Project
						</button>
					{/if}
					<button type="button" class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50" onclick={() => { showProjectPicker = false; }}>
						Cancel
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}


