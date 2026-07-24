<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data } = $props();

	// The gallery reads the Bitable **File Template** table (source of truth).
	// Clicking a card opens its detail page (Info + structured fill + preview).
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

	const fileTemplates = $derived((data.fileTemplates as FileTemplate[]) ?? []);
	const fileTemplateRevision = $derived(data.fileTemplateRevision as number | null);

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

	type Kind = 'reference' | 'fillable' | 'pending';
	function kindOf(t: FileTemplate): Kind {
		if (t.referenceOnly) return 'reference';
		return t.fieldSchema && t.fieldSchema.trim().length > 0 ? 'fillable' : 'pending';
	}

	function downloadUrl(t: FileTemplate): string | null {
		if (!t.file) return null;
		const params = new URLSearchParams({ token: t.file.fileToken, name: t.file.name, download: '1' });
		if (fileTemplateRevision != null) params.set('rev', String(fileTemplateRevision));
		return `/api/qms/file-template/attachment?${params.toString()}`;
	}

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
</script>

<PageShell
	eyebrow="Settings · ISO 9001"
	title="QMS 文件模板库"
	description="ISO 9001 质量管理体系文件库。主数据在 Lark Base 的 File Template 表维护,此处按模块浏览。点击文件进入详情:查看说明、按结构填写并实时预览,或下载阅读。"
>
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
							<div class="relative flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow">
								<!-- Stretched link: whole card navigates to the detail page. -->
								<a href="/settings/qms-templates/{t.recordId}" class="absolute inset-0 rounded-xl" aria-label={t.name}></a>
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
								<div class="relative mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
									{#if kindOf(t) === 'fillable'}
										<span class="rounded-md bg-[var(--sf-green)] px-2 py-0.5 text-[11px] font-medium text-white">填写生成 →</span>
									{:else if kindOf(t) === 'reference'}
										<span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">参考文件</span>
									{:else}
										<span class="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">待配置字段</span>
									{/if}
									{#if dl}
										<a href={dl} class="relative z-10 ml-auto text-[11px] font-medium text-slate-500 hover:text-slate-700">下载</a>
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
