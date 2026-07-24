<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	type Template = {
		id: string;
		code: string;
		name: string;
		moduleCategory: string | null;
		scope: 'company' | 'project' | 'task';
		taskType: string | null;
		responsibleRole: string | null;
		requiresApproval: boolean;
		isActive: boolean;
		description: string | null;
		orderIndex: number;
		fieldSchema: string | null;
		fileTemplateUrl: string | null;
		fileTemplateName: string | null;
	};

	const TASK_TYPES = [
		'design',
		'procurement',
		'production',
		'software',
		'sales',
		'inspection',
		'document_control',
		'quality',
		'handover',
		'general'
	];

	const templates = $derived((data.templates as Template[]) ?? []);

	// -- Library / generate view (ISO 9001 file gallery) --------------------
	// The gallery reads the Bitable **File Template** table (source of truth). The
	// "模板管理" tab still reads the legacy D1 mirror. Fill + generate are stubs for
	// now — this step just wires the gallery to Bitable so uploaded files show up.
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

	let view = $state<'library' | 'manage'>('library');
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

	function startFill(t: FileTemplate) {
		notice = `「${t.name}」的填写生成即将接入：fieldSchema → 动态表单 → 生成 ${formatOf(t.file?.name).toUpperCase()} 文件下载。`;
	}

	type Editor = {
		mode: 'create' | 'edit';
		id: string | null;
		code: string;
		name: string;
		moduleCategory: string;
		scope: 'company' | 'project' | 'task';
		taskType: string;
		responsibleRole: string;
		requiresApproval: boolean;
		isActive: boolean;
		description: string;
		orderIndex: string;
	};
	const blankEditor = (preset?: Partial<Editor>): Editor => ({
		mode: 'create',
		id: null,
		code: '',
		name: '',
		moduleCategory: '',
		scope: 'task',
		taskType: '',
		responsibleRole: 'self',
		requiresApproval: false,
		isActive: true,
		description: '',
		orderIndex: '0',
		...preset
	});

	let editor = $state<Editor | null>(null);
	let saving = $state(false);
	let error = $state<string | null>(null);

	function openCreate() {
		editor = blankEditor();
		error = null;
	}
	function openEdit(t: Template) {
		editor = {
			mode: 'edit',
			id: t.id,
			code: t.code,
			name: t.name,
			moduleCategory: t.moduleCategory ?? '',
			scope: t.scope,
			taskType: t.taskType ?? '',
			responsibleRole: t.responsibleRole ?? '',
			requiresApproval: t.requiresApproval,
			isActive: t.isActive,
			description: t.description ?? '',
			orderIndex: String(t.orderIndex ?? 0)
		};
		error = null;
	}
	function close() {
		editor = null;
		error = null;
	}

	async function save() {
		if (!editor) return;
		if (!editor.code.trim() || !editor.name.trim()) {
			error = 'Code 和 Name 必填。';
			return;
		}
		saving = true;
		error = null;
		try {
			const payload = {
				code: editor.code.trim(),
				name: editor.name.trim(),
				moduleCategory: editor.moduleCategory.trim() || null,
				scope: editor.scope,
				taskType: editor.scope === 'task' ? editor.taskType || null : null,
				responsibleRole: editor.responsibleRole.trim() || null,
				requiresApproval: editor.requiresApproval,
				isActive: editor.isActive,
				description: editor.description.trim() || null,
				orderIndex: Number(editor.orderIndex) || 0
			};
			const url = editor.mode === 'create' ? '/api/qms/templates' : `/api/qms/templates/${editor.id}`;
			const method = editor.mode === 'create' ? 'POST' : 'PATCH';
			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				let msg = `Save failed (HTTP ${res.status}).`;
				try {
					const b: any = await res.json();
					if (b?.error) msg = b.error;
				} catch {
					/* non-JSON */
				}
				error = msg;
				return;
			}
			editor = null;
			await invalidateAll();
		} catch (e) {
			error = `Network error: ${(e as Error).message}`;
		} finally {
			saving = false;
		}
	}

	async function archive(t: Template) {
		if (!confirm(`停用模板 "${t.code} ${t.name}"？历史记录会保留，只是不再被建议。`)) return;
		await fetch(`/api/qms/templates/${t.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	const scopeBadge = (s: string) =>
		s === 'company'
			? 'bg-indigo-50 text-indigo-700'
			: s === 'project'
				? 'bg-sky-50 text-sky-700'
				: 'bg-emerald-50 text-emerald-700';
</script>

<PageShell
	eyebrow="Settings · ISO 9001"
	title="QMS 文件模板库"
	description="公司级质量管理体系文件库。「文件库 / 生成」按模块浏览 ISO 9001 模板，可填写生成或下载阅读；「模板管理」维护模板元数据（task-scope 模板按 Task type 自动建议给 Gantt 任务）。"
>
	{#snippet actions()}
		{#if view === 'manage'}
			<button
				type="button"
				class="mt-3 rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2f5e2c]"
				onclick={openCreate}
			>
				+ 新建模板
			</button>
		{/if}
	{/snippet}

	<!-- View toggle: user-facing gallery vs. metadata admin table -->
	<div class="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
		<button
			type="button"
			class="rounded-md px-3 py-1.5 font-medium transition {view === 'library' ? 'bg-[var(--sf-green)] text-white' : 'text-slate-600 hover:bg-slate-50'}"
			onclick={() => (view = 'library')}
		>
			文件库 / 生成
		</button>
		<button
			type="button"
			class="rounded-md px-3 py-1.5 font-medium transition {view === 'manage' ? 'bg-[var(--sf-green)] text-white' : 'text-slate-600 hover:bg-slate-50'}"
			onclick={() => (view = 'manage')}
		>
			模板管理
		</button>
	</div>

	{#if notice}
		<div class="mb-4 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
			<span class="flex-1">{notice}</span>
			<button type="button" class="text-sky-500 hover:text-sky-700" onclick={() => (notice = null)} aria-label="关闭">×</button>
		</div>
	{/if}

	{#if view === 'library'}
		<!-- ── ISO 9001 file gallery — reads the Bitable File Template table ── -->
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
	{:else}
		<p class="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
			旧的 D1 元数据镜像（<code>qms_templates</code>）。模板主数据现已迁往 Lark Base 的 File Template 表管理，此表将逐步退役——请以「文件库 / 生成」为准。
		</p>
		{#if data.dataMessage}
			<p class="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
				{data.dataMessage}
			</p>
		{/if}
		<!-- ── Metadata admin table (legacy D1 mirror) ── -->
		<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
		<table class="w-full text-sm">
			<thead class="bg-slate-50 text-left text-xs text-slate-500">
				<tr>
					<th class="px-3 py-2">Code</th>
					<th class="px-3 py-2">Name</th>
					<th class="px-3 py-2">模块</th>
					<th class="px-3 py-2">Scope</th>
					<th class="px-3 py-2">Task type</th>
					<th class="px-3 py-2">责任角色</th>
					<th class="px-3 py-2">审批</th>
					<th class="px-3 py-2">状态</th>
					<th class="px-3 py-2"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-100">
				{#each templates as t (t.id)}
					<tr class="hover:bg-slate-50/60" class:opacity-50={!t.isActive}>
						<td class="px-3 py-2 font-mono text-xs text-slate-600">{t.code}</td>
						<td class="px-3 py-2 text-slate-800">{t.name}</td>
						<td class="px-3 py-2 text-xs text-slate-500">{t.moduleCategory ?? '—'}</td>
						<td class="px-3 py-2">
							<span class="rounded-full px-2 py-0.5 text-[11px] {scopeBadge(t.scope)}">{t.scope}</span>
						</td>
						<td class="px-3 py-2 text-xs text-slate-600">{t.taskType ?? '—'}</td>
						<td class="px-3 py-2 text-xs text-slate-600">{t.responsibleRole ?? '—'}</td>
						<td class="px-3 py-2 text-xs">{t.requiresApproval ? '✓' : '—'}</td>
						<td class="px-3 py-2 text-xs">{t.isActive ? '启用' : '停用'}</td>
						<td class="px-3 py-2 text-right">
							<button type="button" class="text-xs font-medium text-[var(--sf-green)] hover:underline" onclick={() => openEdit(t)}>编辑</button>
							{#if t.isActive}
								<button type="button" class="ml-2 text-xs font-medium text-rose-600 hover:underline" onclick={() => archive(t)}>停用</button>
							{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="9" class="px-3 py-6 text-center text-sm text-slate-400">暂无模板。</td></tr>
				{/each}
			</tbody>
		</table>
		</div>
	{/if}
</PageShell>

<!-- Editor modal -->
{#if editor}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button type="button" class="absolute inset-0 bg-slate-900/40" aria-label="Close" onclick={close}></button>
		<div class="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
			<div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
				<h2 class="text-sm font-semibold text-slate-900">{editor.mode === 'create' ? '新建模板' : '编辑模板'}</h2>
				<button type="button" class="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100" onclick={close}>×</button>
			</div>
			<div class="space-y-3 px-5 py-4 text-sm">
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Code</span>
						<input bind:value={editor.code} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="DR-001" />
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Order</span>
						<input type="number" bind:value={editor.orderIndex} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" />
					</label>
				</div>
				<label class="block">
					<span class="text-xs font-medium text-slate-500">Name</span>
					<input bind:value={editor.name} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="Design Review" />
				</label>
				<label class="block">
					<span class="text-xs font-medium text-slate-500">模块分类</span>
					<input bind:value={editor.moduleCategory} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="设计开发" />
				</label>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Scope</span>
						<select bind:value={editor.scope} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5">
							<option value="company">company</option>
							<option value="project">project</option>
							<option value="task">task</option>
						</select>
					</label>
					<label class="block">
						<span class="text-xs font-medium text-slate-500">Task type {editor.scope !== 'task' ? '(仅 task scope)' : ''}</span>
						<select bind:value={editor.taskType} disabled={editor.scope !== 'task'} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 disabled:bg-slate-100">
							<option value="">—</option>
							{#each TASK_TYPES as tt}<option value={tt}>{tt}</option>{/each}
						</select>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="block">
						<span class="text-xs font-medium text-slate-500">责任角色（self=任务负责人）</span>
						<input bind:value={editor.responsibleRole} class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5" placeholder="self / qa / reviewer / pm" />
					</label>
					<div class="flex items-end gap-4 pb-1">
						<label class="flex items-center gap-2 text-xs text-slate-600">
							<input type="checkbox" bind:checked={editor.requiresApproval} class="h-4 w-4 rounded border-slate-300" /> 需 PM 审批
						</label>
						<label class="flex items-center gap-2 text-xs text-slate-600">
							<input type="checkbox" bind:checked={editor.isActive} class="h-4 w-4 rounded border-slate-300" /> 启用
						</label>
					</div>
				</div>
				<label class="block">
					<span class="text-xs font-medium text-slate-500">说明</span>
					<textarea bind:value={editor.description} rows="2" class="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5"></textarea>
				</label>
			</div>
			{#if error}
				<div class="mx-5 mb-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
			{/if}
			<div class="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
				<button type="button" class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-white" onclick={close}>取消</button>
				<button type="button" class="rounded-md bg-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2f5e2c] disabled:opacity-60" disabled={saving} onclick={save}>{saving ? '保存中…' : '保存'}</button>
			</div>
		</div>
	</div>
{/if}
