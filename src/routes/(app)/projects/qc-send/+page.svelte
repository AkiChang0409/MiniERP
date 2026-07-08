<script lang="ts">
	import { enhance } from '$app/forms';
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data, form } = $props();

	let selectedSupplier = $state('');
	let recipientEmail = $state('');
	let selectedCategory = $state('');
	let submitting = $state(false);
	let dragActive = $state(false);
	let fileName = $state('');

	function onSupplierChange() {
		const s = data.suppliers.find((x) => x.recordId === selectedSupplier);
		recipientEmail = s?.email ?? '';
	}

	function onFileChange(e: Event) {
		fileName = (e.target as HTMLInputElement).files?.[0]?.name ?? '';
	}

	// Category → File Type cascade, driven by the classification dictionary.
	const categories = $derived([
		...new Set((data.classifications ?? []).map((c) => c.category))
	].filter(Boolean));
	const fileTypes = $derived(
		(data.classifications ?? []).filter((c) => c.category === selectedCategory)
	);

	const inputClass =
		'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]';
</script>

<PageShell
	eyebrow="Project · Quality"
	title="Send QC Checklist"
	description="Pick the project, supplier and classification, attach the blank checklist. The supplier gets an upload link; their submission lands back in Doc Hub against this project."
>
	{#if !data.configured}
		<p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
			Lark Base is not reachable/configured (check LARK_* env + Base collaborator).
			{#if data.loadError}<br /><span class="text-xs">{data.loadError}</span>{/if}
		</p>
	{/if}

	{#if form?.ok}
		<div class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
			<p class="font-medium">✓ Sent to supplier.</p>
			<p class="mt-1 text-emerald-700">
				Subject <code class="rounded bg-emerald-100 px-1">{form.subject}</code>{form.emailSent
					? ''
					: ' · email not dispatched (verify a Resend domain)'}.
			</p>
			<p class="mt-1 break-all text-xs text-emerald-700">
				Upload link:
				<a
					class="font-medium underline hover:text-emerald-900"
					href={form.uploadUrl}
					target="_blank"
					rel="noopener noreferrer">{form.uploadUrl} ↗</a
				>
			</p>
		</div>
	{:else if form?.error}
		<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.error}</p>
	{/if}

	<form
		method="POST"
		action="?/send"
		enctype="multipart/form-data"
		class="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<!-- Recipient -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Recipient</h3>
			<div class="grid gap-4 md:grid-cols-2">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Project <span class="text-rose-600">*</span></span>
					<select name="projectId" required class={inputClass}>
						<option value="" disabled selected>Select a project…</option>
						{#each data.projects as p (p.recordId)}
							<option value={p.recordId}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
						{/each}
					</select>
				</label>

				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Supplier <span class="text-rose-600">*</span></span>
					<select
						name="supplierId"
						required
						bind:value={selectedSupplier}
						onchange={onSupplierChange}
						class={inputClass}
					>
						<option value="" disabled selected>Select a supplier…</option>
						{#each data.suppliers as s (s.recordId)}
							<option value={s.recordId}>{s.name}</option>
						{/each}
					</select>
				</label>
			</div>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Recipient email <span class="text-rose-600">*</span></span>
				<input
					name="recipientEmail"
					type="email"
					required
					bind:value={recipientEmail}
					placeholder="supplier@example.com"
					class={inputClass}
				/>
				<span class="block text-xs text-slate-400">Prefilled from the supplier record; edit if needed.</span>
			</label>
		</section>

		<!-- Classification -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Classification</h3>
			{#if categories.length}
				<div class="grid gap-4 md:grid-cols-2">
					<label class="space-y-1 text-sm">
						<span class="text-slate-700">Category</span>
						<select name="category" bind:value={selectedCategory} class={inputClass}>
							<option value="" disabled selected>Select a category…</option>
							{#each categories as c (c)}
								<option value={c}>{c}</option>
							{/each}
						</select>
					</label>

					<label class="space-y-1 text-sm">
						<span class="text-slate-700">File Type</span>
						<select name="fileType" disabled={!selectedCategory} class="{inputClass} disabled:bg-slate-100">
							<option value="" selected>{selectedCategory ? 'Select a file type…' : 'Pick a category first'}</option>
							{#each fileTypes as ft (ft.recordId)}
								<option value={ft.fileType}>{ft.fileType}</option>
							{/each}
						</select>
						<span class="block text-xs text-slate-400">Filtered by the selected category.</span>
					</label>
				</div>
			{:else}
				<p class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
					Category / File Type picker unavailable — set <code>LARK_DICT_TABLE_ID</code> (classification
					dictionary) to enable.
				</p>
			{/if}
		</section>

		<!-- Checklist file -->
		<section class="space-y-4">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500">Checklist file</h3>
			<label
				class="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition {dragActive
					? 'border-[var(--sf-green)] bg-[var(--sf-green-soft)]'
					: 'border-slate-300 bg-slate-50/40 hover:border-[var(--sf-green)] hover:bg-slate-50'}"
				ondragover={(e) => {
					e.preventDefault();
					dragActive = true;
				}}
				ondragleave={() => (dragActive = false)}
				ondrop={() => (dragActive = false)}
			>
				<input name="file" type="file" required class="hidden" onchange={onFileChange} />
				<span class="text-2xl">📄</span>
				<span class="text-sm font-medium text-slate-700">{fileName || 'Click to choose the checklist file'}</span>
				<span class="text-xs text-slate-400">Any file type · click to browse</span>
			</label>
		</section>

		<div class="flex items-center gap-3 border-t border-slate-100 pt-4">
			<button
				type="submit"
				disabled={submitting}
				class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2f5e2c] disabled:opacity-50"
			>
				{submitting ? 'Sending…' : 'Send to supplier'}
			</button>
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/projects">
				Back to projects
			</a>
		</div>
	</form>
</PageShell>
