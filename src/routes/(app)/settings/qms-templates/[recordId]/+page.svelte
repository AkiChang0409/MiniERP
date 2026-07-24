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
	type SchemaField = {
		key: string;
		label: string;
		type: 'text' | 'textarea' | 'date' | 'list';
		required?: boolean;
		help?: string;
		examples?: string[];
	};
	type SchemaIntro = { clause?: string; purpose?: string; notes?: string };
	type FieldSchema = {
		version?: number;
		engine?: string;
		layout?: 'quadrant' | 'stack';
		intro?: SchemaIntro;
		fields: SchemaField[];
	};

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
	let fillValues = $state<Record<string, string>>({});
	let lastRecord = '';
	$effect(() => {
		if (item.recordId !== lastRecord) {
			lastRecord = item.recordId;
			fillValues = schema ? Object.fromEntries(schema.fields.map((f) => [f.key, ''])) : {};
		}
	});

	// Field groups for the quadrant layout (SWOT-like): text/date → header row,
	// list fields → 2×2 grid, textarea → footer. Falls back to a flat stack.
	const layout = $derived(schema?.layout ?? 'stack');
	const headerFields = $derived((schema?.fields ?? []).filter((f) => f.type === 'text' || f.type === 'date'));
	const quadFields = $derived((schema?.fields ?? []).filter((f) => f.type === 'list').slice(0, 4));
	const footerFields = $derived((schema?.fields ?? []).filter((f) => f.type === 'textarea'));

	const quadTone = [
		{ head: 'bg-emerald-600', ring: 'border-emerald-200' },
		{ head: 'bg-rose-600', ring: 'border-rose-200' },
		{ head: 'bg-sky-600', ring: 'border-sky-200' },
		{ head: 'bg-amber-600', ring: 'border-amber-200' }
	];

	function lines(v: string | undefined): string[] {
		return (v ?? '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
	}

	// --- generate ---
	let generating = $state(false);
	let genError = $state<string | null>(null);

	async function generate() {
		if (!item.file || !schema) return;
		const missing = schema.fields.filter((f) => f.required && !fillValues[f.key]?.trim());
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
			doc.render(Object.fromEntries(schema.fields.map((f) => [f.key, fillValues[f.key] ?? ''])));
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

		<div class="mt-4 grid gap-5 lg:grid-cols-2 lg:items-start">
			<!-- ── Left: info + form ── -->
			<div class="space-y-4">
				<!-- Info / explanation -->
				{#if schema?.intro || item.info}
					<div class="rounded-xl border border-sky-100 bg-sky-50/60 p-4">
						{#if schema?.intro?.clause}
							<span class="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
								{schema.intro.clause}
							</span>
						{/if}
						{#if schema?.intro?.purpose}
							<p class="mt-2 text-xs leading-relaxed text-slate-700">{schema.intro.purpose}</p>
						{/if}
						{#if item.info}
							<p class="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600">{item.info}</p>
						{/if}
						{#if schema?.intro?.notes}
							<details class="mt-2" open>
								<summary class="cursor-pointer text-[11px] font-medium text-sky-700 hover:underline">填写说明 / 注意事项</summary>
								<p class="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">{schema.intro.notes}</p>
							</details>
						{/if}
					</div>
				{/if}

				{#if kind === 'reference'}
					<div class="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
						这是参考文件,无需填写。可在右侧预览,或下载阅读。
					</div>
				{:else if kind === 'pending'}
					<div class="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
						该模板还没配置 Field Schema,暂时无法填写。可先下载空白模板。
					</div>
				{:else if schema}
					<!-- Structured fill form -->
					<div class="rounded-xl border border-slate-200 bg-white p-4">
						{#if layout === 'quadrant'}
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
									<div class="rounded-lg border {quadTone[i % 4].ring} overflow-hidden">
										<div class="{quadTone[i % 4].head} px-3 py-1.5 text-xs font-semibold text-white">{f.label}</div>
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
							<!-- stack layout -->
							<div class="space-y-3">
								{#each schema.fields as f (f.key)}
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

			<!-- ── Right: preview / review ── -->
			<div class="lg:sticky lg:top-4">
				<div class="rounded-t-xl border border-b-0 border-slate-200 bg-slate-50 px-4 py-2.5">
					<p class="text-sm font-medium text-slate-600">预览 / Review</p>
				</div>
				<div class="rounded-b-xl border border-slate-200 bg-white">
					{#if kind !== 'reference' && schema && layout === 'quadrant'}
						<!-- Live document-style preview -->
						<div class="space-y-3 p-5 text-xs text-slate-800">
							{#if headerFields.length}
								<div class="grid grid-cols-3 gap-2 border-b border-slate-200 pb-2">
									{#each headerFields as f (f.key)}
										<div><span class="font-semibold text-slate-500">{f.label}:</span> {fillValues[f.key] || '—'}</div>
									{/each}
								</div>
							{/if}
							<div class="grid grid-cols-2 gap-2">
								{#each quadFields as f, i (f.key)}
									<div class="overflow-hidden rounded border {quadTone[i % 4].ring}">
										<div class="{quadTone[i % 4].head} px-2 py-1 text-[11px] font-semibold text-white">{f.label}</div>
										<ul class="min-h-[80px] list-disc space-y-0.5 p-2 pl-5">
											{#each lines(fillValues[f.key]) as it}<li>{it}</li>{:else}<li class="list-none text-slate-300">（待填写）</li>{/each}
										</ul>
									</div>
								{/each}
							</div>
							{#each footerFields as f (f.key)}
								<div class="border-t border-slate-200 pt-2">
									<p class="font-semibold text-slate-600">{f.label}</p>
									<p class="mt-0.5 whitespace-pre-line text-slate-700">{fillValues[f.key] || '—'}</p>
								</div>
							{/each}
						</div>
					{:else if fmt === 'pdf' && inlineUrl}
						<iframe src={inlineUrl} title="预览" class="h-[75vh] w-full rounded-b-xl"></iframe>
					{:else if kind !== 'reference' && schema}
						<!-- stack live preview -->
						<div class="space-y-3 p-5 text-xs text-slate-800">
							{#each schema.fields as f (f.key)}
								<div>
									<p class="font-semibold text-slate-600">{f.label}</p>
									{#if f.type === 'list'}
										<ul class="mt-0.5 list-disc space-y-0.5 pl-5">
											{#each lines(fillValues[f.key]) as it}<li>{it}</li>{:else}<li class="list-none text-slate-300">（待填写）</li>{/each}
										</ul>
									{:else}
										<p class="mt-0.5 whitespace-pre-line text-slate-700">{fillValues[f.key] || '—'}</p>
									{/if}
								</div>
							{/each}
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
			</div>
		</div>
	</div>
</div>
