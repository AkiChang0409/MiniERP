<script lang="ts">
	import PageShell from '$app-layer/components/PageShell.svelte';

	let { data, form } = $props();
	type ContactDraft = {
		_key: string;
		name: string;
		phoneEmail: string;
		wechat: string;
		position: string;
	};
	type ComplianceDraft = {
		_key: string;
		recordType: string;
		title: string;
		issuer: string;
		referenceNo: string;
		issueDate: string;
		expiryDate: string;
		status: string;
		notes: string;
	};
	type AttachmentDraft = {
		_key: string;
		attachmentType: string;
		title: string;
		fileName: string;
		fileUrl: string;
		expiryDate: string;
		notes: string;
	};
	const toDraft = (c?: Partial<ContactDraft>): ContactDraft => ({
		_key: c?._key ?? crypto.randomUUID(),
		name: c?.name ?? '',
		phoneEmail: c?.phoneEmail ?? '',
		wechat: c?.wechat ?? '',
		position: c?.position ?? ''
	});
	const toComplianceDraft = (record?: Partial<ComplianceDraft>): ComplianceDraft => ({
		_key: record?._key ?? crypto.randomUUID(),
		recordType: record?.recordType ?? 'licence',
		title: record?.title ?? '',
		issuer: record?.issuer ?? '',
		referenceNo: record?.referenceNo ?? '',
		issueDate: record?.issueDate ?? '',
		expiryDate: record?.expiryDate ?? '',
		status: record?.status ?? 'pending_review',
		notes: record?.notes ?? ''
	});
	const toAttachmentDraft = (attachment?: Partial<AttachmentDraft>): AttachmentDraft => ({
		_key: attachment?._key ?? crypto.randomUUID(),
		attachmentType: attachment?.attachmentType ?? 'contract',
		title: attachment?.title ?? '',
		fileName: attachment?.fileName ?? '',
		fileUrl: attachment?.fileUrl ?? '',
		expiryDate: attachment?.expiryDate ?? '',
		notes: attachment?.notes ?? ''
	});
	const profile = $derived(data.profile);
	const scorecard = $derived(data.scorecard);
	const latestEvaluation = $derived(scorecard.latest);
	const trendRows = $derived(scorecard.trend.slice(-6).reverse());

	function formatScore(value: number | null | undefined) {
		return value == null ? '-' : value.toFixed(1);
	}

	function ratingLabel(rating: string | null | undefined) {
		if (rating === 'not_approved') return 'Not Approved';
		return rating ? rating[0].toUpperCase() + rating.slice(1) : 'Not Approved';
	}

	function ratingClass(rating: string | null | undefined) {
		if (rating === 'gold') return 'bg-amber-100 text-amber-800 border-amber-200';
		if (rating === 'silver') return 'bg-slate-100 text-slate-700 border-slate-200';
		if (rating === 'bronze') return 'bg-orange-100 text-orange-800 border-orange-200';
		return 'bg-rose-100 text-rose-800 border-rose-200';
	}

	function initialContacts() {
		return data.contacts.length > 0
			? data.contacts.map((c) =>
					toDraft({
						_key: c.id,
						name: c.name,
						phoneEmail: c.phoneEmail ?? '',
						wechat: c.wechat ?? '',
						position: c.position ?? ''
					})
				)
			: [toDraft()];
	}

	function initialComplianceRecords() {
		return data.complianceRecords.length > 0
			? data.complianceRecords.map((record) =>
					toComplianceDraft({
						_key: record.id,
						recordType: record.recordType,
						title: record.title,
						issuer: record.issuer ?? '',
						referenceNo: record.referenceNo ?? '',
						issueDate: record.issueDate ?? '',
						expiryDate: record.expiryDate ?? '',
						status: record.status,
						notes: record.notes ?? ''
					})
				)
			: [toComplianceDraft()];
	}

	function initialAttachments() {
		return data.attachments.length > 0
			? data.attachments.map((attachment) =>
					toAttachmentDraft({
						_key: attachment.id,
						attachmentType: attachment.attachmentType,
						title: attachment.title,
						fileName: attachment.fileName ?? '',
						fileUrl: attachment.fileUrl ?? '',
						expiryDate: attachment.expiryDate ?? '',
						notes: attachment.notes ?? ''
					})
				)
			: [toAttachmentDraft()];
	}

	let contacts = $state<ContactDraft[]>(initialContacts());
	let complianceRecords = $state<ComplianceDraft[]>(initialComplianceRecords());
	let attachments = $state<AttachmentDraft[]>(initialAttachments());

	function addContact() {
		contacts = [...contacts, toDraft()];
	}

	function removeContact(k: string) {
		contacts = contacts.filter((c) => c._key !== k);
		if (contacts.length === 0) addContact();
	}

	function addComplianceRecord() {
		complianceRecords = [...complianceRecords, toComplianceDraft()];
	}

	function removeComplianceRecord(k: string) {
		complianceRecords = complianceRecords.filter((record) => record._key !== k);
		if (complianceRecords.length === 0) addComplianceRecord();
	}

	function addAttachment() {
		attachments = [...attachments, toAttachmentDraft()];
	}

	function removeAttachment(k: string) {
		attachments = attachments.filter((attachment) => attachment._key !== k);
		if (attachments.length === 0) addAttachment();
	}
