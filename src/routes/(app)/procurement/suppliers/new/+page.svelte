<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { form } = $props();
	let contacts = $state([{ id: crypto.randomUUID() }]);
	let complianceRecords = $state([{ id: crypto.randomUUID() }]);
	let attachments = $state([{ id: crypto.randomUUID() }]);

	function addContact() {
		contacts = [...contacts, { id: crypto.randomUUID() }];
	}

	function removeContact(id: string) {
		contacts = contacts.filter((c) => c.id !== id);
	}

	function addComplianceRecord() {
		complianceRecords = [...complianceRecords, { id: crypto.randomUUID() }];
	}

	function removeComplianceRecord(id: string) {
		complianceRecords = complianceRecords.filter((record) => record.id !== id);
	}

	function addAttachment() {
		attachments = [...attachments, { id: crypto.randomUUID() }];
	}

	function removeAttachment(id: string) {
		attachments = attachments.filter((attachment) => attachment.id !== id);
	}
</script>

<PageShell
	eyebrow="Procurement"
	title="New supplier"
	description="Creates a supplier record for purchase orders, incoming invoices, and vendor-facing documents."
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
					placeholder="e.g. Acme Supplies Pte Ltd"
				/>
			</label>

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Registered / remit-to address</span>
				<textarea
					name="address"
					rows="3"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Vendor address or pay-to line"
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

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Item Description</span>
				<input
					name="itemDescription"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="e.g. Motor, Encoder, CNC machine parts"
				/>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Date Create</span>
				<input
					name="dateCreate"
					type="date"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
				/>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Project Related</span>
				<input
					name="projectRelated"
					class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
					placeholder="Project name / code / remarks"
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

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Supplier type</span>
				<select name="supplierType" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="corporate_local">Corporate (Local)</option>
					<option value="corporate_international">Corporate (International)</option>
					<option value="individual">Individual</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Supplier status</span>
				<select name="supplierStatus" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="approved">Approved</option>
					<option value="preferred">Preferred</option>
					<option value="on_hold">On Hold</option>
					<option value="blacklisted">Blacklisted</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">ACRA UEN</span>
				<input name="acraUen" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" placeholder="e.g. 202012345A" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Business registration no.</span>
				<input name="businessRegistrationNo" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">GST registration status</span>
				<select name="gstRegistrationStatus" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="unknown">Unknown</option>
					<option value="registered">Registered</option>
					<option value="not_registered">Not registered</option>
					<option value="exempt">Exempt</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Tax code</span>
				<select name="taxCode" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="">Select tax code</option>
					<option value="SR">SR</option>
					<option value="ZR">ZR</option>
					<option value="ES">ES</option>
					<option value="OP">OP</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Billing address</span>
				<textarea name="billingAddress" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"></textarea>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Shipping address</span>
				<textarea name="shippingAddress" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"></textarea>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Bank name</span>
				<input name="bankName" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Bank account no.</span>
				<input name="bankAccountNo" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">SWIFT code</span>
				<input name="swiftCode" class="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Preferred currency</span>
				<input name="preferredCurrency" value="SGD" class="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Credit terms</span>
				<input name="creditTerms" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" placeholder="e.g. Credit limit 30,000" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Payment terms</span>
				<input name="paymentTerms" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" placeholder="e.g. Net 30" />
			</label>

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Supplier category</span>
				<input name="supplierCategory" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" placeholder="Materials, subcontractor, logistics..." />
			</label>
		</div>

		<div class="space-y-3 rounded-lg border border-slate-200 p-4">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-slate-800">Supplier Contacts (sub-table)</p>
				<button
					type="button"
					class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
					onclick={addContact}
				>
					Add contact
				</button>
			</div>

			{#each contacts as c}
				<div class="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-5">
					<label class="space-y-1 text-xs md:col-span-1">
						<span class="text-slate-600">Name</span>
						<input
							name="contactName"
							class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
							placeholder="Contact person"
						/>
					</label>
					<label class="space-y-1 text-xs md:col-span-1">
						<span class="text-slate-600">Phone / Email</span>
						<input
							name="contactPhoneEmail"
							class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
							placeholder="+65 ... / user@..."
						/>
					</label>
					<label class="space-y-1 text-xs md:col-span-1">
						<span class="text-slate-600">WeChat</span>
						<input
							name="contactWechat"
							class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
							placeholder="wechat id"
						/>
					</label>
					<label class="space-y-1 text-xs md:col-span-1">
						<span class="text-slate-600">Position</span>
						<input
							name="contactPosition"
							class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]"
							placeholder="Purchaser / Manager..."
						/>
					</label>
					<div class="flex items-end justify-end md:col-span-1">
						<button
							type="button"
							class="rounded border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40"
							disabled={contacts.length <= 1}
							onclick={() => removeContact(c.id)}
						>
							Remove
						</button>
					</div>
				</div>
			{/each}
		</div>

		<div class="space-y-3 rounded-lg border border-slate-200 p-4">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-slate-800">Legal compliance records</p>
				<button type="button" class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onclick={addComplianceRecord}>
					Add record
				</button>
			</div>

			{#each complianceRecords as record}
				<div class="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-4">
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Type</span>
						<select name="complianceRecordType" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
							<option value="licence">Licence</option>
							<option value="permit">Permit</option>
							<option value="insurance">Insurance</option>
							<option value="certificate">Certificate</option>
							<option value="other">Other</option>
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Title</span>
						<input name="complianceTitle" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Issuer</span>
						<input name="complianceIssuer" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Reference no.</span>
						<input name="complianceReferenceNo" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Issue date</span>
						<input name="complianceIssueDate" type="date" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Expiry date</span>
						<input name="complianceExpiryDate" type="date" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Status</span>
						<select name="complianceStatus" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
							<option value="pending_review">Pending review</option>
							<option value="valid">Valid</option>
							<option value="expiring">Expiring</option>
							<option value="expired">Expired</option>
						</select>
					</label>
					<div class="flex items-end justify-end">
						<button type="button" class="rounded border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40" disabled={complianceRecords.length <= 1} onclick={() => removeComplianceRecord(record.id)}>
							Remove
						</button>
					</div>
					<label class="space-y-1 text-xs md:col-span-4">
						<span class="text-slate-600">Notes</span>
						<input name="complianceNotes" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
				</div>
			{/each}
		</div>

		<div class="space-y-3 rounded-lg border border-slate-200 p-4">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-slate-800">Attachments</p>
				<button type="button" class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onclick={addAttachment}>
					Add attachment
				</button>
			</div>

			{#each attachments as attachment}
				<div class="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-4">
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Type</span>
						<select name="attachmentType" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
							<option value="contract">Contract</option>
							<option value="mou">MOU</option>
							<option value="nda">NDA</option>
							<option value="certificate">Certificate</option>
							<option value="licence">Licence</option>
							<option value="permit">Permit</option>
							<option value="insurance">Insurance</option>
							<option value="other">Other</option>
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Title</span>
						<input name="attachmentTitle" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">File name</span>
						<input name="attachmentFileName" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Expiry date</span>
						<input name="attachmentExpiryDate" type="date" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs md:col-span-2">
						<span class="text-slate-600">File URL</span>
						<input name="attachmentFileUrl" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Notes</span>
						<input name="attachmentNotes" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<div class="flex items-end justify-end">
						<button type="button" class="rounded border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-40" disabled={attachments.length <= 1} onclick={() => removeAttachment(attachment.id)}>
							Remove
						</button>
					</div>
				</div>
			{/each}
		</div>

		<div class="flex flex-wrap gap-3">
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
				Save supplier
			</button>
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/procurement/suppliers">
				Back to list
			</a>
		</div>
	</form>
</PageShell>


