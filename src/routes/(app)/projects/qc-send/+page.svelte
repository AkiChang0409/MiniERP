<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let selectedSupplier = $state('');
	let recipientEmail = $state('');
	let submitting = $state(false);

	function onSupplierChange() {
		const s = data.suppliers.find((x) => x.recordId === selectedSupplier);
		recipientEmail = s?.email ?? '';
	}
</script>

<div class="mx-auto max-w-2xl p-6">
	<h1 class="text-xl font-semibold text-gray-900">Send QC Checklist</h1>
	<p class="mt-1 text-sm text-gray-500">
		Pick the project and supplier, attach the blank checklist. The supplier gets an email with an
		upload link — their reply lands back in Doc Hub against this project.
	</p>

	{#if !data.configured}
		<div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
			Lark Base is not reachable/configured (check LARK_* env + Base collaborator).
			{#if data.loadError}<br /><span class="text-xs">{data.loadError}</span>{/if}
		</div>
	{/if}

	{#if form?.ok}
		<div class="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
			✅ Sent. Subject <code>{form.subject}</code>{form.emailSent ? '' : ' (email not dispatched — check RESEND_API_KEY)'}.
			<br />Upload link: <a class="text-blue-600 underline" href={form.uploadUrl}>{form.uploadUrl}</a>
		</div>
	{:else if form?.error}
		<div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		action="?/send"
		enctype="multipart/form-data"
		class="mt-6 space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<div>
			<label for="projectId" class="block text-sm font-medium text-gray-700">Project</label>
			<select
				id="projectId"
				name="projectId"
				required
				class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
			>
				<option value="" disabled selected>Select a project…</option>
				{#each data.projects as p (p.recordId)}
					<option value={p.recordId}>{p.name}{p.code ? ` (${p.code})` : ''}</option>
				{/each}
			</select>
		</div>

		<div>
			<label for="supplierId" class="block text-sm font-medium text-gray-700">Supplier</label>
			<select
				id="supplierId"
				name="supplierId"
				required
				bind:value={selectedSupplier}
				onchange={onSupplierChange}
				class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
			>
				<option value="" disabled selected>Select a supplier…</option>
				{#each data.suppliers as s (s.recordId)}
					<option value={s.recordId}>{s.name}</option>
				{/each}
			</select>
		</div>

		<div>
			<label for="recipientEmail" class="block text-sm font-medium text-gray-700">
				Recipient email
			</label>
			<input
				id="recipientEmail"
				name="recipientEmail"
				type="email"
				required
				bind:value={recipientEmail}
				placeholder="supplier@example.com"
				class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
			/>
			<p class="mt-1 text-xs text-gray-400">Prefilled from the supplier record; edit if needed.</p>
		</div>

		<div>
			<label for="file" class="block text-sm font-medium text-gray-700">QC checklist file</label>
			<input
				id="file"
				name="file"
				type="file"
				required
				accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
				class="mt-1 w-full text-sm"
			/>
		</div>

		<button
			type="submit"
			disabled={submitting}
			class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
		>
			{submitting ? 'Sending…' : 'Send to supplier'}
		</button>
	</form>
</div>
