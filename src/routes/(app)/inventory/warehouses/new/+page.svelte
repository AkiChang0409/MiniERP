<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	let { form } = $props();
	const formAny = $derived(form as { message?: string; values?: any } | null | undefined);
	const v = $derived(formAny?.values ?? {});
</script>

<PageShell eyebrow="Inventory" title="New warehouse" description="Define a warehouse / DC / hub with address and contact info. After saving, add bin locations.">
	<form method="POST" class="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
		{#if formAny?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{formAny.message}</p>
		{/if}

		<section class="grid gap-4 md:grid-cols-2">
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Warehouse code<span class="text-rose-600"> *</span></span>
				<input name="code" required value={v.code ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="WH-01" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Name<span class="text-rose-600"> *</span></span>
				<input name="name" required value={v.name ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Main DC" />
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Status</span>
				<select name="status" class="w-full rounded-md border border-slate-300 px-3 py-2">
					<option value="active" selected={v.status !== 'inactive'}>Active</option>
					<option value="inactive" selected={v.status === 'inactive'}>Inactive</option>
				</select>
			</label>
			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Country</span>
				<input name="country" value={v.country ?? 'Singapore'} class="w-full rounded-md border border-slate-300 px-3 py-2" />
			</label>
		</section>

		<section class="space-y-3">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Address</h2>
			<div class="grid gap-3 md:grid-cols-2">
				<label class="space-y-1 text-sm md:col-span-2">
					<span class="text-slate-700">Line 1</span>
					<input name="addressLine1" value={v.addressLine1 ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm md:col-span-2">
					<span class="text-slate-700">Line 2</span>
					<input name="addressLine2" value={v.addressLine2 ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">City</span>
					<input name="city" value={v.city ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">State / Region</span>
					<input name="state" value={v.state ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Postal code</span>
					<input name="postalCode" value={v.postalCode ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
			</div>
		</section>

		<section class="space-y-3">
			<h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Contact</h2>
			<div class="grid gap-3 md:grid-cols-3">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Name</span>
					<input name="contactName" value={v.contactName ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Phone</span>
					<input name="contactPhone" value={v.contactPhone ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Email</span>
					<input name="contactEmail" type="email" value={v.contactEmail ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2" />
				</label>
			</div>
		</section>

		<label class="space-y-1 text-sm">
			<span class="text-slate-700">Notes</span>
			<textarea name="notes" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2">{v.notes ?? ''}</textarea>
		</label>

		<div class="flex justify-end gap-3">
			<a href="/inventory/warehouses" class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</a>
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]">Create warehouse</button>
		</div>
	</form>
</PageShell>
