<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { form } = $props();
</script>

<PageShell
	eyebrow="Sales & CRM"
	title="New customer"
	description="Creates a customer record for project assignment and customer-facing AR documents (invoices, quotations)."
>
	<form class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" method="POST">
		{#if form?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.message}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Legal / display name</span>
				<input
					name="name"
					required
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="e.g. Acme Logistics Pte Ltd"
				/>
			</label>

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Billing address</span>
				<textarea
					name="address"
					rows="3"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Registered address or bill-to line"
				></textarea>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Contact</span>
				<input
					name="contact"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Phone / email"
				/>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">GST registration no.</span>
				<input
					name="gstRegNo"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Optional (e.g. M90371234X)"
				/>
			</label>
		</div>

		<div class="flex flex-wrap gap-3">
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
				Save customer
			</button>
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/sales-crm/customers">
				Back to list
			</a>
		</div>
	</form>
</PageShell>


