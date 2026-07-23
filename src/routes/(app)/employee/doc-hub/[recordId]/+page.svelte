<script lang="ts">
	import {
		ArrowLeft,
		Download,
		ExternalLink,
		Eye,
		FileText,
		Loader2,
		Paperclip,
		Trash2,
		UploadCloud
	} from 'lucide-svelte';
	import PageShell from '$app-layer/components/PageShell.svelte';
	import type { DocHubAttachmentRef } from '$platform/integrations/lark/doc-hub-library';

	let { data } = $props();
	const item = $derived(data.item);
	const revision = $derived(data.revision);

	// Attachments are mutable (upload / delete) — seed from the loaded record.
	let attachments = $state<DocHubAttachmentRef[]>(data.item?.attachments ?? []);
	let selected = $state<DocHubAttachmentRef | null>(null);

	function isImage(att: DocHubAttachmentRef): boolean {
		return /^image\//i.test(att.mimeType) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.name);
	}
	function isPdf(att: DocHubAttachmentRef): boolean {
		return att.mimeType === 'application/pdf' || /\.pdf$/i.test(att.name);
	}
	const previewable = (att: DocHubAttachmentRef) => isImage(att) || isPdf(att);

	// Auto-select the first previewable attachment when the list changes and
	// nothing (still present) is selected.
	$effect(() => {
		if (selected && attachments.some((a) => a.fileToken === selected!.fileToken)) return;
		selected = attachments.find(previewable) ?? null;
	});

	function attachmentUrl(att: DocHubAttachmentRef, download = false): string {
		const params = new URLSearchParams({ token: att.fileToken, name: att.name });
		if (revision != null) params.set('rev', String(revision));
		if (download) params.set('download', '1');
		return `/api/employee/doc-hub/attachment?${params.toString()}`;
	}

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

	// --- Upload / delete ---
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);
	let deleting = $state<string | null>(null);
	let actionError = $state<string | null>(null);

	async function upload(event: SubmitEvent) {
		event.preventDefault();
		const files = fileInput?.files;
		if (!files || files.length === 0 || !item) return;
		const fd = new FormData();
		for (const f of files) fd.append('files', f);

		uploading = true;
		actionError = null;
		try {
			const res = await fetch(`/api/employee/doc-hub/${item.recordId}/attachments`, {
				method: 'POST',
				body: fd
			});
			const body = (await res.json()) as { ok: boolean; attachments?: DocHubAttachmentRef[]; error?: string };
			if (body.ok && body.attachments) {
				attachments = body.attachments;
				if (fileInput) fileInput.value = '';
			} else {
				actionError = body.error ?? 'Upload failed.';
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			uploading = false;
		}
	}

	async function remove(att: DocHubAttachmentRef) {
		if (!item) return;
		if (!confirm(`Delete "${att.name}"? This removes it from the Bitable record.`)) return;

		deleting = att.fileToken;
		actionError = null;
		try {
			const res = await fetch(
				`/api/employee/doc-hub/${item.recordId}/attachments?token=${encodeURIComponent(att.fileToken)}`,
				{ method: 'DELETE' }
			);
			const body = (await res.json()) as { ok: boolean; attachments?: DocHubAttachmentRef[]; error?: string };
			if (body.ok && body.attachments) {
				attachments = body.attachments;
			} else {
				actionError = body.error ?? 'Delete failed.';
			}
		} catch (err) {
			actionError = err instanceof Error ? err.message : String(err);
		} finally {
			deleting = null;
		}
	}

	interface MetaRow {
		label: string;
		value: string | number | null;
	}
	const meta = $derived<MetaRow[]>(
		item
			? [
					{ label: 'Project', value: item.project },
					{ label: 'Category', value: item.category },
					{ label: 'File type', value: item.fileType },
					{ label: 'Source', value: item.source },
					{ label: 'Doc status', value: item.docStatus },
					{ label: 'Security', value: item.security },
					{ label: 'Version', value: item.version },
					{ label: 'Owner', value: item.owner },
					{ label: 'Created', value: item.createdDate }
				].filter((r) => r.value != null && r.value !== '')
			: []
	);
</script>

<div class="mb-4">
	<a
		href="/employee/doc-hub"
		class="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-[var(--sf-green)]"
	>
		<ArrowLeft size={15} /> Back to Doc Hub
	</a>
</div>

{#if data.loadError}
	<div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
		{data.loadError}
	</div>
{:else if !item}
	<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading…</div>
{:else}
	<PageShell eyebrow="My Space · Doc Hub" title={item.title} description={item.docId ?? ''}>
		{#if actionError}
			<div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
				{actionError}
			</div>
		{/if}

		<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
			<!-- Left: metadata + summary + link -->
			<div class="space-y-4 lg:col-span-1">
				<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="text-sm font-semibold text-slate-800">Details</h2>
						{#if item.status}
							<span
								class={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone(item.status)}`}
							>
								{item.status}
							</span>
						{/if}
					</div>
					<dl class="space-y-2">
						{#each meta as row}
							<div class="flex items-start justify-between gap-3 text-sm">
								<dt class="shrink-0 text-slate-400">{row.label}</dt>
								<dd class="text-right font-medium text-slate-700">{row.value}</dd>
							</div>
						{/each}
					</dl>
					{#if item.labels.length}
						<div class="mt-3 flex flex-wrap gap-1 border-t border-slate-100 pt-3">
							{#each item.labels as label}
								<span class="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">#{label}</span>
							{/each}
						</div>
					{/if}
				</div>

				{#if item.fileLink}
					<a
						href={item.fileLink}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--sf-green)] px-3 py-2.5 text-sm font-medium text-[var(--sf-green)] transition hover:bg-[var(--sf-green-soft)]"
					>
						<ExternalLink size={15} /> Open shared document
					</a>
				{/if}

				{#if item.content}
					<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
						<h2 class="mb-2 text-sm font-semibold text-slate-800">Summary</h2>
						<p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{item.content}</p>
					</div>
				{/if}
			</div>

			<!-- Right: attachments + preview -->
			<div class="space-y-4 lg:col-span-2">
				<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<div class="mb-3 flex items-center justify-between">
						<h2 class="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
							<Paperclip size={15} class="text-slate-400" /> Attachments ({attachments.length})
						</h2>
					</div>

					{#if attachments.length === 0}
						<p class="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
							No attachments yet.
						</p>
					{:else}
						<ul class="space-y-1.5">
							{#each attachments as att (att.fileToken)}
								<li
									class={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition ${
										selected?.fileToken === att.fileToken ? 'bg-[var(--sf-green-soft)]' : 'bg-slate-50'
									}`}
								>
									<button
										type="button"
										class="flex min-w-0 flex-1 items-center gap-2 text-left"
										onclick={() => (selected = att)}
										disabled={!previewable(att)}
										title={previewable(att) ? 'Preview' : 'Preview not available for this type'}
									>
										<FileText size={15} class="shrink-0 text-slate-400" />
										<span class="truncate text-sm text-slate-700">{att.name}</span>
										{#if att.size != null}
											<span class="shrink-0 text-[11px] text-slate-400">{formatSize(att.size)}</span>
										{/if}
									</button>
									<span class="flex shrink-0 items-center gap-0.5">
										{#if previewable(att)}
											<button
												type="button"
												title="Preview"
												onclick={() => (selected = att)}
												class="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-[var(--sf-green)]"
											>
												<Eye size={15} />
											</button>
										{/if}
										<a
											href={attachmentUrl(att, true)}
											title="Download"
											class="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-[var(--sf-green)]"
										>
											<Download size={15} />
										</a>
										<button
											type="button"
											title="Delete"
											onclick={() => remove(att)}
											disabled={deleting === att.fileToken}
											class="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-rose-600 disabled:opacity-50"
										>
											{#if deleting === att.fileToken}
												<Loader2 size={15} class="animate-spin" />
											{:else}
												<Trash2 size={15} />
											{/if}
										</button>
									</span>
								</li>
							{/each}
						</ul>
					{/if}

					<!-- Upload -->
					<form class="mt-3 border-t border-slate-100 pt-3" onsubmit={upload}>
						<label class="mb-1.5 block text-xs font-medium text-slate-500" for="dh-upload">
							Upload attachment(s)
						</label>
						<div class="flex flex-wrap items-center gap-2">
							<input
								id="dh-upload"
								bind:this={fileInput}
								type="file"
								multiple
								class="block max-w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
							/>
							<button
								type="submit"
								disabled={uploading}
								class="inline-flex items-center gap-1.5 rounded-lg bg-[var(--sf-green)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
							>
								{#if uploading}
									<Loader2 size={15} class="animate-spin" /> Uploading…
								{:else}
									<UploadCloud size={15} /> Upload
								{/if}
							</button>
						</div>
						<p class="mt-1 text-[11px] text-slate-400">Up to 20 MB per file. New files are added to this record.</p>
					</form>
				</div>

				<!-- Preview pane -->
				{#if selected}
					<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div class="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
							<span class="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
								<Eye size={14} class="shrink-0 text-slate-400" />
								<span class="truncate">{selected.name}</span>
							</span>
							<a
								href={attachmentUrl(selected, true)}
								class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:bg-slate-50"
							>
								<Download size={13} /> Download
							</a>
						</div>
						<div class="bg-slate-100">
							{#if isImage(selected)}
								<img src={attachmentUrl(selected)} alt={selected.name} class="mx-auto max-h-[70vh] object-contain" />
							{:else if isPdf(selected)}
								<iframe src={attachmentUrl(selected)} title={selected.name} class="h-[70vh] w-full"></iframe>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</PageShell>
{/if}
