import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { createModuleContext } from '$platform/modules';

const supplierTypes = ['individual', 'corporate_local', 'corporate_international'] as const;
const supplierStatuses = ['approved', 'preferred', 'on_hold', 'blacklisted'] as const;
const gstStatuses = ['registered', 'not_registered', 'exempt', 'unknown'] as const;
const taxCodes = ['SR', 'ZR', 'ES', 'OP'] as const;
const complianceRecordTypes = ['licence', 'permit', 'insurance', 'certificate', 'other'] as const;
const complianceStatuses = ['valid', 'expiring', 'expired', 'pending_review'] as const;
const attachmentTypes = ['mou', 'nda', 'contract', 'certificate', 'licence', 'permit', 'insurance', 'other'] as const;

function text(form: FormData, key: string) {
	return String(form.get(key) ?? '').trim();
}

function pick<T extends readonly string[]>(value: string, allowed: T, fallback: T[number]) {
	return allowed.includes(value) ? (value as T[number]) : fallback;
}

function numberField(form: FormData, key: string) {
	const value = Number(text(form, key));
	return Number.isFinite(value) ? value : undefined;
}

export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(500, 'Cloudflare platform bindings are required');
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const detail = await procurement.getSupplierDetail(event.params.id);
	if (!detail?.supplier) throw error(404, 'Supplier not found');
	return {
		supplier: detail.supplier,
		profile: detail.profile,
		contacts: detail.contacts,
		complianceRecords: detail.complianceRecords,
		attachments: detail.attachments,
		scorecard: detail.scorecard
	};
};

