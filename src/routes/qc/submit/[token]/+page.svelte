<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:16px;">
	<div style="width:100%;max-width:440px;background:#fff;border:1px solid #e5e6eb;border-radius:14px;box-shadow:0 4px 16px rgba(31,35,41,.06);padding:28px;">
		<h1 style="margin:0 0 6px;font-size:19px;color:#1f2329;">Upload QC Checklist</h1>

		{#if !data.valid}
			<p style="color:#c4302b;font-size:14px;">
				This upload link is invalid or has expired. Please contact your Axiom contact for a new link.
			</p>
		{:else if form?.ok}
			<div style="margin-top:8px;padding:14px;background:#e4f7e4;border:1px solid #b7e6b7;border-radius:10px;color:#1a8a1a;font-size:14px;">
				✅ Received — thank you. Your checklist has been submitted for review. You can close this page.
			</div>
		{:else}
			<p style="color:#646a73;font-size:13.5px;margin:0 0 18px;">
				Attach the filled QC checklist below and submit. It will be routed to the right project automatically.
			</p>

			{#if form?.error}
				<div style="margin-bottom:14px;padding:10px 12px;background:#fdeaea;border:1px solid #f5c6c5;border-radius:8px;color:#c4302b;font-size:13px;">
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<input
					name="file"
					type="file"
					required
					accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
					style="width:100%;font-size:14px;margin-bottom:16px;"
				/>
				<button
					type="submit"
					disabled={submitting}
					style="width:100%;padding:11px;background:#3370ff;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;opacity:{submitting ? 0.6 : 1};"
				>
					{submitting ? 'Uploading…' : 'Submit checklist'}
				</button>
			</form>
		{/if}
	</div>
</div>
