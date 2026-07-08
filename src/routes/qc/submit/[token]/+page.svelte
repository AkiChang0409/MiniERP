<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let submitting = $state(false);
	let dragActive = $state(false);
	let fileName = $state('');

	function onFileChange(e: Event) {
		fileName = (e.target as HTMLInputElement).files?.[0]?.name ?? '';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-slate-50 p-4">
	<div class="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
		<!-- Brand header -->
		<div class="flex items-center gap-2.5 border-b border-slate-100 px-6 py-4">
			<span
				class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--sf-green)] text-sm font-bold text-white"
				>SF</span
			>
			<span class="text-sm font-semibold text-slate-800">SmartFin&nbsp;·&nbsp;QC Portal</span>
		</div>

		<div class="p-6">
			{#if !data.valid}
				<h1 class="text-lg font-semibold text-slate-900">Link expired</h1>
				<p class="mt-2 text-sm text-rose-600">
					This upload link is invalid or has expired. Please contact your Axiom contact for a new one.
				</p>
			{:else if form?.ok}
				<h1 class="text-lg font-semibold text-slate-900">Upload received</h1>
				<div class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
					✓ Thank you — your checklist has been submitted for review. You can close this page.
				</div>
			{:else}
				<h1 class="text-lg font-semibold text-slate-900">Upload QC Checklist</h1>
				<p class="mt-1.5 text-sm text-slate-500">
					Attach the filled checklist below and submit. It's routed to the right project automatically.
				</p>

				{#if form?.error}
					<p class="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
						{form.error}
					</p>
				{/if}

				<form
					method="POST"
					action="?/upload"
					enctype="multipart/form-data"
					class="mt-5 space-y-4"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
				>
					<label
						class="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition {dragActive
							? 'border-[var(--sf-green)] bg-[var(--sf-green-soft)]'
							: 'border-slate-300 bg-slate-50/50 hover:border-[var(--sf-green)] hover:bg-slate-50'}"
						ondragover={(e) => {
							e.preventDefault();
							dragActive = true;
						}}
						ondragleave={() => (dragActive = false)}
						ondrop={() => (dragActive = false)}
					>
						<input name="file" type="file" required class="hidden" onchange={onFileChange} />
						<span class="text-2xl">📄</span>
						<span class="text-sm font-medium text-slate-700">{fileName || 'Choose a file to upload'}</span>
						<span class="text-xs text-slate-400">Any file type · click to browse</span>
					</label>

					<button
						type="submit"
						disabled={submitting}
						class="w-full rounded-md bg-[var(--sf-green)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#2f5e2c] disabled:opacity-50"
					>
						{submitting ? 'Uploading…' : 'Submit checklist'}
					</button>
				</form>
			{/if}

			<p class="mt-6 text-center text-[11px] text-slate-400">
				Secured upload · this link is unique to your submission.
			</p>
		</div>
	</div>
</div>
