<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';
	import SalesSubNav from '$app-layer/components/sales-crm/SalesSubNav.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	const tabs = ['Profile', 'Contacts', 'Communications', 'Price lists', 'Attachments'] as const;
	let activeTab = $state<(typeof tabs)[number]>('Profile');

	const profile = $derived(data.profile);
	const onHold = $derived(Boolean(data.profile?.creditHoldFlag));

	const inputClass =
		'w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]';
	const labelClass = 'space-y-1 text-sm';
	const taxCodes = ['', 'SR', 'ZR', 'ES', 'OP'];
</script>

<PageShell eyebrow="Sales & CRM" title={data.customer.name} description="Customer master record.">
	<SalesSubNav />

	{#if onHold}
		<div class="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
			<span class="font-semibold">On credit hold.</span>
			{data.profile?.creditHoldReason ?? 'New sales orders will be flagged and shipments blocked.'}
		</div>
	{/if}

	<div class="mb-5 flex flex-wrap gap-2">
		{#each tabs as t}
			<button
				type="button"
				class={activeTab === t
					? 'rounded-full bg-[var(--sf-green)] px-4 py-1.5 text-sm font-medium text-white'
					: 'rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50'}
				onclick={() => (activeTab = t)}
			>
				{t}
			</button>
		{/each}
		<a class="ml-auto rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50" href="/sales-crm/customers">
			Back to list
		</a>
	</div>

	{#if activeTab === 'Profile'}
		<form method="POST" action="?/updateCustomer" use:enhance class="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="grid gap-4 md:grid-cols-2">
				<label class={labelClass}><span class="text-slate-700">Company name</span>
					<input name="name" required value={data.customer.name} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Contact</span>
					<input name="contact" value={data.customer.contact ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">GST registration no.</span>
					<input name="gstRegNo" value={data.customer.gstRegNo ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">GST status</span>
					<select name="gstRegistrationStatus" value={profile?.gstRegistrationStatus ?? 'unknown'} class={inputClass}>
						<option value="registered">Registered</option>
						<option value="not_registered">Not registered</option>
						<option value="exempt">Exempt</option>
						<option value="unknown">Unknown</option>
					</select></label>
				<label class={labelClass}><span class="text-slate-700">Business registration no.</span>
					<input name="registrationNo" value={data.customer.registrationNo ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Default tax code</span>
					<select name="taxCode" value={profile?.taxCode ?? ''} class={inputClass}>
						{#each taxCodes as tc}<option value={tc}>{tc || '—'}</option>{/each}
					</select></label>
				<label class={labelClass}><span class="text-slate-700">Billing address</span>
					<textarea name="billingAddress" rows="2" class={inputClass}>{profile?.billingAddress ?? data.customer.address ?? ''}</textarea></label>
				<label class={labelClass}><span class="text-slate-700">Shipping address</span>
					<textarea name="shippingAddress" rows="2" class={inputClass}>{profile?.shippingAddress ?? ''}</textarea></label>
				<input type="hidden" name="address" value={data.customer.address ?? ''} />
				<label class={labelClass}><span class="text-slate-700">Credit terms</span>
					<input name="creditTerms" value={profile?.creditTerms ?? ''} placeholder="e.g. Net 30" class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Billing terms</span>
					<input name="billingTerms" value={profile?.billingTerms ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Credit limit</span>
					<input name="creditLimit" type="number" step="0.01" min="0" value={profile?.creditLimit ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Customer tier</span>
					<input name="customerTier" value={profile?.customerTier ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Currency</span>
					<input name="currency" value={data.customer.currency ?? 'SGD'} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Preferred currency</span>
					<input name="preferredCurrency" value={profile?.preferredCurrency ?? 'SGD'} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Country</span>
					<input name="country" value={data.customer.country ?? ''} class={inputClass} /></label>
				<label class={labelClass}><span class="text-slate-700">Customer status</span>
					<select name="customerStatus" value={profile?.customerStatus ?? 'active'} class={inputClass}>
						<option value="active">Active</option>
						<option value="on_hold">On hold</option>
						<option value="blacklisted">Blacklisted</option>
					</select></label>
			</div>
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Save changes</button>
		</form>

		<div class="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<h3 class="mb-2 text-sm font-semibold text-slate-800">Credit hold</h3>
			<form method="POST" action="?/setCreditHold" use:enhance class="flex flex-wrap items-end gap-3">
				<input type="hidden" name="hold" value={onHold ? 'false' : 'true'} />
				{#if !onHold}
					<label class="flex-1 {labelClass}"><span class="text-slate-700">Reason</span>
						<input name="reason" placeholder="Why is this customer being put on hold?" class={inputClass} /></label>
					<button class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700" type="submit">Place on credit hold</button>
				{:else}
					<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Release credit hold</button>
				{/if}
			</form>
		</div>
	{/if}

	{#if activeTab === 'Contacts'}
		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<form method="POST" action="?/addContact" use:enhance class="mb-5 grid gap-3 md:grid-cols-4">
				<input name="name" required placeholder="Name" class={inputClass} />
				<input name="phoneEmail" placeholder="Phone / email" class={inputClass} />
				<input name="position" placeholder="Position" class={inputClass} />
				<div class="flex items-center gap-3">
					<label class="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" name="isPrimary" /> Primary</label>
					<button class="rounded-md bg-[var(--sf-green)] px-3 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Add</button>
				</div>
			</form>
			{#if data.contacts.length === 0}
				<p class="text-sm text-slate-500">No contacts yet.</p>
			{:else}
				<ul class="divide-y divide-slate-100">
					{#each data.contacts as c}
						<li class="flex items-center justify-between py-3 text-sm">
							<div>
								<span class="font-medium text-slate-900">{c.name}</span>
								{#if c.isPrimary}<span class="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Primary</span>{/if}
								<div class="text-slate-500">{c.position ?? ''} {c.phoneEmail ? `· ${c.phoneEmail}` : ''}</div>
							</div>
							<form method="POST" action="?/deleteContact" use:enhance>
								<input type="hidden" name="id" value={c.id} />
								<button class="text-xs text-red-500 hover:text-red-700" type="submit">Remove</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'Communications'}
		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<form method="POST" action="?/logCommunication" use:enhance class="mb-5 grid gap-3 md:grid-cols-2">
				<select name="channel" class={inputClass}>
					<option value="note">Note</option>
					<option value="call">Call</option>
					<option value="email">Email</option>
					<option value="meeting">Meeting</option>
					<option value="other">Other</option>
				</select>
				<input name="occurredAt" type="date" class={inputClass} />
				<input name="subject" required placeholder="Subject" class="{inputClass} md:col-span-2" />
				<textarea name="body" rows="2" placeholder="Details" class="{inputClass} md:col-span-2"></textarea>
				<input name="contactName" placeholder="Contact name (optional)" class={inputClass} />
				<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Log communication</button>
			</form>
			{#if data.communications.length === 0}
				<p class="text-sm text-slate-500">No communication logged yet.</p>
			{:else}
				<ul class="space-y-3">
					{#each data.communications as m}
						<li class="rounded-lg border border-slate-100 p-3 text-sm">
							<div class="flex items-center justify-between">
								<span class="font-medium text-slate-900">{m.subject}</span>
								<span class="text-xs uppercase tracking-wide text-slate-400">{m.channel} · {m.occurredAt}</span>
							</div>
							{#if m.body}<p class="mt-1 text-slate-600">{m.body}</p>{/if}
							{#if m.contactName}<p class="mt-1 text-xs text-slate-400">with {m.contactName}</p>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if activeTab === 'Price lists'}
		<div class="space-y-4">
			<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
				<h3 class="mb-3 text-sm font-semibold text-slate-800">New price list</h3>
				<form method="POST" action="?/createPriceList" use:enhance class="grid gap-3 md:grid-cols-4">
					<input name="name" required placeholder="List name" class="{inputClass} md:col-span-2" />
					<input name="currency" value="SGD" class={inputClass} />
					<input name="validFrom" type="date" class={inputClass} />
					<input name="validTo" type="date" class={inputClass} />
					<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">Create</button>
				</form>
			</div>
			{#each data.priceLists as list}
				<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<span class="font-medium text-slate-900">{list.name}</span>
							<span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{list.status}</span>
							{#if list.partnerId === null}<span class="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">Group / global</span>{/if}
						</div>
						<form method="POST" action="?/deletePriceList" use:enhance>
							<input type="hidden" name="id" value={list.id} />
							<button class="text-xs text-red-500 hover:text-red-700" type="submit">Delete list</button>
						</form>
					</div>
					<table class="mb-3 min-w-full text-sm">
						<thead class="text-left text-xs uppercase text-slate-400">
							<tr><th class="py-1">Item</th><th>UoM</th><th>Unit price</th><th>Min qty</th><th>Disc %</th><th></th></tr>
						</thead>
						<tbody class="divide-y divide-slate-100">
							{#each list.items as it}
								<tr>
									<td class="py-1 text-slate-700">{it.description}</td>
									<td class="text-slate-500">{it.uom}</td>
									<td class="text-slate-700">{it.unitPrice}</td>
									<td class="text-slate-500">{it.minQuantity}</td>
									<td class="text-slate-500">{it.discountPct}</td>
									<td class="text-right">
										<form method="POST" action="?/deletePriceListItem" use:enhance>
											<input type="hidden" name="id" value={it.id} />
											<button class="text-xs text-red-500 hover:text-red-700" type="submit">×</button>
										</form>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<form method="POST" action="?/addPriceListItem" use:enhance class="grid gap-2 md:grid-cols-6">
						<input type="hidden" name="priceListId" value={list.id} />
						<input name="description" required placeholder="Item / description" class="{inputClass} md:col-span-2" />
						<input name="uom" value="unit" class={inputClass} />
						<input name="unitPrice" type="number" step="0.01" placeholder="Price" class={inputClass} />
						<input name="minQuantity" type="number" step="0.01" placeholder="Min qty" class={inputClass} />
						<input name="discountPct" type="number" step="0.01" placeholder="Disc %" class={inputClass} />
						<button class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 md:col-span-6" type="submit">Add item</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}

	{#if activeTab === 'Attachments'}
		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<form method="POST" action="?/addAttachment" use:enhance class="mb-5 grid gap-3 md:grid-cols-3">
				<select name="attachmentType" class={inputClass}>
					<option value="contract">Contract</option>
					<option value="agreement">Agreement</option>
					<option value="price_agreement">Price agreement</option>
					<option value="nda">NDA</option>
					<option value="other">Other</option>
				</select>
				<input name="title" required placeholder="Title" class="{inputClass} md:col-span-2" />
				<input name="fileName" placeholder="File name" class={inputClass} />
				<input name="fileUrl" placeholder="File URL / R2 key" class={inputClass} />
				<input name="expiryDate" type="date" class={inputClass} />
				<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c] md:col-span-3" type="submit">Add attachment</button>
			</form>
			{#if data.attachments.length === 0}
				<p class="text-sm text-slate-500">No attachments yet.</p>
			{:else}
				<ul class="divide-y divide-slate-100">
					{#each data.attachments as a}
						<li class="flex items-center justify-between py-3 text-sm">
							<div>
								<span class="font-medium text-slate-900">{a.title}</span>
								<span class="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{a.attachmentType}</span>
								<div class="text-slate-500">{a.fileName ?? ''} {a.expiryDate ? `· expires ${a.expiryDate}` : ''}</div>
							</div>
							<form method="POST" action="?/deleteAttachment" use:enhance>
								<input type="hidden" name="id" value={a.id} />
								<button class="text-xs text-red-500 hover:text-red-700" type="submit">Remove</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</PageShell>
