<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data } = $props();

	// The gallery reads the Bitable **File Template** table (source of truth).
	// The old D1 metadata CRUD tab was removed — master data is managed in Bitable.
	type FileTemplate = {
		recordId: string;
		name: string;
		code: string | null;
		category: string | null;
		scope: string | null;
		taskMatch: string | null;
		role: string | null;
		needApproval: boolean;
		isActive: boolean;
		referenceOnly: boolean;
		fieldSchema: string | null;
		info: string | null;
		file: { fileToken: string; name: string; mimeType: string; size: number | null } | null;
	};

	const fileTemplates = $derived((data.fileTemplates as FileTemplate[]) ?? []);
	const fileTemplateRevision = $derived(data.fileTemplateRevision as number | null);

	let notice = $state<string | null>(null);

	type Fmt = 'docx' | 'xlsx' | 'pdf' | 'zip' | 'other';
	function formatOf(fileName: string | null | undefined): Fmt {
		const name = (fileName ?? '').toLowerCase();
		if (name.endsWith('.docx') || name.endsWith('.doc')) return 'docx';
		if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
		if (name.endsWith('.pdf')) return 'pdf';
		if (name.endsWith('.zip')) return 'zip';
		return 'other';
	}

	const fmtBadge: Record<Fmt, string> = {
		docx: 'bg-sky-50 text-sky-700 ring-sky-200',
		xlsx: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
		pdf: 'bg-rose-50 text-rose-700 ring-rose-200',
		zip: 'bg-amber-50 text-amber-700 ring-amber-200',
		other: 'bg-slate-100 text-slate-600 ring-slate-200'
	};

	// Per-card action state:
	//   reference → download-only; fillable → 填写生成; pending → 待配置字段.
	type Kind = 'reference' | 'fillable' | 'pending';
	function kindOf(t: FileTemplate): Kind {
		if (t.referenceOnly) return 'reference';
		return t.fieldSchema && t.fieldSchema.trim().length > 0 ? 'fillable' : 'pending';
	}

	/** Streamed-download URL for a template's blank file (via the attachment API). */
	function downloadUrl(t: FileTemplate): string | null {
		if (!t.file) return null;
		const params = new URLSearchParams({ token: t.file.fileToken, name: t.file.name, download: '1' });
		if (fileTemplateRevision != null) params.set('rev', String(fileTemplateRevision));
		return `/api/qms/file-template/attachment?${params.toString()}`;
	}

	// Templates grouped by category for the gallery.
	const libraryGroups = $derived.by(() => {
		const groups = new Map<string, FileTemplate[]>();
		for (const t of fileTemplates) {
			const key = t.category?.trim() || '未分类';
			const arr = groups.get(key) ?? [];
			arr.push(t);
			groups.set(key, arr);
		}
		return [...groups.entries()].map(([category, items]) => ({ category, items }));
	});

	// -- Fill & generate ----------------------------------------------------
	type SchemaField = {
		key: string;
		label: string;
		type: 'text' | 'textarea' | 'date' | 'list';
		required?: boolean;
		/** Short "what to put here" hint shown under the field. */
		help?: string;
		/** Thinking prompts / reference dimensions (e.g. SWOT criteria). Display-only. */
		examples?: string[];
	};
	/** Template-level explanation: which ISO clause, its purpose, and notes. */
	type SchemaIntro = { clause?: string; purpose?: string; notes?: string };
	type FieldSchema = {
		version?: number;
		engine?: string;
		intro?: SchemaIntro;
		fields: SchemaField[];
	};

	let fillTemplate = $state<FileTemplate | null>(null);
	let fillSchema = $state<FieldSchema | null>(null);
	let fillValues = $state<Record<string, string>>({});
	let generating = $state(false);
	let fillError = $state<string | null>(null);

	function startFill(t: FileTemplate) {
		let schema: FieldSchema | null = null;
		try {
			schema = t.fieldSchema ? (JSON.parse(t.fieldSchema) as FieldSchema) : null;
		} catch (e) {
			notice = `「${t.name}」的 Field Schema JSON 解析失败：${(e as Error).message}`;
			return;
		}
		if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
			notice = `「${t.name}」还没配置有效的 Field Schema，无法填写。`;
			return;
		}
		fillTemplate = t;
		fillSchema = schema;
		fillValues = Object.fromEntries(schema.fields.map((f) => [f.key, '']));
		fillError = null;
	}

	function closeFill() {
		fillTemplate = null;
		fillSchema = null;
	}

	async function generate() {
		if (!fillTemplate?.file || !fillSchema) return;
		// Required-field check.
		const missing = fillSchema.fields.filter((f) => f.required && !fillValues[f.key]?.trim());
		if (missing.length) {
			fillError = `请填写必填项：${missing.map((f) => f.label).join('、')}`;
			return;
		}
		generating = true;
		fillError = null;
		try {
			const params = new URLSearchParams({ token: fillTemplate.file.fileToken, name: fillTemplate.file.name });
			if (fileTemplateRevision != null) params.set('rev', String(fileTemplateRevision));
			const res = await fetch(`/api/qms/file-template/attachment?${params.toString()}`);
			if (!res.ok) throw new Error(`模板文件下载失败 (HTTP ${res.status})`);
			const buf = await res.arrayBuffer();

			// Client-side generation — keeps the docx libs off the Worker.
			const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
				import('pizzip'),
				import('docxtemplater')
			]);
			const zip = new PizZip(buf);
			const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
			doc.render(Object.fromEntries(fillSchema.fields.map((f) => [f.key, fillValues[f.key] ?? ''])));
			const out = doc.getZip().generate({
				type: 'blob',
				mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
			});

			const a = document.createElement('a');
			a.href = URL.createObjectURL(out);
			const base = (fillTemplate.file.name || 'template').replace(/\.docx?$/i, '');
			a.download = `${base} - filled.docx`;
			a.click();
			URL.revokeObjectURL(a.href);
			closeFill();
		} catch (e) {
			fillError = (e as Error).message;
		} finally {
			generating = false;
		}
	}