export const actions: Actions = {
	evaluate: async (event) => {
		if (!event.platform) return fail(500, { message: 'Cloudflare platform bindings are required' });
		const form = await event.request.formData();
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.createSupplierEvaluation(event.params.id, {
			evaluationDate: text(form, 'evaluationDate') || undefined,
			evaluationCategory: text(form, 'evaluationCategory') || undefined,
			defectRate: numberField(form, 'defectRate'),
			returnRate: numberField(form, 'returnRate'),
			onTimeDeliveryPct: numberField(form, 'onTimeDeliveryPct'),
			leadTimeReliabilityScore: numberField(form, 'leadTimeReliabilityScore'),
			priceCompetitivenessScore: numberField(form, 'priceCompetitivenessScore'),
			paymentTermsScore: numberField(form, 'paymentTermsScore'),
			responsivenessScore: numberField(form, 'responsivenessScore'),
			afterSalesSupportScore: numberField(form, 'afterSalesSupportScore'),
			certificationScore: numberField(form, 'certificationScore'),
			creditCheckScore: numberField(form, 'creditCheckScore'),
			environmentalComplianceScore: numberField(form, 'environmentalComplianceScore'),
			weights: {
				quality: numberField(form, 'qualityWeight'),
				delivery: numberField(form, 'deliveryWeight'),
				price: numberField(form, 'priceWeight'),
				service: numberField(form, 'serviceWeight'),
				compliance: numberField(form, 'complianceWeight'),
				financialStability: numberField(form, 'financialStabilityWeight'),
				sustainability: numberField(form, 'sustainabilityWeight')
			},
			thresholds: {
				gold: numberField(form, 'goldThreshold'),
				silver: numberField(form, 'silverThreshold'),
				bronze: numberField(form, 'bronzeThreshold')
			},
			notes: text(form, 'evaluationNotes') || undefined
		});
		throw redirect(303, `/procurement/suppliers/${event.params.id}`);
	},
	update: async (event) => {
		if (!event.platform) return fail(500, { message: 'Cloudflare platform bindings are required' });
		const form = await event.request.formData();
		const name = text(form, 'name');
		const address = text(form, 'address');
		const contact = text(form, 'contact');
		const itemDescription = text(form, 'itemDescription');
		const dateCreate = text(form, 'dateCreate');
		const projectRelated = text(form, 'projectRelated');
		const gstRegNo = text(form, 'gstRegNo');
		const contactNames = form.getAll('contactName').map((v) => String(v ?? '').trim());
		const contactPhoneEmails = form.getAll('contactPhoneEmail').map((v) => String(v ?? '').trim());
		const contactWechats = form.getAll('contactWechat').map((v) => String(v ?? '').trim());
		const contactPositions = form.getAll('contactPosition').map((v) => String(v ?? '').trim());
		const complianceTitles = form.getAll('complianceTitle').map((v) => String(v ?? '').trim());
		const complianceTypes = form.getAll('complianceRecordType').map((v) => String(v ?? '').trim());
		const complianceIssuers = form.getAll('complianceIssuer').map((v) => String(v ?? '').trim());
		const complianceRefs = form.getAll('complianceReferenceNo').map((v) => String(v ?? '').trim());
		const complianceIssueDates = form.getAll('complianceIssueDate').map((v) => String(v ?? '').trim());
		const complianceExpiryDates = form.getAll('complianceExpiryDate').map((v) => String(v ?? '').trim());
		const complianceStatusesInput = form.getAll('complianceStatus').map((v) => String(v ?? '').trim());
		const complianceNotes = form.getAll('complianceNotes').map((v) => String(v ?? '').trim());
		const attachmentTitles = form.getAll('attachmentTitle').map((v) => String(v ?? '').trim());
		const attachmentTypesInput = form.getAll('attachmentType').map((v) => String(v ?? '').trim());
		const attachmentFileNames = form.getAll('attachmentFileName').map((v) => String(v ?? '').trim());
		const attachmentFileUrls = form.getAll('attachmentFileUrl').map((v) => String(v ?? '').trim());
		const attachmentExpiryDates = form.getAll('attachmentExpiryDate').map((v) => String(v ?? '').trim());
		const attachmentNotes = form.getAll('attachmentNotes').map((v) => String(v ?? '').trim());
		if (!name) return fail(400, { message: 'Supplier name is required.' });
		const contacts = contactNames
			.map((contactName, i) => ({
				name: contactName,
				phoneEmail: contactPhoneEmails[i] || undefined,
				wechat: contactWechats[i] || undefined,
				position: contactPositions[i] || undefined
			}))
			.filter((c) => c.name);
		const complianceRecords = complianceTitles
			.map((title, i) => ({
				title,
				recordType: pick(complianceTypes[i] ?? '', complianceRecordTypes, 'licence'),
				issuer: complianceIssuers[i] || undefined,
				referenceNo: complianceRefs[i] || undefined,
				issueDate: complianceIssueDates[i] || undefined,
				expiryDate: complianceExpiryDates[i] || undefined,
				status: pick(complianceStatusesInput[i] ?? '', complianceStatuses, 'pending_review'),
				notes: complianceNotes[i] || undefined
			}))
			.filter((record) => record.title);
		const attachments = attachmentTitles
			.map((title, i) => ({
				title,
				attachmentType: pick(attachmentTypesInput[i] ?? '', attachmentTypes, 'contract'),
				fileName: attachmentFileNames[i] || undefined,
				fileUrl: attachmentFileUrls[i] || undefined,
				expiryDate: attachmentExpiryDates[i] || undefined,
				notes: attachmentNotes[i] || undefined
			}))
			.filter((attachment) => attachment.title);
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		await procurement.updateSupplierWithContacts(event.params.id, {
			name,
			address: address || undefined,
			contact: contact || undefined,
			itemDescription: itemDescription || undefined,
			dateCreate: dateCreate || undefined,
			projectRelated: projectRelated || undefined,
			gstRegNo: gstRegNo || undefined,
			profile: {
				supplierType: pick(text(form, 'supplierType'), supplierTypes, 'corporate_local'),
				supplierStatus: pick(text(form, 'supplierStatus'), supplierStatuses, 'approved'),
				acraUen: text(form, 'acraUen') || undefined,
				businessRegistrationNo: text(form, 'businessRegistrationNo') || undefined,
				gstRegistrationStatus: pick(text(form, 'gstRegistrationStatus'), gstStatuses, 'unknown'),
				taxCode: text(form, 'taxCode') ? pick(text(form, 'taxCode'), taxCodes, 'SR') : undefined,
				billingAddress: text(form, 'billingAddress') || undefined,
				shippingAddress: text(form, 'shippingAddress') || undefined,
				bankName: text(form, 'bankName') || undefined,
				bankAccountNo: text(form, 'bankAccountNo') || undefined,
				swiftCode: text(form, 'swiftCode') || undefined,
				creditTerms: text(form, 'creditTerms') || undefined,
				paymentTerms: text(form, 'paymentTerms') || undefined,
				preferredCurrency: text(form, 'preferredCurrency') || undefined,
				supplierCategory: text(form, 'supplierCategory') || undefined
			},
			contacts,
			complianceRecords,
			attachments
		});
		throw redirect(303, `/procurement/suppliers/${event.params.id}`);
	}
};


