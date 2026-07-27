<script lang="ts">
	let { data } = $props();

	type FileTemplate = {
		recordId: string;
		name: string;
		code: string | null;
		category: string | null;
		referenceOnly: boolean;
		fieldSchema: string | null;
		info: string | null;
		file: { fileToken: string; name: string; mimeType: string; size: number | null } | null;
	};
	type Column = {
		key: string;
		label: string;
		type: 'text' | 'textarea' | 'date' | 'number' | 'computed';
		/** For type='computed': product of column keys, e.g. "power*priority*relevance". */
		formula?: string;
		help?: string;
	};
	type ChecklistItem = { key: string; ref?: string; group?: string; label: string };
	type Choice = { value: string; label: string };
	type SchemaField = {
		key: string;
		label: string;
		type: 'text' | 'textarea' | 'date' | 'list' | 'table' | 'checklist';
		required?: boolean;
		help?: string;
		examples?: string[];
		/** For type='table': repeatable-row columns (→ docxtemplater row loop). */
		columns?: Column[];
		/** For type='checklist': fixed items + per-item choice(s) and a note. Each
		 * item expands to flat placeholders `{itemKey_choiceValue}` (mark) and
		 * `{itemKey_note}`. */
		items?: ChecklistItem[];
		choices?: Choice[];
		noteLabel?: string;
	};
	type SchemaIntro = { clause?: string; purpose?: string; notes?: string };
	type FieldSchema = {
		version?: number;
		engine?: string;
		layout?: 'quadrant' | 'grid' | 'stack';
		intro?: SchemaIntro;
		fields: SchemaField[];
	};

	type Row = Record<string, string>;

	const item = $derived(data.item as FileTemplate);
	const revision = $derived(data.revision as number | null);

	const parsed = $derived.by(() => {
		if (!item.fieldSchema) return { schema: null as FieldSchema | null, error: null as string | null };
		try {
			return { schema: JSON.parse(item.fieldSchema) as FieldSchema, error: null };
		} catch (e) {
			return { schema: null as FieldSchema | null, error: (e as Error).message };
		}
	});
	const schema = $derived(parsed.schema);

	type Kind = 'reference' | 'fillable' | 'pending';
	const kind = $derived<Kind>(
		item.referenceOnly ? 'reference' : schema && schema.fields?.length ? 'fillable' : 'pending'
	);

	// --- format + badges ---
	type Fmt = 'docx' | 'xlsx' | 'pdf' | 'zip' | 'other';
	function formatOf(fileName: string | null | undefined): Fmt {
		const n = (fileName ?? '').toLowerCase();
		if (n.endsWith('.docx') || n.endsWith('.doc')) return 'docx';
		if (n.endsWith('.xlsx') || n.endsWith('.xls')) return 'xlsx';
		if (n.endsWith('.pdf')) return 'pdf';
		if (n.endsWith('.zip')) return 'zip';
		return 'other';
	}
	const fmt = $derived(formatOf(item.file?.name));
	const fmtBadge: Record<Fmt, string> = {
		docx: 'bg-sky-50 text-sky-700 ring-sky-200',
		xlsx: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
		pdf: 'bg-rose-50 text-rose-700 ring-rose-200',
		zip: 'bg-amber-50 text-amber-700 ring-amber-200',
		other: 'bg-slate-100 text-slate-600 ring-slate-200'
	};

	// --- attachment urls ---
	function attUrl(download: boolean): string | null {
		if (!item.file) return null;
		const p = new URLSearchParams({ token: item.file.fileToken, name: item.file.name });
		if (revision != null) p.set('rev', String(revision));
		if (download) p.set('download', '1');
		return `/api/qms/file-template/attachment?${p.toString()}`;
	}
	const inlineUrl = $derived(attUrl(false));
	const dlUrl = $derived(attUrl(true));

	// --- form model ---
	// A checklist item's captured state: the chosen option + a bag of extra values
	// (the `note`, and/or per-column values when the checklist has `columns`).
	type Check = { choice: string; values: Record<string, string> };
	let fillValues = $state<Record<string, string>>({}); // scalar fields
	let tableData = $state<Record<string, Row[]>>({}); // table (repeatable-row) fields
	let checkData = $state<Record<string, Record<string, Check>>>({}); // checklist fields
	let lastRecord = '';

	function emptyRow(cols: Column[]): Row {
		return Object.fromEntries(cols.map((c) => [c.key, '']));
	}

	$effect(() => {
		if (item.recordId !== lastRecord) {
			lastRecord = item.recordId;
			const fields = schema?.fields ?? [];
			fillValues = Object.fromEntries(
				fields.filter((f) => f.type !== 'table' && f.type !== 'checklist').map((f) => [f.key, ''])
			);
			tableData = Object.fromEntries(
				fields
					.filter((f) => f.type === 'table' && f.columns)
					.map((f) => [f.key, [emptyRow(f.columns!)]])
			);
			checkData = Object.fromEntries(
				fields
					.filter((f) => f.type === 'checklist' && f.items)
					.map((f) => [
						f.key,
						Object.fromEntries(
							(f.items ?? []).map((it) => [
								it.key,
								{
									choice: '',
									values: Object.fromEntries([
										...(f.columns ?? []).map((c) => [c.key, '']),
										...(f.noteLabel ? [['note', '']] : [])
									])
								}
							])
						)
					])
			);
			// drop the cached template bytes for the new record
			previewBuf = null;
			previewError = null;
			userZoom = null;
		}
	});

	function setChoice(f: SchemaField, itemKey: string, value: string) {
		const cur = checkData[f.key]?.[itemKey];
		if (!cur) return;
		cur.choice = cur.choice === value ? '' : value; // toggle off if re-clicked
	}

	// A computed column = product of the referenced numeric columns.
	function computeCol(col: Column, row: Row): string {
		if (col.type !== 'computed' || !col.formula) return row[col.key] ?? '';
		const parts = col.formula.split('*').map((s) => s.trim());
		let prod = 1;
		for (const p of parts) {
			const n = Number.parseFloat(row[p]);
			if (Number.isNaN(n)) return ''; // not all inputs present yet
			prod *= n;
		}
		return String(prod);
	}

	function addRow(f: SchemaField) {
		if (!f.columns) return;
		tableData[f.key] = [...(tableData[f.key] ?? []), emptyRow(f.columns)];
	}
	function removeRow(f: SchemaField, i: number) {
		tableData[f.key] = (tableData[f.key] ?? []).filter((_, idx) => idx !== i);
	}

	const hasTable = $derived((schema?.fields ?? []).some((f) => f.type === 'table'));
	const hasChecklist = $derived((schema?.fields ?? []).some((f) => f.type === 'checklist'));
	// Wide fields (table / checklist) → full-width stacked page layout.
	const stacked = $derived(hasTable || hasChecklist);

	// Build the docxtemplater payload: scalar fields as strings; table fields as
	// row arrays (row loop); checklist items expand to flat mark/note placeholders.
	function buildData(): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const f of schema?.fields ?? []) {
			if (f.type === 'table' && f.columns) {
				out[f.key] = (tableData[f.key] ?? []).map((row) => {
					const r: Row = {};
					for (const col of f.columns!) {
						r[col.key] = col.type === 'computed' ? computeCol(col, row) : (row[col.key] ?? '');
					}
					return r;
				});
			} else if (f.type === 'checklist' && f.items) {
				for (const it of f.items) {
					const c = checkData[f.key]?.[it.key] ?? { choice: '', values: {} };
					for (const ch of f.choices ?? []) {
						out[`${it.key}_${ch.value}`] = c.choice === ch.value ? '✓' : '';
					}
					if (f.noteLabel) out[`${it.key}_note`] = c.values.note ?? '';
					for (const col of f.columns ?? []) {
						out[`${it.key}_${col.key}`] = c.values[col.key] ?? '';
					}
				}
			} else {
				out[f.key] = fillValues[f.key] ?? '';
			}
		}
		return out;
	}

	// --- right-side preview: live-render the FILLED template via docx-preview ---
	const isPdf = $derived(fmt === 'pdf');
	const isDocx = $derived(fmt === 'docx');

	let previewContainer = $state<HTMLDivElement | undefined>();
	let previewInner = $state<HTMLDivElement | undefined>();
	let previewBuf: ArrayBuffer | null = null; // cached blank-template bytes
	let previewBusy = $state(false);
	let previewError = $state<string | null>(null);
	let previewTimer: ReturnType<typeof setTimeout> | null = null;
	const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

	// Preview zoom. `userZoom` null = auto fit-to-width; a number = manual scale.
	let userZoom = $state<number | null>(null);
	let fitScale = $state(1);

	/** Measure the fit-to-width scale (Word page width ÷ column width). */
	function measureFit(): number {
		const inner = previewInner;
		const cont = previewContainer;
		if (!inner || !cont) return 1;
		inner.style.zoom = '1';
		const natW = inner.scrollWidth;
		const availW = cont.clientWidth;
		return natW > 0 && availW > 0 && natW > availW ? availW / natW : 1;
	}

	/** Apply the effective zoom (manual if set, else fit-to-width). */
	function applyZoom() {
		const inner = previewInner;
		if (!inner) return;
		fitScale = measureFit();
		inner.style.zoom = String(userZoom ?? fitScale);
	}

	function zoomIn() {
		userZoom = Math.min(3, Math.round(((userZoom ?? fitScale) + 0.1) * 100) / 100);
		applyZoom();
	}
	function zoomOut() {
		userZoom = Math.max(0.2, Math.round(((userZoom ?? fitScale) - 0.1) * 100) / 100);
		applyZoom();
	}
	function zoomFit() {
		userZoom = null;
		applyZoom();
	}

	// Re-render the preview (debounced) whenever the form values or record change.
	const valuesSig = $derived(JSON.stringify({ fillValues, tableData, checkData }));
	$effect(() => {
		void valuesSig;
		void item.recordId;
		if (!isDocx || !previewInner || !inlineUrl) return;
		if (previewTimer) clearTimeout(previewTimer);
		previewTimer = setTimeout(() => void renderPreview(), 350);
	});

	async function renderPreview() {
		if (!previewInner || !inlineUrl) return;
		previewBusy = true;
		previewError = null;
		try {
			if (!previewBuf) {
				const res = await fetch(inlineUrl);
				if (!res.ok) throw new Error(`模板文件下载失败 (HTTP ${res.status})`);
				previewBuf = await res.arrayBuffer();
			}
			let blob: Blob;
			if (schema && kind !== 'reference') {
				// Fill the real template with the current values → true WYSIWYG.
				const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
					import('pizzip'),
					import('docxtemplater')
				]);
				const zip = new PizZip(previewBuf);
				const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
				doc.render(buildData());
				blob = doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME });
			} else {
				blob = new Blob([previewBuf], { type: DOCX_MIME });
			}
			const { renderAsync } = await import('docx-preview');
			previewInner.innerHTML = '';
			await renderAsync(blob, previewInner, undefined, { inWrapper: true, ignoreWidth: false });
			applyZoom();
		} catch (e) {
			previewError = (e as Error).message;
		} finally {
			previewBusy = false;
		}
	}

	// Field groups for the quadrant layout (SWOT-like): text/date → header row,
	// list fields → colored grid (2×2 for SWOT, 2×3 for PESTLE…), text/date →
	// header row, textarea → footer. Any non-'stack' layout uses the grid.
	const layout = $derived(schema?.layout ?? 'stack');
	const isGrid = $derived(layout !== 'stack' && !stacked);
	const headerFields = $derived((schema?.fields ?? []).filter((f) => f.type === 'text' || f.type === 'date'));
	const quadFields = $derived((schema?.fields ?? []).filter((f) => f.type === 'list').slice(0, 8));
	const footerFields = $derived((schema?.fields ?? []).filter((f) => f.type === 'textarea'));

	const quadTone = [
		{ head: 'bg-emerald-600', ring: 'border-emerald-200' },
		{ head: 'bg-rose-600', ring: 'border-rose-200' },
		{ head: 'bg-sky-600', ring: 'border-sky-200' },
		{ head: 'bg-amber-600', ring: 'border-amber-200' },
		{ head: 'bg-violet-600', ring: 'border-violet-200' },
		{ head: 'bg-slate-600', ring: 'border-slate-200' }
	];

	// --- generate ---
	let generating = $state(false);
	let genError = $state<string | null>(null);

	async function generate() {
		if (!item.file || !schema) return;
		const missing = schema.fields.filter(
			(f) => f.required && f.type !== 'table' && f.type !== 'checklist' && !fillValues[f.key]?.trim()
		);
		if (missing.length) {
			genError = `请填写必填项：${missing.map((f) => f.label).join('、')}`;
			return;
		}
		generating = true;
		genError = null;
		try {
			const res = await fetch(inlineUrl!);
			if (!res.ok) throw new Error(`模板文件下载失败 (HTTP ${res.status})`);
			const buf = await res.arrayBuffer();
			const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
				import('pizzip'),
				import('docxtemplater')
			]);
			const zip = new PizZip(buf);
			const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
			doc.render(buildData());
			const out = doc.getZip().generate({
				type: 'blob',
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			});
			const a = document.createElement('a');
			a.href = URL.createObjectURL(out);
			const base = (item.file.name || 'template').replace(/\.docx?$/i, '');
			a.download = `${base} - filled.docx`;
			a.click();
			URL.revokeObjectURL(a.href);
		} catch (e) {
			genError = (e as Error).message;
		} finally {
			generating = false;
		}
	}