</script>

<PageShell
	eyebrow="Settings · ISO 9001"
	title="QMS 文件模板库"
	description="ISO 9001 质量管理体系文件库。主数据在 Lark Base 的 File Template 表维护，此处按模块浏览：参考文件可下载阅读，配了 Field Schema 的模板可填写生成填好的原始文件。"
>
	{#if notice}
		<div class="mb-4 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
			<span class="flex-1">{notice}</span>
			<button type="button" class="text-sky-500 hover:text-sky-700" onclick={() => (notice = null)} aria-label="关闭">×</button>
		</div>
	{/if}

	{#if data.fileTemplateMessage}
		<p class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
			{data.fileTemplateMessage}
		</p>
	{/if}

	{#if libraryGroups.length === 0}
		<div class="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
			<p class="text-sm font-medium text-slate-700">文件库还是空的</p>
			<p class="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
				在 Lark Base 的 <span class="font-medium text-slate-700">File Template</span> 表里新建模板并把原始文件传到
				<span class="font-medium text-slate-700">File</span> 附件字段（.docx / .xlsx / .pdf）。勾选
				<span class="font-medium text-slate-700">Reference Only</span> 的是参考文件（只下载）；配了
				<span class="font-medium text-slate-700">Field Schema</span> 的可「填写生成」。
			</p>
		</div>
	{:else}
		<div class="space-y-6">
			{#each libraryGroups as group (group.category)}
				<section>
					<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.category}</h2>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each group.items as t (t.recordId)}
							{@const dl = downloadUrl(t)}
							<div class="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm" class:opacity-60={!t.isActive}>
								<div class="flex items-start justify-between gap-2">
									<span class="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 {fmtBadge[formatOf(t.file?.name)]}">
										{formatOf(t.file?.name)}
									</span>
									<span class="font-mono text-[11px] text-slate-400">{t.code ?? ''}</span>
								</div>
								<p class="mt-2 line-clamp-2 text-sm font-medium text-slate-800">{t.name}</p>
								{#if t.info}
									<p class="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{t.info}</p>
								{/if}
								<div class="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
									{#if kindOf(t) === 'fillable'}
										<button
											type="button"
											class="rounded-md bg-[var(--sf-green)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#2f5e2c]"
											onclick={() => startFill(t)}
										>
											填写生成
										</button>
									{:else if kindOf(t) === 'reference'}
										<span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">参考文件 · 不填写</span>
									{:else}
										<span class="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">待配置字段</span>
									{/if}
									{#if dl}
										<a
											href={dl}
											class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
										>
											下载
										</a>
									{:else}
										<span class="text-[11px] text-slate-300">未上传文件</span>
									{/if}
									{#if !t.isActive}
										<span class="text-[11px] text-slate-400">· 停用</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}
</PageShell>

<!-- Fill & generate modal -->
{#if fillTemplate && fillSchema}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-slate-900/40" aria-label="关闭" onclick={closeFill}></button>
		<div class="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
				<div>
					<h2 class="text-sm font-semibold text-slate-900">填写生成 · {fillTemplate.name}</h2>
					<p class="text-[11px] text-slate-400">填完后在浏览器生成填好的 {formatOf(fillTemplate.file?.name).toUpperCase()},自动下载。</p>
				</div>
				<button type="button" class="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100" onclick={closeFill}>×</button>
			</div>

			<div class="space-y-3 overflow-y-auto px-5 py-4 text-sm">
				{#if fillSchema.intro}
					<div class="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2.5">
						{#if fillSchema.intro.clause}
							<span class="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700">
								{fillSchema.intro.clause}
							</span>
						{/if}
						{#if fillSchema.intro.purpose}
							<p class="mt-2 text-xs leading-relaxed text-slate-700">{fillSchema.intro.purpose}</p>
						{/if}
						{#if fillSchema.intro.notes}
							<details class="mt-1.5">
								<summary class="cursor-pointer text-[11px] font-medium text-sky-700 hover:underline">填写说明 / 注意事项</summary>
								<p class="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-slate-500">{fillSchema.intro.notes}</p>
							</details>
						{/if}
					</div>
				{/if}

				{#each fillSchema.fields as f (f.key)}
					<label class="block">
						<span class="text-xs font-medium text-slate-600">
							{f.label}{#if f.required}<span class="text-rose-500"> *</span>{/if}
						</span>
						{#if f.help}
							<span class="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{f.help}</span>
						{/if}
						{#if f.type === 'text'}
							<input bind:value={fillValues[f.key]} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
						{:else if f.type === 'date'}
							<input type="date" bind:value={fillValues[f.key]} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
						{:else if f.type === 'list'}
							<textarea bind:value={fillValues[f.key]} rows="4" placeholder="每行一条" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5"></textarea>
							<span class="text-[11px] text-slate-400">每行一条,生成时逐行列出</span>
						{:else}
							<textarea bind:value={fillValues[f.key]} rows="3" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5"></textarea>
						{/if}
						{#if f.examples && f.examples.length}
							<details class="mt-1">
								<summary class="cursor-pointer text-[11px] font-medium text-slate-500 hover:text-slate-700">参考维度 / 提示（{f.examples.length}）</summary>
								<ul class="mt-1 flex flex-wrap gap-1">
									{#each f.examples as ex}
										<li class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{ex}</li>
									{/each}
								</ul>
							</details>
						{/if}
					</label>
				{/each}
			</div>

			{#if fillError}
				<div class="mx-5 mb-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{fillError}</div>
			{/if}

			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
				<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white" onclick={closeFill}>取消</button>
				<button
					type="button"
					class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60"
					disabled={generating}
					onclick={generate}
				>
					{generating ? '生成中…' : '生成并下载'}
				</button>
			</div>
		</div>
	</div>
{/if}
