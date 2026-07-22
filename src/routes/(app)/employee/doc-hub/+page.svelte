<script lang="ts">
	import {
		Download,
		ExternalLink,
		Eye,
		FileText,
		Filter,
		Paperclip,
		Search,
		X
	} from 'lucide-svelte';
	import PageShell from '$app-layer/components/PageShell.svelte';
	import type {
		DocHubLibrary,
		DocHubLibraryItem,
		DocHubAttachmentRef
	} from '$platform/integrations/lark/doc-hub-library';

	let { data } = $props();
	const library = $derived<DocHubLibrary | null>(data.library);
	const error = $derived<string | null>(data.error);
	const items = $derived<DocHubLibraryItem[]>(library?.items ?? []);
	const revision = $derived(library?.revision ?? null);

	// --- Filters (client-side, reactive) ---
	let projectFilter = $state('');
	let categoryFilter = $state('');
	let typeFilter = $state('');
	let query = $state('');

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return items.filter((it) => {
			if (projectFilter && it.project !== projectFilter) return false;
			if (categoryFilter && it.category !== categoryFilter) return false;
			if (typeFilter && it.fileType !== typeFilter) return false;
			if (q) {
				const haystack = [it.title, it.docId, it.content, it.project, it.category, ...it.labels]
					.filter(Boolean)
					.join(' ')
					.toLowerCase();
				if (!haystack.includes(q)) return false;
			}
			return true;
		});
	});

	const hasActiveFilter = $derived(
		Boolean(projectFilter || categoryFilter || typeFilter || query.trim())
	);

	function resetFilters() {
		projectFilter = '';
		categoryFilter = '';
		typeFilter = '';
		query = '';
	}

	// --- Attachment preview ---
	let preview = $state<DocHubAttachmentRef | null>(null);

	function attachmentUrl(att: DocHubAttachmentRef, download = false): string {
		const params = new URLSearchParams({ token: att.fileToken, name: att.name });
		if (revision != null) params.set('rev', String(revision));
		if (download) params.set('download', '1');
		return `/api/employee/doc-hub/attachment?${params.toString()}`;
	}

	function isImage(att: DocHubAttachmentRef): boolean {
		return /^image\//i.test(att.mimeType) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name);
	}
	function isPdf(att: DocHubAttachmentRef): boolean {
		return att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.name);
	}
	const previewable = (att: DocHubAttachmentRef) => isImage(att) || isPdf(att);

	function formatSize(bytes: number | null): string {
		if (bytes == null) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	const statusTone = (status: string | null) => {
		switch ((status ?? '').toLowerCase()) {
			case 'completed':
			case 'complete':
			case 'done':
				return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
			case 'failed':
			case 'error':
				return 'bg-rose-50 text-rose-700 ring-rose-200';
			case 'processing':
			case 'in progress':
				return 'bg-amber-50 text-amber-700 ring-amber-200';
			default:
				return 'bg-slate-100 text-slate-600 ring-slate-200';
		}
	};

	const selectClass =
		'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[var(--sf-green)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]';
</script>

<PageShell
	eyebrow="My Space"
	title="Doc Hub"
	description="Documents synced from the Lark Doc Hub. Filter by project or category, preview attachments, or open the shared document."
>
	{#if error}
		<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
			{error}
		</div>
	{:else if !library}
		<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
			Loading…
		</div>
	{:else}
		<!-- Filter bar -->
		<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex min-w-[220px] flex-1 flex-col gap-1">
					<label class="text-xs font-medium text-slate-500" for="dh-search">Search</label>
					<div class="relative">
						<Search
							class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
							size={16}
						/>
						<input
							id="dh-search"
							type="search"
							bind:value={query}
							placeholder="Title, doc ID, content, label…"
							class="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-slate-700 focus:border-[var(--sf-green)] focus:outline-none focus:ring-1 focus:ring-[var(--sf-green)]"
						/>
					</div>
				</div>

				<div class="flex flex-col gap-1">
					<label class="text-xs font-medium text-slate-500" for="dh-project">Project</label>
					<select id="dh-project" bind:value={projectFilter} class={selectClass}>
						<option value="">All projects</option>
						{#each library.projects as p}
							<option value={p}>{p}</option>
						{/each}
					</select>
				</div>

				<div class="flex flex-col gap-1">
					<label class="text-xs font-medium text-slate-500" for="dh-category">Category</label>
					<select id="dh-category" bind:value={categoryFilter} class={selectClass}>
						<option value="">All categories</option>
						{#each library.categories as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</div>

				{#if library.fileTypes.length}
					<div class="flex flex-col gap-1">
						<label class="text-xs font-medium text-slate-500" for="dh-type">File type</label>
						<select id="dh-type" bind:value={typeFilter} class={selectClass}>
							<option value="">All types</option>
							{#each library.fileTypes as t}
								<option value={t}>{t}</option>
							{/each}
						</select>
					</div>
				{/if}

				{#if hasActiveFilter}
					<button
						type="button"
						onclick={resetFilters}
						class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
					>
						<X size={14} /> Reset
					</button>
				{/if}
			</div>

			<div class="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
				<Filter size={13} />
				Showing {filtered.length} of {items.length} document{items.length === 1 ? '' : 's'}
			</div>
		</div>

		<!-- Results -->
		{#if filtered.length === 0}
			<div
				class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500"
			>
				{items.length === 0
					? 'No documents in the Doc Hub yet.'
					: 'No documents match the current filters.'}
			</div>
		{:else}
			<div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
				{#each filtered as it (it.recordId)}
					<article
						class="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
					>
						<div class="flex items-start justify-between gap-2">
							<h3 class="min-w-0 text-sm font-semibold text-slate-900">{it.title}</h3>
							{#if it.status}
								<span
									class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone(it.status)}`}
								>
									{it.status}
								</span>
							{/if}
						</div>

						{#if it.docId}
							<p class="mt-0.5 text-[11px] font-mono text-slate-400">{it.docId}</p>
						{/if}

						<div class="mt-2 flex flex-wrap gap-1.5">
							{#if it.project}
								<span class="rounded-md bg-[var(--sf-green-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-green)]">
									{it.project}
								</span>
							{/if}
							{#if it.category}
								<span class="rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
									{it.category}
								</span>
							{/if}
							{#if it.fileType}
								<span class="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
									{it.fileType}
								</span>
							{/if}
						</div>

						{#if it.content}
							<p class="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600">{it.content}</p>
						{/if}

						{#if it.labels.length}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each it.labels as label}
									<span class="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">#{label}</span>
								{/each}
							</div>
						{/if}

						<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
							{#if it.owner}<span>{it.owner}</span>{/if}
							{#if it.createdDate}<span>{it.createdDate}</span>{/if}
							{#if it.version != null}<span>v{it.version}</span>{/if}
						</div>

						<!-- Actions -->
						<div class="mt-3 flex flex-1 flex-col justify-end gap-2 border-t border-slate-100 pt-3">
							{#if it.attachments.length}
								<div class="flex flex-col gap-1.5">
									{#each it.attachments as att}
										<div class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
											<span class="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
												<Paperclip size={13} class="shrink-0 text-slate-400" />
												<span class="truncate">{att.name}</span>
												{#if att.size != null}
													<span class="shrink-0 text-[10px] text-slate-400">{formatSize(att.size)}</span>
												{/if}
											</span>
											<span class="flex shrink-0 items-center gap-1">
												{#if previewable(att)}
													<button
														type="button"
														title="Preview"
														onclick={() => (preview = att)}
														class="rounded-md p-1 text-slate-500 transition hover:bg-white hover:text-[var(--sf-green)]"
													>
														<Eye size={15} />
													</button>
												{/if}
												<a
													href={attachmentUrl(att, true)}
													title="Download"
													class="rounded-md p-1 text-slate-500 transition hover:bg-white hover:text-[var(--sf-green)]"
												>
													<Download size={15} />
												</a>
											</span>
										</div>
									{/each}
								</div>
							{/if}

							{#if it.fileLink}
								<a
									href={it.fileLink}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--sf-green)] px-3 py-1.5 text-xs font-medium text-[var(--sf-green)] transition hover:bg-[var(--sf-green-soft)]"
								>
									<ExternalLink size={14} /> Open shared document
								</a>
							{/if}

							{#if !it.attachments.length && !it.fileLink}
								<p class="flex items-center gap-1.5 text-xs text-slate-400">
									<FileText size={14} /> No file or link
								</p>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</PageShell>

<!-- Attachment preview modal -->
{#if preview}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
		role="button"
		tabindex="0"
		onclick={() => (preview = null)}
		onkeydown={(e) => e.key === 'Escape' && (preview = null)}
	>
		<div
			class="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-label="Attachment preview"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={() => {}}
		>
			<div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
				<span class="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
					<Paperclip size={15} class="shrink-0 text-slate-400" />
					<span class="truncate">{preview.name}</span>
				</span>
				<div class="flex items-center gap-2">
					<a
						href={attachmentUrl(preview, true)}
						class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
					>
						<Download size={13} /> Download
					</a>
					<button
						type="button"
						onclick={() => (preview = null)}
						class="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
						aria-label="Close preview"
					>
						<X size={16} />
					</button>
				</div>
			</div>
			<div class="min-h-0 flex-1 overflow-auto bg-slate-100">
				{#if isImage(preview)}
					<img src={attachmentUrl(preview)} alt={preview.name} class="mx-auto max-h-[80vh] object-contain" />
				{:else if isPdf(preview)}
					<iframe src={attachmentUrl(preview)} title={preview.name} class="h-[80vh] w-full"></iframe>
				{:else}
					<div class="p-10 text-center text-sm text-slate-500">
						Preview not available for this file type.
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