</script>

<svelte:window onresize={applyZoom} />

<div class="min-h-screen bg-slate-50">
	<div class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
		<a href="/settings/qms-templates" class="text-xs font-medium text-slate-500 hover:text-slate-700">← 返回文件库</a>

		<!-- Header -->
		<div class="mt-3 flex flex-wrap items-center gap-3">
			<span class="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 {fmtBadge[fmt]}">{fmt}</span>
			<h1 class="text-lg font-semibold text-slate-900">{item.name}</h1>
			{#if item.code}<span class="font-mono text-xs text-slate-400">{item.code}</span>{/if}
			{#if kind === 'reference'}
				<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">参考文件</span>
			{:else if kind === 'pending'}
				<span class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">待配置字段</span>
			{/if}
		</div>

		{#if parsed.error}
			<p class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
				Field Schema JSON 解析失败：{parsed.error}
			</p>
		{/if}

		<!-- Reusable: description panel (intro + Info) -->
		{#snippet descriptionPanel()}
			{#if schema?.intro || item.info}
				<div class="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
					{#if schema?.intro?.clause}
						<span class="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
							{schema.intro.clause}
						</span>
					{/if}
					{#if schema?.intro?.purpose}
						<p class="mt-2 text-sm leading-relaxed text-slate-700">{schema.intro.purpose}</p>
					{/if}
					{#if item.info}
						<p class="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{item.info}</p>
					{/if}
					{#if schema?.intro?.notes}
						<details class="mt-2" open>
							<summary class="cursor-pointer text-[11px] font-medium text-sky-700 hover:underline">{kind === 'reference' ? '说明 / 备注' : '填写说明 / 注意事项'}</summary>
							<p class="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">{schema.intro.notes}</p>
						</details>
					{/if}
				</div>
			{:else if kind === 'reference'}
				<div class="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs leading-relaxed text-slate-400">
					尚未填写文件描述。可在 Bitable 的 Info 字段写简介，或用 Field Schema 的 intro 提供「条款 / 用途 / 说明」。
				</div>
			{/if}
		{/snippet}

		<!-- Reusable: file preview (live-filled docx / pdf iframe / download) -->
		{#snippet previewBlock(tall: boolean)}
			<div class="flex items-center justify-between rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 px-4 py-2.5">
				<p class="text-sm font-medium text-slate-600">
					{#if isDocx && schema && kind !== 'reference'}预览（填写效果）{:else}文件预览{/if}
				</p>
				<div class="flex items-center gap-2">
					{#if previewBusy}<span class="text-[11px] text-slate-400">渲染中…</span>{/if}
					{#if isDocx}
						<div class="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
							<button type="button" class="rounded px-1.5 py-0.5 text-sm leading-none text-slate-600 hover:bg-slate-100" title="缩小" onclick={zoomOut}>−</button>
							<button type="button" class="rounded px-1.5 py-0.5 text-[11px] font-medium leading-none text-slate-600 hover:bg-slate-100" title="适应宽度" onclick={zoomFit}>{Math.round((userZoom ?? fitScale) * 100)}%</button>
							<button type="button" class="rounded px-1.5 py-0.5 text-sm leading-none text-slate-600 hover:bg-slate-100" title="放大" onclick={zoomIn}>+</button>
						</div>
					{/if}
				</div>
			</div>
			<div class="rounded-b-xl border border-slate-200 bg-white">
				{#if isPdf && inlineUrl}
					<iframe src={inlineUrl} title="预览" class="{tall ? 'h-[84vh]' : 'h-[78vh]'} w-full rounded-b-xl"></iframe>
				{:else if isDocx}
					{#if previewError}
						<div class="m-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">预览失败：{previewError}</div>
					{/if}
					<div class="{tall ? 'max-h-[84vh]' : 'max-h-[78vh]'} overflow-auto bg-slate-100" bind:this={previewContainer}>
						<div bind:this={previewInner}></div>
					</div>
				{:else if inlineUrl}
					<div class="flex flex-col items-center gap-3 p-10 text-center">
						<p class="text-sm text-slate-500">浏览器无法内嵌预览此类型文件（{fmt.toUpperCase()}）。</p>
						<a href={dlUrl} class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">下载查看</a>
					</div>
				{:else}
					<div class="p-10 text-center text-sm text-slate-400">该记录还没上传文件。</div>
				{/if}
			</div>
		{/snippet}

		{#if kind === 'reference'}
			<!-- ── Reference doc: description sidebar + large preview ── -->
			<div class="mt-4 grid gap-5 lg:grid-cols-3 lg:items-start">
				<div class="space-y-4 lg:col-span-1">
					{@render descriptionPanel()}
					<div class="rounded-xl border border-slate-200 bg-white p-4">
						<p class="text-sm text-slate-600">参考文件，无需填写，仅供查阅。</p>
						{#if dlUrl}
							<a href={dlUrl} class="mt-3 inline-block rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">下载阅读</a>
						{/if}
					</div>
				</div>
				<div class="lg:col-span-2 lg:sticky lg:top-4">
					{@render previewBlock(true)}
				</div>
			</div>
		{:else}
		<!-- ── Fillable / pending: form + live preview ── -->
		<div class="mt-4 grid gap-5 lg:items-start {stacked ? '' : 'lg:grid-cols-2'}">
			<!-- ── Left: info + form ── -->
			<div class="space-y-4">
				{@render descriptionPanel()}

				{#if kind === 'pending'}
					<div class="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
						该模板还没配置 Field Schema,暂时无法填写。可先下载空白模板。
						{#if dlUrl}<a href={dlUrl} class="ml-1 font-medium underline">下载</a>{/if}
					</div>
				{:else if schema}
					<!-- Structured fill form -->
					<div class="rounded-xl border border-slate-200 bg-white p-4">
						{#if isGrid}
							{#if headerFields.length}
								<div class="mb-4 grid gap-3 sm:grid-cols-3">
									{#each headerFields as f (f.key)}
										<label class="block">
											<span class="text-xs font-medium text-slate-600">{f.label}{#if f.required}<span class="text-rose-500"> *</span>{/if}</span>
											<input type={f.type === 'date' ? 'date' : 'text'} bind:value={fillValues[f.key]} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
										</label>
									{/each}
								</div>
							{/if}
							<div class="grid gap-3 sm:grid-cols-2">
								{#each quadFields as f, i (f.key)}
									<div class="rounded-lg border {quadTone[i % quadTone.length].ring} overflow-hidden">
										<div class="{quadTone[i % quadTone.length].head} px-3 py-1.5 text-xs font-semibold text-white">{f.label}</div>
										<div class="p-2.5">
											{#if f.help}<p class="mb-1 text-[11px] leading-relaxed text-slate-400">{f.help}</p>{/if}
											<textarea bind:value={fillValues[f.key]} rows="5" placeholder="每行一条" class="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"></textarea>
											{#if f.examples?.length}
												<details class="mt-1">
													<summary class="cursor-pointer text-[11px] font-medium text-slate-500 hover:text-slate-700">参考维度（{f.examples.length}）</summary>
													<ul class="mt-1 flex flex-wrap gap-1">
														{#each f.examples as ex}<li class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{ex}</li>{/each}
													</ul>
												</details>
											{/if}
										</div>
									</div>
								{/each}
							</div>
							{#if footerFields.length}
								<div class="mt-4 space-y-3">
									{#each footerFields as f (f.key)}
										<label class="block">
											<span class="text-xs font-medium text-slate-600">{f.label}</span>
											{#if f.help}<span class="mt-0.5 block text-[11px] text-slate-400">{f.help}</span>{/if}
											<textarea bind:value={fillValues[f.key]} rows="2" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"></textarea>
										</label>
									{/each}
								</div>
							{/if}
						{:else}
							<!-- stack layout (also handles repeatable-row table fields) -->
							<div class="space-y-4">
								{#each schema.fields as f (f.key)}
									{#if f.type === 'table' && f.columns}
										<!-- Repeatable-row table: one card per row -->
										<div>
											<div class="mb-2 flex items-center justify-between">
												<span class="text-sm font-medium text-slate-700">{f.label}</span>
												<button type="button" class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50" onclick={() => addRow(f)}>+ 添加一行</button>
											</div>
											{#if f.help}<p class="mb-2 text-[11px] leading-relaxed text-slate-400">{f.help}</p>{/if}
											<div class="space-y-3">
												{#each tableData[f.key] ?? [] as row, ri (ri)}
													<div class="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
														<div class="mb-2 flex items-center justify-between">
															<span class="text-xs font-semibold text-slate-500">#{ri + 1}</span>
															<button type="button" class="text-[11px] font-medium text-rose-500 hover:text-rose-700" onclick={() => removeRow(f, ri)}>删除</button>
														</div>
														<div class="grid gap-2 sm:grid-cols-2">
															{#each f.columns as col (col.key)}
																<label class="block">
																	<span class="text-[11px] font-medium text-slate-600">{col.label}</span>
																	{#if col.type === 'computed'}
																		<input readonly value={computeCol(col, row)} class="mt-0.5 w-full rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-500" />
																	{:else if col.type === 'number'}
																		<input type="number" bind:value={row[col.key]} class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
																	{:else if col.type === 'date'}
																		<input type="date" bind:value={row[col.key]} class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
																	{:else if col.type === 'textarea'}
																		<textarea bind:value={row[col.key]} rows="2" class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"></textarea>
																	{:else}
																		<input bind:value={row[col.key]} class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
																	{/if}
																</label>
															{/each}
														</div>
													</div>
												{/each}
												{#if (tableData[f.key] ?? []).length === 0}
													<p class="text-xs text-slate-400">还没有行，点「+ 添加一行」开始。</p>
												{/if}
											</div>
										</div>
									{:else if f.type === 'checklist' && f.items && f.choices}
										<!-- Fixed-item checklist: label + choice(s) + note per item -->
										<div>
											<span class="text-sm font-medium text-slate-700">{f.label}</span>
											{#if f.help}<p class="mb-2 mt-0.5 text-[11px] leading-relaxed text-slate-400">{f.help}</p>{/if}
											<div class="divide-y divide-slate-100 rounded-lg border border-slate-200">
												{#each f.items as it (it.key)}
													<div class="space-y-2 p-2.5">
														<div class="flex flex-wrap items-start justify-between gap-2">
														<div class="min-w-[9rem] flex-1 text-xs leading-snug">
															{#if it.ref}<span class="mr-1 font-mono text-slate-400">{it.ref}.</span>{/if}{#if it.group}<span class="text-slate-400">{it.group} · </span>{/if}<span class="font-medium text-slate-700">{it.label}</span>
														</div>
														<div class="flex flex-wrap gap-1">
															{#each f.choices as ch (ch.value)}
																<button
																	type="button"
																	onclick={() => setChoice(f, it.key, ch.value)}
																	class="rounded-md border px-2 py-0.5 text-[11px] font-medium {checkData[f.key]?.[it.key]?.choice === ch.value ? 'border-[var(--sf-green)] bg-[var(--sf-green)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}"
																>
																	{ch.label}
																</button>
															{/each}
														</div>
														</div>
														{#if f.columns}
															<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
																{#each f.columns as col (col.key)}
																	<label class="block">
																		<span class="text-[11px] font-medium text-slate-500">{col.label}</span>
																		{#if col.type === 'date'}
																			<input type="date" bind:value={checkData[f.key][it.key].values[col.key]} class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
																		{:else if col.type === 'textarea'}
																			<textarea bind:value={checkData[f.key][it.key].values[col.key]} rows="2" class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"></textarea>
																		{:else}
																			<input bind:value={checkData[f.key][it.key].values[col.key]} class="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
																		{/if}
																	</label>
																{/each}
															</div>
														{:else if f.noteLabel}
															<input placeholder={f.noteLabel} bind:value={checkData[f.key][it.key].values.note} class="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
														{/if}
													</div>
												{/each}
											</div>
										</div>
									{:else}
										<label class="block">
											<span class="text-xs font-medium text-slate-600">{f.label}{#if f.required}<span class="text-rose-500"> *</span>{/if}</span>
											{#if f.help}<span class="mt-0.5 block text-[11px] text-slate-400">{f.help}</span>{/if}
											{#if f.type === 'text'}
												<input bind:value={fillValues[f.key]} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
											{:else if f.type === 'date'}
												<input type="date" bind:value={fillValues[f.key]} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
											{:else if f.type === 'list'}
												<textarea bind:value={fillValues[f.key]} rows="4" placeholder="每行一条" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"></textarea>
											{:else}
												<textarea bind:value={fillValues[f.key]} rows="3" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm"></textarea>
											{/if}
										</label>
									{/if}
								{/each}
							</div>
						{/if}

						{#if genError}
							<div class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{genError}</div>
						{/if}
						<div class="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
							<button type="button" class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60" disabled={generating} onclick={generate}>
								{generating ? '生成中…' : `生成并下载 ${fmt.toUpperCase()}`}
							</button>
							{#if dlUrl}
								<a href={dlUrl} class="text-xs font-medium text-slate-500 hover:text-slate-700">下载空白模板</a>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<div class={stacked ? '' : 'lg:sticky lg:top-4'}>
				{@render previewBlock(false)}
			</div>
		</div>
		{/if}
	</div>
</div>
