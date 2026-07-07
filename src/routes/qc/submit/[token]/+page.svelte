<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let submitting = $state(false);
	let fileName = $state('');

	function onFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		fileName = input.files?.[0]?.name ?? '';
	}
</script>

<div class="page">
	<div class="card">
		<div class="brand">
			<span class="logo">A</span>
			<span class="brand-name">Axiom&nbsp;·&nbsp;QC Portal</span>
		</div>

		<h1>Upload QC Checklist</h1>

		{#if !data.valid}
			<p class="muted err">
				This upload link is invalid or has expired. Please contact your Axiom contact for a new link.
			</p>
		{:else if form?.ok}
			<div class="banner ok">
				✅ Received — thank you. Your checklist has been submitted for review. You can close this page.
			</div>
		{:else}
			<p class="muted">
				Attach the filled QC checklist below and submit. It will be routed to the right project
				automatically.
			</p>

			{#if form?.error}
				<div class="banner err">{form.error}</div>
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
				<label class="dropzone">
					<input name="file" type="file" required onchange={onFileChange} />
					<span class="dz-icon">📄</span>
					<span class="dz-text">{fileName || 'Choose a file to upload'}</span>
					<span class="dz-hint">Any file type · click to browse</span>
				</label>

				<button type="submit" disabled={submitting}>
					{submitting ? 'Uploading…' : 'Submit checklist'}
				</button>
			</form>
		{/if}

		<p class="foot">Secured upload · this link is unique to your submission.</p>
	</div>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(160deg, #eef2fb, #f4f5f7);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		padding: 16px;
	}
	.card {
		width: 100%;
		max-width: 460px;
		background: #fff;
		border: 1px solid #e5e6eb;
		border-radius: 16px;
		box-shadow: 0 8px 30px rgba(31, 35, 41, 0.08);
		padding: 30px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-bottom: 22px;
	}
	.logo {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: linear-gradient(135deg, #3370ff, #5b8cff);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 16px;
	}
	.brand-name {
		font-weight: 600;
		color: #1f2329;
		font-size: 14px;
	}
	h1 {
		margin: 0 0 6px;
		font-size: 20px;
		color: #1f2329;
	}
	.muted {
		color: #646a73;
		font-size: 13.5px;
		margin: 0 0 20px;
	}
	.err {
		color: #c4302b;
	}
	.banner {
		padding: 12px 14px;
		border-radius: 10px;
		font-size: 13.5px;
		margin-bottom: 16px;
	}
	.banner.ok {
		background: #e4f7e4;
		border: 1px solid #b7e6b7;
		color: #1a8a1a;
	}
	.banner.err {
		background: #fdeaea;
		border: 1px solid #f5c6c5;
		color: #c4302b;
	}
	.dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 26px 16px;
		border: 1.5px dashed #c4cbd6;
		border-radius: 12px;
		cursor: pointer;
		text-align: center;
		transition: border-color 0.15s, background 0.15s;
	}
	.dropzone:hover {
		border-color: #3370ff;
		background: #f7f9ff;
	}
	.dropzone input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.dz-icon {
		font-size: 26px;
	}
	.dz-text {
		font-size: 14px;
		color: #1f2329;
		font-weight: 500;
		word-break: break-all;
	}
	.dz-hint {
		font-size: 12px;
		color: #8f959e;
	}
	button {
		width: 100%;
		margin-top: 18px;
		padding: 12px;
		background: #3370ff;
		color: #fff;
		border: none;
		border-radius: 10px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.foot {
		margin: 22px 0 0;
		text-align: center;
		font-size: 11.5px;
		color: #a5abb3;
	}
</style>