</script>

<PageShell
	eyebrow="Procurement"
	title={`Supplier: ${data.supplier.name}`}
	description="Supplier master profile with contacts (supply chain initial data entry)."
>
	<div class="mb-4 flex gap-2">
		<a class="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/procurement/suppliers">
			Back to suppliers
		</a>
	</div>

	<section class="mb-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
		<div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="text-xs font-medium uppercase tracking-wide text-slate-500">Supplier scorecard</p>
					<h2 class="mt-1 text-lg font-semibold text-slate-900">
						{#if latestEvaluation}
							{formatScore(latestEvaluation.overallScore)} / 100
						{:else}
							No evaluation yet
						{/if}
					</h2>
					<p class="mt-1 text-sm text-slate-500">
						{latestEvaluation?.evaluationDate ?? 'Create the first scorecard from ISO 9001-aligned criteria.'}
					</p>
				</div>
				<span class={`rounded-full border px-3 py-1 text-xs font-semibold ${ratingClass(latestEvaluation?.overallRating)}`}>
					{ratingLabel(latestEvaluation?.overallRating)}
				</span>
			</div>

			{#if latestEvaluation}
				<div class="mt-5 grid gap-3 sm:grid-cols-2">
					<div class="rounded-lg border border-slate-100 p-3">
						<p class="text-xs text-slate-500">Quality</p>
						<p class="text-lg font-semibold text-slate-900">{formatScore(latestEvaluation.qualityScore)}</p>
					</div>
					<div class="rounded-lg border border-slate-100 p-3">
						<p class="text-xs text-slate-500">Delivery</p>
						<p class="text-lg font-semibold text-slate-900">{formatScore(latestEvaluation.deliveryScore)}</p>
					</div>
					<div class="rounded-lg border border-slate-100 p-3">
						<p class="text-xs text-slate-500">Price</p>
						<p class="text-lg font-semibold text-slate-900">{formatScore(latestEvaluation.priceScore)}</p>
					</div>
					<div class="rounded-lg border border-slate-100 p-3">
						<p class="text-xs text-slate-500">Service</p>
						<p class="text-lg font-semibold text-slate-900">{formatScore(latestEvaluation.serviceScore)}</p>
					</div>
					<div class="rounded-lg border border-slate-100 p-3">
						<p class="text-xs text-slate-500">Compliance</p>
						<p class="text-lg font-semibold text-slate-900">{formatScore(latestEvaluation.complianceScore)}</p>
					</div>
					<div class="rounded-lg border border-slate-100 p-3">
						<p class="text-xs text-slate-500">Financial / Sustainability</p>
						<p class="text-lg font-semibold text-slate-900">
							{formatScore(latestEvaluation.financialStabilityScore)} / {formatScore(latestEvaluation.sustainabilityScore)}
						</p>
					</div>
				</div>
			{/if}

			<div class="mt-5 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th class="py-2 pr-3">Date</th>
							<th class="py-2 pr-3">Score</th>
							<th class="py-2 pr-3">Delta</th>
							<th class="py-2 pr-3">Rating</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100">
						{#if trendRows.length === 0}
							<tr>
								<td colspan="4" class="py-4 text-slate-500">No trend data.</td>
							</tr>
						{:else}
							{#each trendRows as row}
								<tr>
									<td class="py-2 pr-3 text-slate-600">{row.evaluationDate}</td>
									<td class="py-2 pr-3 font-medium text-slate-900">{formatScore(row.overallScore)}</td>
									<td class={`py-2 pr-3 ${row.scoreDelta && row.scoreDelta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
										{row.scoreDelta == null ? '-' : `${row.scoreDelta > 0 ? '+' : ''}${formatScore(row.scoreDelta)}`}
									</td>
									<td class="py-2 pr-3 text-slate-600">{ratingLabel(row.overallRating)}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<form class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" method="POST" action="?/evaluate">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p class="text-xs font-medium uppercase tracking-wide text-slate-500">New evaluation</p>
					<h2 class="mt-1 text-lg font-semibold text-slate-900">Weighted supplier assessment</h2>
				</div>
				<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
					Generate scorecard
				</button>
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-3">
				<label class="space-y-1 text-sm">
					<span class="text-slate-700">Evaluation date</span>
					<input name="evaluationDate" type="date" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-sm md:col-span-2">
					<span class="text-slate-700">Category / sourcing group</span>
					<input name="evaluationCategory" value={profile?.supplierCategory ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" placeholder="Packaging, logistics, subcontractor..." />
				</label>
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-4">
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Defect rate %</span>
					<input name="defectRate" type="number" min="0" step="0.1" value={latestEvaluation?.defectRate ?? 0} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Return rate %</span>
					<input name="returnRate" type="number" min="0" step="0.1" value={latestEvaluation?.returnRate ?? 0} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">On-time delivery %</span>
					<input name="onTimeDeliveryPct" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.onTimeDeliveryPct ?? 90} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Lead time reliability</span>
					<input name="leadTimeReliabilityScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.leadTimeReliabilityScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Price competitiveness</span>
					<input name="priceCompetitivenessScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.priceCompetitivenessScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Payment terms</span>
					<input name="paymentTermsScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.paymentTermsScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Responsiveness</span>
					<input name="responsivenessScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.responsivenessScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">After-sales support</span>
					<input name="afterSalesSupportScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.afterSalesSupportScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">ISO / HACCP certificates</span>
					<input name="certificationScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.certificationScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Credit check</span>
					<input name="creditCheckScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.creditCheckScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs md:col-span-2">
					<span class="text-slate-600">Environmental compliance</span>
					<input name="environmentalComplianceScore" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.environmentalComplianceScore ?? 80} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-7">
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Quality wgt</span>
					<input name="qualityWeight" type="number" min="0" step="0.1" value={latestEvaluation?.qualityWeight ?? 20} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Delivery wgt</span>
					<input name="deliveryWeight" type="number" min="0" step="0.1" value={latestEvaluation?.deliveryWeight ?? 20} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Price wgt</span>
					<input name="priceWeight" type="number" min="0" step="0.1" value={latestEvaluation?.priceWeight ?? 15} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Service wgt</span>
					<input name="serviceWeight" type="number" min="0" step="0.1" value={latestEvaluation?.serviceWeight ?? 15} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Compliance wgt</span>
					<input name="complianceWeight" type="number" min="0" step="0.1" value={latestEvaluation?.complianceWeight ?? 15} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Finance wgt</span>
					<input name="financialStabilityWeight" type="number" min="0" step="0.1" value={latestEvaluation?.financialStabilityWeight ?? 10} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Sustain wgt</span>
					<input name="sustainabilityWeight" type="number" min="0" step="0.1" value={latestEvaluation?.sustainabilityWeight ?? 5} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
			</div>

			<div class="mt-4 grid gap-3 md:grid-cols-3">
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Gold threshold</span>
					<input name="goldThreshold" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.goldThreshold ?? 85} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Silver threshold</span>
					<input name="silverThreshold" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.silverThreshold ?? 70} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-xs">
					<span class="text-slate-600">Bronze threshold</span>
					<input name="bronzeThreshold" type="number" min="0" max="100" step="0.1" value={latestEvaluation?.bronzeThreshold ?? 55} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
				</label>
				<label class="space-y-1 text-sm md:col-span-3">
					<span class="text-slate-700">Evaluation notes</span>
					<textarea name="evaluationNotes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]"></textarea>
				</label>
			</div>
		</form>
	</section>

	<form class="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm" method="POST" action="?/update">
		{#if form?.message}
			<p class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{form.message}</p>
		{/if}

		<div class="grid gap-4 md:grid-cols-2">
			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Legal / display name</span>
				<input name="name" required value={data.supplier.name} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Registered / remit-to address</span>
				<textarea name="address" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">{data.supplier.address ?? ''}</textarea>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Main Contact</span>
				<input name="contact" value={data.supplier.contact ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">GST registration no.</span>
				<input name="gstRegNo" value={data.supplier.gstRegNo ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Item Description</span>
				<input name="itemDescription" value={data.supplier.itemDescription ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Date Create</span>
				<input type="date" name="dateCreate" value={data.supplier.dateCreate ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Project Related</span>
				<input name="projectRelated" value={data.supplier.projectRelated ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Supplier type</span>
				<select name="supplierType" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="corporate_local" selected={(profile?.supplierType ?? 'corporate_local') === 'corporate_local'}>Corporate (Local)</option>
					<option value="corporate_international" selected={profile?.supplierType === 'corporate_international'}>Corporate (International)</option>
					<option value="individual" selected={profile?.supplierType === 'individual'}>Individual</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Supplier status</span>
				<select name="supplierStatus" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="approved" selected={(profile?.supplierStatus ?? 'approved') === 'approved'}>Approved</option>
					<option value="preferred" selected={profile?.supplierStatus === 'preferred'}>Preferred</option>
					<option value="on_hold" selected={profile?.supplierStatus === 'on_hold'}>On Hold</option>
					<option value="blacklisted" selected={profile?.supplierStatus === 'blacklisted'}>Blacklisted</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">ACRA UEN</span>
				<input name="acraUen" value={profile?.acraUen ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Business registration no.</span>
				<input name="businessRegistrationNo" value={profile?.businessRegistrationNo ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">GST registration status</span>
				<select name="gstRegistrationStatus" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="unknown" selected={(profile?.gstRegistrationStatus ?? 'unknown') === 'unknown'}>Unknown</option>
					<option value="registered" selected={profile?.gstRegistrationStatus === 'registered'}>Registered</option>
					<option value="not_registered" selected={profile?.gstRegistrationStatus === 'not_registered'}>Not registered</option>
					<option value="exempt" selected={profile?.gstRegistrationStatus === 'exempt'}>Exempt</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Tax code</span>
				<select name="taxCode" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
					<option value="" selected={!profile?.taxCode}>Select tax code</option>
					<option value="SR" selected={profile?.taxCode === 'SR'}>SR</option>
					<option value="ZR" selected={profile?.taxCode === 'ZR'}>ZR</option>
					<option value="ES" selected={profile?.taxCode === 'ES'}>ES</option>
					<option value="OP" selected={profile?.taxCode === 'OP'}>OP</option>
				</select>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Billing address</span>
				<textarea name="billingAddress" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">{profile?.billingAddress ?? ''}</textarea>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Shipping address</span>
				<textarea name="shippingAddress" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]">{profile?.shippingAddress ?? ''}</textarea>
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Bank name</span>
				<input name="bankName" value={profile?.bankName ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Bank account no.</span>
				<input name="bankAccountNo" value={profile?.bankAccountNo ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">SWIFT code</span>
				<input name="swiftCode" value={profile?.swiftCode ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Preferred currency</span>
				<input name="preferredCurrency" value={profile?.preferredCurrency ?? data.supplier.currency ?? 'SGD'} class="w-full rounded-md border border-slate-300 px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Credit terms</span>
				<input name="creditTerms" value={profile?.creditTerms ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm">
				<span class="text-slate-700">Payment terms</span>
				<input name="paymentTerms" value={profile?.paymentTerms ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>

			<label class="space-y-1 text-sm md:col-span-2">
				<span class="text-slate-700">Supplier category</span>
				<input name="supplierCategory" value={profile?.supplierCategory ?? ''} class="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
			</label>
		</div>

		<div class="space-y-3 rounded-lg border border-slate-200 p-4">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-slate-800">Supplier Contacts</p>
				<button type="button" class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onclick={addContact}>Add contact</button>
			</div>
			{#each contacts as c}
				<div class="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-5">
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Name</span>
						<input name="contactName" value={c.name ?? ''} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Phone / Email</span>
						<input name="contactPhoneEmail" value={c.phoneEmail ?? ''} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">WeChat</span>
						<input name="contactWechat" value={c.wechat ?? ''} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Position</span>
						<input name="contactPosition" value={c.position ?? ''} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<div class="flex items-end justify-end">
						<button type="button" class="rounded border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50" onclick={() => removeContact(c._key)}>
							Remove
						</button>
					</div>
				</div>
			{/each}
		</div>

		<div class="space-y-3 rounded-lg border border-slate-200 p-4">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-slate-800">Legal compliance records</p>
				<button type="button" class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onclick={addComplianceRecord}>Add record</button>
			</div>
			{#each complianceRecords as record}
				<div class="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-4">
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Type</span>
						<select name="complianceRecordType" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
							<option value="licence" selected={record.recordType === 'licence'}>Licence</option>
							<option value="permit" selected={record.recordType === 'permit'}>Permit</option>
							<option value="insurance" selected={record.recordType === 'insurance'}>Insurance</option>
							<option value="certificate" selected={record.recordType === 'certificate'}>Certificate</option>
							<option value="other" selected={record.recordType === 'other'}>Other</option>
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Title</span>
						<input name="complianceTitle" value={record.title} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Issuer</span>
						<input name="complianceIssuer" value={record.issuer} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Reference no.</span>
						<input name="complianceReferenceNo" value={record.referenceNo} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Issue date</span>
						<input name="complianceIssueDate" type="date" value={record.issueDate} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Expiry date</span>
						<input name="complianceExpiryDate" type="date" value={record.expiryDate} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Status</span>
						<select name="complianceStatus" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
							<option value="pending_review" selected={record.status === 'pending_review'}>Pending review</option>
							<option value="valid" selected={record.status === 'valid'}>Valid</option>
							<option value="expiring" selected={record.status === 'expiring'}>Expiring</option>
							<option value="expired" selected={record.status === 'expired'}>Expired</option>
						</select>
					</label>
					<div class="flex items-end justify-end">
						<button type="button" class="rounded border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50" onclick={() => removeComplianceRecord(record._key)}>
							Remove
						</button>
					</div>
					<label class="space-y-1 text-xs md:col-span-4">
						<span class="text-slate-600">Notes</span>
						<input name="complianceNotes" value={record.notes} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
				</div>
			{/each}
		</div>

		<div class="space-y-3 rounded-lg border border-slate-200 p-4">
			<div class="flex items-center justify-between">
				<p class="text-sm font-medium text-slate-800">Attachments</p>
				<button type="button" class="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50" onclick={addAttachment}>Add attachment</button>
			</div>
			{#each attachments as attachment}
				<div class="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-4">
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Type</span>
						<select name="attachmentType" class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]">
							<option value="contract" selected={attachment.attachmentType === 'contract'}>Contract</option>
							<option value="mou" selected={attachment.attachmentType === 'mou'}>MOU</option>
							<option value="nda" selected={attachment.attachmentType === 'nda'}>NDA</option>
							<option value="certificate" selected={attachment.attachmentType === 'certificate'}>Certificate</option>
							<option value="licence" selected={attachment.attachmentType === 'licence'}>Licence</option>
							<option value="permit" selected={attachment.attachmentType === 'permit'}>Permit</option>
							<option value="insurance" selected={attachment.attachmentType === 'insurance'}>Insurance</option>
							<option value="other" selected={attachment.attachmentType === 'other'}>Other</option>
						</select>
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Title</span>
						<input name="attachmentTitle" value={attachment.title} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">File name</span>
						<input name="attachmentFileName" value={attachment.fileName} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Expiry date</span>
						<input name="attachmentExpiryDate" type="date" value={attachment.expiryDate} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs md:col-span-2">
						<span class="text-slate-600">File URL</span>
						<input name="attachmentFileUrl" value={attachment.fileUrl} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<label class="space-y-1 text-xs">
						<span class="text-slate-600">Notes</span>
						<input name="attachmentNotes" value={attachment.notes} class="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--sf-green)]" />
					</label>
					<div class="flex items-end justify-end">
						<button type="button" class="rounded border border-rose-200 px-2.5 py-2 text-xs text-rose-700 hover:bg-rose-50" onclick={() => removeAttachment(attachment._key)}>
							Remove
						</button>
					</div>
				</div>
			{/each}
		</div>

		<div class="flex gap-2">
			<button class="rounded-md bg-[var(--sf-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f5e2c]" type="submit">
				Save changes
			</button>
			<a class="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" href="/procurement/suppliers">
				Cancel
			</a>
		</div>
	</form>
</PageShell>



