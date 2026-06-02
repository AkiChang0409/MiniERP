import type { ModuleContext } from '$platform/modules/types';
import { NotFoundError } from '$platform/modules/errors';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AuditService } from '$platform/audit/audit-service';
import { SupplierRepository } from './repository';
import {
	partnerContacts,
	partnerSupplierAttachments,
	partnerSupplierComplianceRecords,
	partnerSupplierEvaluations,
	partnerSupplierProfiles
} from './repositories/supplier.schema';
import {
	procurementPurchaseOrderItems,
	procurementPurchaseOrderReceipts,
	procurementPurchaseOrders,
	procurementRfqItems,
	procurementRfqs,
	procurementRfqSuppliers,
	procurementSupplierQuotationItems,
	procurementSupplierQuotations
} from './repositories/rfq.schema';

type SupplierType = 'individual' | 'corporate_local' | 'corporate_international';
type SupplierStatus = 'approved' | 'preferred' | 'on_hold' | 'blacklisted';
type GstRegistrationStatus = 'registered' | 'not_registered' | 'exempt' | 'unknown';
type TaxCode = 'SR' | 'ZR' | 'ES' | 'OP';
type SupplierRating = 'gold' | 'silver' | 'bronze' | 'not_approved';

type ScoreWeights = {
	quality: number;
	delivery: number;
	price: number;
	service: number;
	compliance: number;
	financialStability: number;
	sustainability: number;
};

type RatingThresholds = {
	gold: number;
	silver: number;
	bronze: number;
};

type SupplierProfileInput = {
	supplierType?: SupplierType;
	supplierStatus?: SupplierStatus;
	acraUen?: string;
	businessRegistrationNo?: string;
	gstRegistrationStatus?: GstRegistrationStatus;
	taxCode?: TaxCode;
	billingAddress?: string;
	shippingAddress?: string;
	bankName?: string;
	bankAccountNo?: string;
	swiftCode?: string;
	creditTerms?: string;
	paymentTerms?: string;
	preferredCurrency?: string;
	supplierCategory?: string;
};

type SupplierContactInput = {
	name: string;
	phoneEmail?: string;
	wechat?: string;
	position?: string;
};

type SupplierComplianceInput = {
	recordType: 'licence' | 'permit' | 'insurance' | 'certificate' | 'other';
	title: string;
	issuer?: string;
	referenceNo?: string;
	issueDate?: string;
	expiryDate?: string;
	status?: 'valid' | 'expiring' | 'expired' | 'pending_review';
	notes?: string;
};

type SupplierAttachmentInput = {
	attachmentType: 'mou' | 'nda' | 'contract' | 'certificate' | 'licence' | 'permit' | 'insurance' | 'other';
	title: string;
	fileName?: string;
	fileUrl?: string;
	expiryDate?: string;
	notes?: string;
};

export type SupplierEvaluationInput = {
	evaluationDate?: string;
	evaluationCategory?: string;
	defectRate?: number;
	returnRate?: number;
	onTimeDeliveryPct?: number;
	leadTimeReliabilityScore?: number;
	priceCompetitivenessScore?: number;
	paymentTermsScore?: number;
	responsivenessScore?: number;
	afterSalesSupportScore?: number;
	certificationScore?: number;
	creditCheckScore?: number;
	environmentalComplianceScore?: number;
	weights?: Partial<ScoreWeights>;
	thresholds?: Partial<RatingThresholds>;
	notes?: string;
};

type RfqSourceType = 'purchase_requisition' | 'mrp_suggestion' | 'manual';
type PoSourceType = 'purchase_requisition' | 'rfq' | 'mrp_suggestion' | 'manual';
type SupplierRiskLevel = 'low' | 'medium' | 'high';

type RfqItemInput = {
	itemCode?: string;
	description: string;
	quantity?: number;
	uom?: string;
	targetUnitPrice?: number;
	notes?: string;
};

type RfqSupplierInput = {
	supplierId: string;
	contactName?: string;
	contactEmail?: string;
	notes?: string;
};

export type CreateRfqInput = {
	rfqNumber?: string;
	title: string;
	sourceType?: RfqSourceType;
	sourceId?: string;
	projectId?: string;
	currency?: string;
	requiredByDate?: string;
	notes?: string;
	items: RfqItemInput[];
	suppliers: RfqSupplierInput[];
	sendImmediately?: boolean;
};

type QuotationItemInput = {
	rfqItemId: string;
	quantity?: number;
	unitPrice: number;
	notes?: string;
};

export type SubmitSupplierQuotationInput = {
	rfqSupplierId?: string;
	supplierId: string;
	quotationNumber?: string;
	submittedAt?: string;
	currency?: string;
	leadTimeDays?: number;
	deliveryTerms?: string;
	paymentTerms?: string;
	validityDate?: string;
	shippingAmount?: number;
	taxAmount?: number;
	dutiesAmount?: number;
	discountAmount?: number;
	notes?: string;
	items: QuotationItemInput[];
};

export type SelectWinningQuotationInput = {
	quotationId: string;
	poNumber?: string;
	poDate?: string;
	goodsReceiptDate?: string;
	status?: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'confirmed' | 'received';
	deliveryDate?: string;
	taxCode?: TaxCode;
	incoterms?: string;
	billingAddress?: string;
	notes?: string;
};

type PurchaseOrderItemInput = {
	itemCode?: string;
	description: string;
	quantity?: number;
	uom?: string;
	unitPrice?: number;
	taxCode?: TaxCode;
	deliveryDate?: string;
	notes?: string;
};

export type CreatePurchaseOrderInput = {
	poNumber?: string;
	sourceType?: PoSourceType;
	sourceId?: string;
	rfqId?: string;
	quotationId?: string;
	supplierId: string;
	projectId?: string;
	poDate?: string;
	deliveryDate?: string;
	currency?: string;
	taxCode?: TaxCode;
	incoterms?: string;
	billingAddress?: string;
	shippingAmount?: number;
	taxAmount?: number;
	dutiesAmount?: number;
	competitiveQuotesCount?: number;
	goodsReceiptDate?: string;
	status?: 'draft' | 'pending_approval' | 'approved' | 'sent' | 'confirmed' | 'received';
	notes?: string;
	items: PurchaseOrderItemInput[];
};

export type PurchaseOrderApprovalInput = {
	action: 'approve' | 'reject';
	reason?: string;
};

export type PurchaseOrderAcknowledgmentInput = {
	ackStatus: 'requested' | 'acknowledged' | 'rejected' | 'overdue';
	acknowledgedAt?: string;
	supplierAckReference?: string;
};

export type PurchaseOrderReceiptInput = {
	poItemId: string;
	receiptNumber?: string;
	receiptDate?: string;
	quantityReceived: number;
	acceptedQuantity?: number;
	rejectedQuantity?: number;
	notes?: string;
};

function nullable(value?: string) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
	quality: 20,
	delivery: 20,
	price: 15,
	service: 15,
	compliance: 15,
	financialStability: 10,
	sustainability: 5
};

const DEFAULT_THRESHOLDS: RatingThresholds = {
	gold: 85,
	silver: 70,
	bronze: 55
};

function clampScore(value?: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Math.min(100, Number(value)));
}

function clampRate(value?: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.max(0, Number(value));
}

function scoreFromInverseRate(rate: number, unacceptableRate: number) {
	return clampScore(100 - (clampRate(rate) / unacceptableRate) * 100);
}

function roundScore(value: number) {
	return Math.round(value * 10) / 10;
}

function roundMoney(value: number) {
	return Math.round(value * 100) / 100;
}

function finiteNumber(value: unknown, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function generatedNumber(prefix: string) {
	const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
	const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
	return `${prefix}-${stamp}-${suffix}`;
}

function approvalThresholdForRisk(risk: SupplierRiskLevel) {
	if (risk === 'high') return 0;
	if (risk === 'medium') return 25_000;
	return 50_000;
}

function normalizeWeights(input?: Partial<ScoreWeights>): ScoreWeights {
	const raw: ScoreWeights = {
		quality: Math.max(0, input?.quality ?? DEFAULT_WEIGHTS.quality),
		delivery: Math.max(0, input?.delivery ?? DEFAULT_WEIGHTS.delivery),
		price: Math.max(0, input?.price ?? DEFAULT_WEIGHTS.price),
		service: Math.max(0, input?.service ?? DEFAULT_WEIGHTS.service),
		compliance: Math.max(0, input?.compliance ?? DEFAULT_WEIGHTS.compliance),
		financialStability: Math.max(0, input?.financialStability ?? DEFAULT_WEIGHTS.financialStability),
		sustainability: Math.max(0, input?.sustainability ?? DEFAULT_WEIGHTS.sustainability)
	};
	const total = Object.values(raw).reduce((sum, value) => sum + value, 0);
	if (total <= 0) return DEFAULT_WEIGHTS;
	return Object.fromEntries(
		Object.entries(raw).map(([key, value]) => [key, roundScore((value / total) * 100)])
	) as ScoreWeights;
}

function normalizeThresholds(input?: Partial<RatingThresholds>): RatingThresholds {
	const gold = clampScore(input?.gold ?? DEFAULT_THRESHOLDS.gold);
	const silver = Math.min(gold, clampScore(input?.silver ?? DEFAULT_THRESHOLDS.silver));
	const bronze = Math.min(silver, clampScore(input?.bronze ?? DEFAULT_THRESHOLDS.bronze));
	return { gold, silver, bronze };
}

function ratingFromScore(score: number, thresholds: RatingThresholds): SupplierRating {
	if (score >= thresholds.gold) return 'gold';
	if (score >= thresholds.silver) return 'silver';
	if (score >= thresholds.bronze) return 'bronze';
	return 'not_approved';
}

export class ProcurementService {
	private suppliers: SupplierRepository;
	private db: ModuleContext['db'];
	private audit: AuditService;
	private user: ModuleContext['user'];

	constructor(ctx: ModuleContext) {
		this.db = ctx.db;
		this.suppliers = new SupplierRepository(ctx.db);
		this.audit = new AuditService(ctx);
		this.user = ctx.user;
	}

	async listSuppliers() {
		const rows = await this.suppliers.findAll();
		const profiles = await this.getProfilesByPartnerId(rows.map((r) => r.id));
		return rows.map((supplier) => ({
			...supplier,
			profile: profiles.get(supplier.id) ?? null
		}));
	}

	async listPartnerContacts(partnerIds?: string[]) {
		const ids = (partnerIds ?? []).filter(Boolean);
		if (ids.length === 0) return [];
		return this.db
			.select()
			.from(partnerContacts)
			.where(and(inArray(partnerContacts.partnerId, ids), isNull(partnerContacts.deletedAt)));
	}

	async getSupplierDetail(id: string) {
		const supplier = await this.suppliers.findById(id);
		if (!supplier) throw new NotFoundError('Supplier', id);
		const [profile, contacts, complianceRecords, attachments, scorecard] = await Promise.all([
			this.getProfileByPartnerId(id),
			this.db
				.select()
				.from(partnerContacts)
				.where(and(eq(partnerContacts.partnerId, id), isNull(partnerContacts.deletedAt)))
				.orderBy(desc(partnerContacts.createdAt)),
			this.db
				.select()
				.from(partnerSupplierComplianceRecords)
				.where(
					and(
						eq(partnerSupplierComplianceRecords.partnerId, id),
						isNull(partnerSupplierComplianceRecords.deletedAt)
					)
				)
				.orderBy(desc(partnerSupplierComplianceRecords.createdAt)),
			this.db
				.select()
				.from(partnerSupplierAttachments)
				.where(
					and(
						eq(partnerSupplierAttachments.partnerId, id),
						isNull(partnerSupplierAttachments.deletedAt)
					)
				)
				.orderBy(desc(partnerSupplierAttachments.createdAt)),
			this.getSupplierScorecard(id)
		]);
		return { supplier, profile, contacts, complianceRecords, attachments, scorecard };
	}

	async deleteSupplier(id: string) {
		const supplier = await this.suppliers.findById(id);
		if (!supplier) throw new NotFoundError('Supplier', id);
		const now = new Date().toISOString();
		await Promise.all([
			this.db
				.update(partnerContacts)
				.set({ deletedAt: now, updatedAt: now })
				.where(and(eq(partnerContacts.partnerId, id), isNull(partnerContacts.deletedAt))),
			this.db
				.update(partnerSupplierProfiles)
				.set({ deletedAt: now, updatedAt: now })
				.where(and(eq(partnerSupplierProfiles.partnerId, id), isNull(partnerSupplierProfiles.deletedAt))),
			this.db
				.update(partnerSupplierComplianceRecords)
				.set({ deletedAt: now, updatedAt: now })
				.where(
					and(
						eq(partnerSupplierComplianceRecords.partnerId, id),
						isNull(partnerSupplierComplianceRecords.deletedAt)
					)
				),
			this.db
				.update(partnerSupplierAttachments)
				.set({ deletedAt: now, updatedAt: now })
				.where(
					and(eq(partnerSupplierAttachments.partnerId, id), isNull(partnerSupplierAttachments.deletedAt))
				)
		]);
		await this.suppliers.softDelete(id);
	}

	async createSupplier(data: {
		name: string;
		address?: string;
		contact?: string;
		itemDescription?: string;
		dateCreate?: string;
		projectRelated?: string;
		gstRegNo?: string;
		metadata?: string;
		profile?: SupplierProfileInput;
		contacts?: SupplierContactInput[];
		complianceRecords?: SupplierComplianceInput[];
		attachments?: SupplierAttachmentInput[];
	}) {
		const profile = data.profile ?? {};
		const row = await this.suppliers.create({
			name: data.name,
			address: data.address ?? null,
			contact: data.contact ?? null,
			itemDescription: data.itemDescription ?? null,
			dateCreate: data.dateCreate ?? null,
			projectRelated: data.projectRelated ?? null,
			gstRegNo: data.gstRegNo ?? null,
			metadata: data.metadata ?? null,
			registrationNo: nullable(profile.businessRegistrationNo) ?? nullable(profile.acraUen),
			country: null,
			currency: profile.preferredCurrency?.trim() || 'SGD'
		});
		const partnerId = row.id as string;
		const now = row.updatedAt as string;
		await this.upsertProfile(partnerId, profile, now);
		await Promise.all([
			this.insertContacts(partnerId, data.contacts ?? [], now),
			this.insertComplianceRecords(partnerId, data.complianceRecords ?? [], now),
			this.insertAttachments(partnerId, data.attachments ?? [], now)
		]);
		return row;
	}

	async updateSupplierWithContacts(
		id: string,
		data: {
			name: string;
			address?: string;
			contact?: string;
			itemDescription?: string;
			dateCreate?: string;
			projectRelated?: string;
			gstRegNo?: string;
			profile?: SupplierProfileInput;
			contacts?: SupplierContactInput[];
			complianceRecords?: SupplierComplianceInput[];
			attachments?: SupplierAttachmentInput[];
		}
	) {
		await this.suppliers.update(id, {
			name: data.name,
			address: data.address ?? null,
			contact: data.contact ?? null,
			itemDescription: data.itemDescription ?? null,
			dateCreate: data.dateCreate ?? null,
			projectRelated: data.projectRelated ?? null,
			gstRegNo: data.gstRegNo ?? null,
			...(data.profile
				? {
						registrationNo:
							nullable(data.profile.businessRegistrationNo) ?? nullable(data.profile.acraUen),
						currency: data.profile.preferredCurrency?.trim() || 'SGD'
					}
				: {})
		});
		const now = new Date().toISOString();
		await this.db
			.update(partnerContacts)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(partnerContacts.partnerId, id), isNull(partnerContacts.deletedAt)));
		await this.db
			.update(partnerSupplierComplianceRecords)
			.set({ deletedAt: now, updatedAt: now })
			.where(
				and(
					eq(partnerSupplierComplianceRecords.partnerId, id),
					isNull(partnerSupplierComplianceRecords.deletedAt)
				)
			);
		await this.db
			.update(partnerSupplierAttachments)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(partnerSupplierAttachments.partnerId, id), isNull(partnerSupplierAttachments.deletedAt)));
		if (data.profile) await this.upsertProfile(id, data.profile, now);
		await Promise.all([
			this.insertContacts(id, data.contacts ?? [], now),
			this.insertComplianceRecords(id, data.complianceRecords ?? [], now),
			this.insertAttachments(id, data.attachments ?? [], now)
		]);
	}

	async createSupplierEvaluation(partnerId: string, input: SupplierEvaluationInput) {
		const supplier = await this.suppliers.findById(partnerId);
		if (!supplier) throw new NotFoundError('Supplier', partnerId);
		const now = new Date().toISOString();
		const weights = normalizeWeights(input.weights);
		const thresholds = normalizeThresholds(input.thresholds);
		const metrics = {
			defectRate: clampRate(input.defectRate),
			returnRate: clampRate(input.returnRate),
			onTimeDeliveryPct: clampScore(input.onTimeDeliveryPct),
			leadTimeReliabilityScore: clampScore(input.leadTimeReliabilityScore),
			priceCompetitivenessScore: clampScore(input.priceCompetitivenessScore),
			paymentTermsScore: clampScore(input.paymentTermsScore),
			responsivenessScore: clampScore(input.responsivenessScore),
			afterSalesSupportScore: clampScore(input.afterSalesSupportScore),
			certificationScore: clampScore(input.certificationScore),
			creditCheckScore: clampScore(input.creditCheckScore),
			environmentalComplianceScore: clampScore(input.environmentalComplianceScore)
		};
		const categoryScores = {
			qualityScore: roundScore(
				(scoreFromInverseRate(metrics.defectRate, 10) + scoreFromInverseRate(metrics.returnRate, 20)) / 2
			),
			deliveryScore: roundScore(
				(metrics.onTimeDeliveryPct + metrics.leadTimeReliabilityScore) / 2
			),
			priceScore: roundScore(
				(metrics.priceCompetitivenessScore + metrics.paymentTermsScore) / 2
			),
			serviceScore: roundScore(
				(metrics.responsivenessScore + metrics.afterSalesSupportScore) / 2
			),
			complianceScore: roundScore(metrics.certificationScore),
			financialStabilityScore: roundScore(metrics.creditCheckScore),
			sustainabilityScore: roundScore(metrics.environmentalComplianceScore)
		};
		const overallScore = roundScore(
			(categoryScores.qualityScore * weights.quality +
				categoryScores.deliveryScore * weights.delivery +
				categoryScores.priceScore * weights.price +
				categoryScores.serviceScore * weights.service +
				categoryScores.complianceScore * weights.compliance +
				categoryScores.financialStabilityScore * weights.financialStability +
				categoryScores.sustainabilityScore * weights.sustainability) /
				100
		);
		const overallRating = ratingFromScore(overallScore, thresholds);
		const row = {
			id: crypto.randomUUID(),
			partnerId,
			evaluationDate: nullable(input.evaluationDate) ?? now.slice(0, 10),
			evaluationCategory: nullable(input.evaluationCategory),
			evaluatorUserId: this.user?.id ?? null,
			evaluatorEmail: this.user?.email ?? null,
			...metrics,
			...categoryScores,
			qualityWeight: weights.quality,
			deliveryWeight: weights.delivery,
			priceWeight: weights.price,
			serviceWeight: weights.service,
			complianceWeight: weights.compliance,
			financialStabilityWeight: weights.financialStability,
			sustainabilityWeight: weights.sustainability,
			goldThreshold: thresholds.gold,
			silverThreshold: thresholds.silver,
			bronzeThreshold: thresholds.bronze,
			overallScore,
			overallRating,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(partnerSupplierEvaluations).values(row);
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: 'supplier.evaluation.created',
			entityType: 'supplier_evaluation',
			entityId: row.id,
			newValue: {
				partnerId,
				supplierName: supplier.name,
				overallScore,
				overallRating,
				weights,
				thresholds
			},
			metadata: {
				partnerId,
				supplierName: supplier.name,
				evaluationDate: row.evaluationDate,
				evaluationCategory: row.evaluationCategory
			}
		});
		return row;
	}

	async listSupplierEvaluations(partnerId: string) {
		return this.db
			.select()
			.from(partnerSupplierEvaluations)
			.where(
				and(
					eq(partnerSupplierEvaluations.partnerId, partnerId),
					isNull(partnerSupplierEvaluations.deletedAt)
				)
			)
			.orderBy(desc(partnerSupplierEvaluations.evaluationDate), desc(partnerSupplierEvaluations.createdAt));
	}

	async getSupplierScorecard(partnerId: string) {
		const evaluations = await this.listSupplierEvaluations(partnerId);
		const latest = evaluations[0] ?? null;
		const chronological = [...evaluations].reverse();
		const trend = chronological.map((evaluation, index) => {
			const previous = chronological[index - 1];
			return {
				...evaluation,
				scoreDelta: previous ? roundScore(evaluation.overallScore - previous.overallScore) : null,
				ratingChanged: previous ? previous.overallRating !== evaluation.overallRating : false
			};
		});
		return { latest, evaluations, trend };
	}

	async listRfqs() {
		const rfqs = await this.db
			.select()
			.from(procurementRfqs)
			.where(isNull(procurementRfqs.deletedAt))
			.orderBy(desc(procurementRfqs.createdAt));
		const result = [];
		for (const rfq of rfqs) {
			const [items, suppliers, quotations, purchaseOrders] = await Promise.all([
				this.db
					.select()
					.from(procurementRfqItems)
					.where(and(eq(procurementRfqItems.rfqId, rfq.id), isNull(procurementRfqItems.deletedAt))),
				this.db
					.select()
					.from(procurementRfqSuppliers)
					.where(and(eq(procurementRfqSuppliers.rfqId, rfq.id), isNull(procurementRfqSuppliers.deletedAt))),
				this.db
					.select()
					.from(procurementSupplierQuotations)
					.where(
						and(
							eq(procurementSupplierQuotations.rfqId, rfq.id),
							isNull(procurementSupplierQuotations.deletedAt)
						)
					),
				this.db
					.select()
					.from(procurementPurchaseOrders)
					.where(and(eq(procurementPurchaseOrders.rfqId, rfq.id), isNull(procurementPurchaseOrders.deletedAt)))
			]);
			result.push({
				...rfq,
				itemCount: items.length,
				supplierCount: suppliers.length,
				quotationCount: quotations.length,
				competitiveQuotesCount: quotations.filter((q) => q.status !== 'expired').length,
				bestTotalCost: quotations.length
					? Math.min(...quotations.map((q) => finiteNumber(q.totalCost)))
					: null,
				purchaseOrder: purchaseOrders[0] ?? null
			});
		}
		return result;
	}

	async createRfq(input: CreateRfqInput) {
		const title = input.title.trim();
		if (!title) throw new Error('RFQ title is required');
		const items = input.items.filter((item) => item.description.trim());
		if (items.length === 0) throw new Error('At least one RFQ item is required');
		const suppliers = input.suppliers.filter((supplier) => supplier.supplierId.trim());
		if (suppliers.length === 0) throw new Error('At least one supplier is required');

		const now = new Date().toISOString();
		const rfqId = crypto.randomUUID();
		const sendImmediately = input.sendImmediately ?? true;
		const rfq = {
			id: rfqId,
			rfqNumber: nullable(input.rfqNumber) ?? generatedNumber('RFQ'),
			title,
			sourceType: input.sourceType ?? 'manual',
			sourceId: nullable(input.sourceId),
			projectId: nullable(input.projectId),
			status: sendImmediately ? 'sent' : 'draft',
			currency: nullable(input.currency) ?? 'SGD',
			requiredByDate: nullable(input.requiredByDate),
			createdByUserId: this.user?.id ?? null,
			createdByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(procurementRfqs).values(rfq as any);

		const insertedItems = [];
		for (const item of items) {
			const row = {
				id: crypto.randomUUID(),
				rfqId,
				itemCode: nullable(item.itemCode),
				description: item.description.trim(),
				quantity: Math.max(0, finiteNumber(item.quantity, 1)),
				uom: nullable(item.uom) ?? 'unit',
				targetUnitPrice: item.targetUnitPrice === undefined ? null : Math.max(0, finiteNumber(item.targetUnitPrice)),
				notes: nullable(item.notes),
				createdAt: now,
				updatedAt: now
			};
			await this.db.insert(procurementRfqItems).values(row as any);
			insertedItems.push(row);
		}

		for (const supplier of suppliers) {
			const found = await this.suppliers.findById(supplier.supplierId);
			if (!found) throw new NotFoundError('Supplier', supplier.supplierId);
			await this.db.insert(procurementRfqSuppliers).values({
				id: crypto.randomUUID(),
				rfqId,
				supplierId: supplier.supplierId,
				contactName: nullable(supplier.contactName),
				contactEmail: nullable(supplier.contactEmail),
				status: sendImmediately ? 'sent' : 'draft',
				sentAt: sendImmediately ? now : null,
				notes: nullable(supplier.notes),
				createdAt: now,
				updatedAt: now
			} as any);
		}

		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: sendImmediately ? 'rfq.sent' : 'rfq.created',
			entityType: 'rfq',
			entityId: rfqId,
			newValue: { ...rfq, items: insertedItems, supplierIds: suppliers.map((s) => s.supplierId) },
			metadata: { sourceType: rfq.sourceType, sourceId: rfq.sourceId, supplierCount: suppliers.length }
		});
		return rfq;
	}

	async getRfqComparison(rfqId: string) {
		const rfqRows = await this.db
			.select()
			.from(procurementRfqs)
			.where(and(eq(procurementRfqs.id, rfqId), isNull(procurementRfqs.deletedAt)))
			.limit(1);
		const rfq = rfqRows[0];
		if (!rfq) throw new NotFoundError('RFQ', rfqId);

		const [items, invitations, quotations, purchaseOrders, suppliers] = await Promise.all([
			this.db
				.select()
				.from(procurementRfqItems)
				.where(and(eq(procurementRfqItems.rfqId, rfqId), isNull(procurementRfqItems.deletedAt))),
			this.db
				.select()
				.from(procurementRfqSuppliers)
				.where(and(eq(procurementRfqSuppliers.rfqId, rfqId), isNull(procurementRfqSuppliers.deletedAt))),
			this.db
				.select()
				.from(procurementSupplierQuotations)
				.where(
					and(eq(procurementSupplierQuotations.rfqId, rfqId), isNull(procurementSupplierQuotations.deletedAt))
				)
				.orderBy(procurementSupplierQuotations.totalCost),
			this.db
				.select()
				.from(procurementPurchaseOrders)
				.where(and(eq(procurementPurchaseOrders.rfqId, rfqId), isNull(procurementPurchaseOrders.deletedAt))),
			this.listSuppliers()
		]);
		const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
		const quotationItems = await this.getQuotationItems(quotations.map((q) => q.id));
		const itemById = new Map(items.map((item) => [item.id, item]));
		const quotesBySupplier = new Map<string, typeof quotations>();
		for (const quote of quotations) {
			const list = quotesBySupplier.get(quote.supplierId) ?? [];
			list.push(quote);
			quotesBySupplier.set(quote.supplierId, list);
		}

		return {
			rfq,
			items,
			invitations: invitations.map((invitation) => ({
				...invitation,
				supplier: supplierById.get(invitation.supplierId) ?? null,
				quotations: quotesBySupplier.get(invitation.supplierId) ?? []
			})),
			quotations: quotations.map((quotation) => {
				const lines = (quotationItems.get(quotation.id) ?? []).map((line) => ({
					...line,
					rfqItem: itemById.get(line.rfqItemId) ?? null
				}));
				return {
					...quotation,
					supplier: supplierById.get(quotation.supplierId) ?? null,
					lines,
					totalCostAnalysis: {
						subtotal: quotation.subtotalAmount,
						shipping: quotation.shippingAmount,
						tax: quotation.taxAmount,
						duties: quotation.dutiesAmount,
						discount: quotation.discountAmount,
						total: quotation.totalCost
					}
				};
			}),
			purchaseOrder: purchaseOrders[0] ?? null
		};
	}

	async submitSupplierQuotation(rfqId: string, input: SubmitSupplierQuotationInput) {
		const rfq = await this.getRfqComparison(rfqId);
		const invitation =
			rfq.invitations.find((i) => i.id === input.rfqSupplierId) ??
			rfq.invitations.find((i) => i.supplierId === input.supplierId);
		if (!invitation) throw new Error('Supplier is not invited to this RFQ');
		const supplierRating = await this.getSupplierScorecard(input.supplierId);
		const now = new Date().toISOString();
		const quoteId = crypto.randomUUID();
		const rfqItemById = new Map(rfq.items.map((item) => [item.id, item]));
		let subtotal = 0;
		const normalizedItems = input.items
			.filter((item) => rfqItemById.has(item.rfqItemId))
			.map((item) => {
				const rfqItem = rfqItemById.get(item.rfqItemId)!;
				const quantity = Math.max(0, finiteNumber(item.quantity, finiteNumber(rfqItem.quantity, 1)));
				const unitPrice = Math.max(0, finiteNumber(item.unitPrice));
				const lineTotal = roundMoney(quantity * unitPrice);
				subtotal += lineTotal;
				return {
					id: crypto.randomUUID(),
					quotationId: quoteId,
					rfqItemId: item.rfqItemId,
					quantity,
					unitPrice,
					lineTotal,
					notes: nullable(item.notes),
					createdAt: now,
					updatedAt: now
				};
			});
		if (normalizedItems.length === 0) throw new Error('At least one valid quotation item is required');

		const shipping = Math.max(0, finiteNumber(input.shippingAmount));
		const tax = Math.max(0, finiteNumber(input.taxAmount));
		const duties = Math.max(0, finiteNumber(input.dutiesAmount));
		const discount = Math.max(0, finiteNumber(input.discountAmount));
		const totalCost = roundMoney(subtotal + shipping + tax + duties - discount);
		const quote = {
			id: quoteId,
			rfqId,
			rfqSupplierId: invitation.id,
			supplierId: input.supplierId,
			quotationNumber: nullable(input.quotationNumber),
			status: 'submitted',
			submittedAt: nullable(input.submittedAt) ?? now,
			currency: nullable(input.currency) ?? rfq.rfq.currency ?? 'SGD',
			leadTimeDays: input.leadTimeDays === undefined ? null : Math.max(0, finiteNumber(input.leadTimeDays)),
			deliveryTerms: nullable(input.deliveryTerms),
			paymentTerms: nullable(input.paymentTerms),
			validityDate: nullable(input.validityDate),
			shippingAmount: shipping,
			taxAmount: tax,
			dutiesAmount: duties,
			discountAmount: discount,
			subtotalAmount: roundMoney(subtotal),
			totalCost,
			supplierRatingSnapshot: supplierRating.latest?.overallScore ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(procurementSupplierQuotations).values(quote as any);
		for (const item of normalizedItems) {
			await this.db.insert(procurementSupplierQuotationItems).values(item as any);
		}
		await this.db
			.update(procurementRfqSuppliers)
			.set({ status: 'responded', updatedAt: now } as any)
			.where(eq(procurementRfqSuppliers.id, invitation.id));
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: 'rfq.quotation.submitted',
			entityType: 'supplier_quotation',
			entityId: quoteId,
			newValue: { ...quote, items: normalizedItems },
			metadata: { rfqId, supplierId: input.supplierId, totalCost }
		});
		return quote;
	}

	async selectWinningQuotation(rfqId: string, input: SelectWinningQuotationInput) {
		const comparison = await this.getRfqComparison(rfqId);
		const quotation = comparison.quotations.find((q) => q.id === input.quotationId);
		if (!quotation) throw new NotFoundError('Supplier quotation', input.quotationId);
		const competitiveQuotesCount = comparison.quotations.filter((q) => q.status !== 'expired').length;
		const po = await this.createPurchaseOrder({
			poNumber: input.poNumber,
			sourceType: 'rfq',
			sourceId: rfqId,
			rfqId,
			quotationId: quotation.id,
			supplierId: quotation.supplierId,
			projectId: comparison.rfq.projectId ?? undefined,
			status: input.status,
			poDate: input.poDate,
			deliveryDate: input.deliveryDate,
			goodsReceiptDate: input.goodsReceiptDate,
			currency: quotation.currency,
			shippingAmount: quotation.shippingAmount,
			taxAmount: quotation.taxAmount,
			dutiesAmount: quotation.dutiesAmount,
			competitiveQuotesCount,
			taxCode: input.taxCode,
			incoterms: input.incoterms,
			billingAddress: input.billingAddress,
			notes: input.notes,
			items: quotation.lines.map((line) => ({
				itemCode: line.rfqItem?.itemCode ?? undefined,
				description: line.rfqItem?.description ?? 'Quoted item',
				quantity: line.quantity,
				uom: line.rfqItem?.uom ?? 'unit',
				unitPrice: line.unitPrice,
				taxCode: input.taxCode,
				deliveryDate: input.deliveryDate,
				notes: line.notes ?? undefined
			}))
		});
		const now = new Date().toISOString();
		await this.db
			.update(procurementSupplierQuotations)
			.set({ status: 'rejected', updatedAt: now } as any)
			.where(eq(procurementSupplierQuotations.rfqId, rfqId));
		await this.db
			.update(procurementSupplierQuotations)
			.set({ status: 'selected', updatedAt: now } as any)
			.where(eq(procurementSupplierQuotations.id, quotation.id));
		await this.db
			.update(procurementRfqs)
			.set({ status: 'converted', updatedAt: now } as any)
			.where(eq(procurementRfqs.id, rfqId));
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: 'rfq.quotation.selected.po.created',
			entityType: 'purchase_order',
			entityId: po.id,
			newValue: po,
			metadata: {
				rfqId,
				quotationId: quotation.id,
				competitiveQuotesCount,
				afterTheFactFlag: po.afterTheFactFlag,
				iaExceptionCode: po.iaExceptionCode
			}
		});
		return po;
	}

	async createPurchaseOrder(input: CreatePurchaseOrderInput) {
		const supplier = await this.suppliers.findById(input.supplierId);
		if (!supplier) throw new NotFoundError('Supplier', input.supplierId);
		const items = input.items.filter((item) => item.description.trim());
		if (items.length === 0) throw new Error('At least one PO item is required');

		const now = new Date().toISOString();
		const poId = crypto.randomUUID();
		const poDate = nullable(input.poDate) ?? now.slice(0, 10);
		const goodsReceiptDate = nullable(input.goodsReceiptDate);
		const normalizedItems = items.map((item) => {
			const quantity = Math.max(0, finiteNumber(item.quantity, 1));
			const unitPrice = Math.max(0, finiteNumber(item.unitPrice));
			const lineSubtotal = roundMoney(quantity * unitPrice);
			return {
				id: crypto.randomUUID(),
				poId,
				itemCode: nullable(item.itemCode),
				description: item.description.trim(),
				quantity,
				receivedQuantity: 0,
				backOrderedQuantity: 0,
				uom: nullable(item.uom) ?? 'unit',
				unitPrice,
				lineSubtotal,
				taxCode: item.taxCode ?? input.taxCode ?? null,
				deliveryDate: nullable(item.deliveryDate) ?? nullable(input.deliveryDate),
				notes: nullable(item.notes),
				createdAt: now,
				updatedAt: now
			};
		});
		const subtotalAmount = roundMoney(normalizedItems.reduce((sum, item) => sum + item.lineSubtotal, 0));
		const shippingAmount = Math.max(0, finiteNumber(input.shippingAmount));
		const taxAmount = Math.max(0, finiteNumber(input.taxAmount));
		const dutiesAmount = Math.max(0, finiteNumber(input.dutiesAmount));
		const totalAmount = roundMoney(subtotalAmount + shippingAmount + taxAmount + dutiesAmount);
		const risk = await this.resolveSupplierRisk(input.supplierId);
		const approvalThresholdAmount = approvalThresholdForRisk(risk);
		const approvalRequired = risk === 'high' || totalAmount >= approvalThresholdAmount;
		const approvalStatus = approvalRequired ? 'pending_approval' : 'not_required';
		const status = approvalRequired ? 'pending_approval' : input.status ?? 'approved';
		const competitiveQuotesCount = Math.max(0, finiteNumber(input.competitiveQuotesCount));
		const afterTheFactFlag = Boolean(goodsReceiptDate && poDate > goodsReceiptDate);
		const ia002 = totalAmount > 50_000 && competitiveQuotesCount < 2;
		const profile = await this.getProfileByPartnerId(input.supplierId);

		const po = {
			id: poId,
			poNumber: nullable(input.poNumber) ?? generatedNumber('PO'),
			sourceType: input.sourceType ?? 'manual',
			sourceId: nullable(input.sourceId),
			rfqId: nullable(input.rfqId),
			quotationId: nullable(input.quotationId),
			supplierId: input.supplierId,
			projectId: nullable(input.projectId),
			status,
			approvalStatus,
			approvalRequired,
			approvalThresholdAmount,
			supplierRiskLevel: risk,
			approvedByUserId: null,
			approvedByEmail: null,
			approvedAt: null,
			rejectedReason: null,
			poDate,
			deliveryDate: nullable(input.deliveryDate),
			goodsReceiptDate,
			currency: nullable(input.currency) ?? profile?.preferredCurrency ?? 'SGD',
			taxCode: input.taxCode ?? profile?.taxCode ?? null,
			incoterms: nullable(input.incoterms),
			billingAddress: nullable(input.billingAddress) ?? profile?.billingAddress ?? null,
			ackStatus: 'not_requested',
			ackRequestedAt: null,
			acknowledgedAt: null,
			supplierAckReference: null,
			subtotalAmount,
			shippingAmount,
			taxAmount,
			dutiesAmount,
			totalAmount,
			competitiveQuotesCount,
			afterTheFactFlag,
			iaExceptionCode: ia002 ? 'IA002' : null,
			iaExceptionReason: ia002
				? 'PO over 50000 requires at least two competitive supplier quotations.'
				: null,
			createdByUserId: this.user?.id ?? null,
			createdByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(procurementPurchaseOrders).values(po as any);
		for (const item of normalizedItems) {
			await this.db.insert(procurementPurchaseOrderItems).values(item as any);
		}
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: approvalRequired ? 'purchase_order.created.pending_approval' : 'purchase_order.created',
			entityType: 'purchase_order',
			entityId: poId,
			newValue: { ...po, items: normalizedItems },
			metadata: {
				sourceType: po.sourceType,
				sourceId: po.sourceId,
				supplierId: input.supplierId,
				totalAmount,
				supplierRiskLevel: risk,
				approvalStatus
			}
		});
		return { ...po, items: normalizedItems, receipts: [], supplier };
	}

	async updatePurchaseOrderApproval(poId: string, input: PurchaseOrderApprovalInput) {
		const po = await this.getPurchaseOrder(poId);
		const now = new Date().toISOString();
		const approved = input.action === 'approve';
		const updates = {
			approvalStatus: approved ? 'approved' : 'rejected',
			status: approved ? 'approved' : 'draft',
			approvedByUserId: approved ? this.user?.id ?? null : null,
			approvedByEmail: approved ? this.user?.email ?? null : null,
			approvedAt: approved ? now : null,
			rejectedReason: approved ? null : nullable(input.reason),
			updatedAt: now
		};
		await this.db.update(procurementPurchaseOrders).set(updates as any).where(eq(procurementPurchaseOrders.id, poId));
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'update',
			action: approved ? 'purchase_order.approved' : 'purchase_order.rejected',
			entityType: 'purchase_order',
			entityId: poId,
			oldValue: po,
			newValue: { ...po, ...updates },
			metadata: { totalAmount: po.totalAmount, supplierRiskLevel: po.supplierRiskLevel }
		});
		return { ...po, ...updates };
	}

	async recordPurchaseOrderAcknowledgment(poId: string, input: PurchaseOrderAcknowledgmentInput) {
		const po = await this.getPurchaseOrder(poId);
		const now = new Date().toISOString();
		const updates = {
			ackStatus: input.ackStatus,
			ackRequestedAt:
				input.ackStatus === 'requested' && !po.ackRequestedAt ? now : po.ackRequestedAt,
			acknowledgedAt:
				input.ackStatus === 'acknowledged' ? nullable(input.acknowledgedAt) ?? now : po.acknowledgedAt,
			supplierAckReference: nullable(input.supplierAckReference) ?? po.supplierAckReference,
			status: input.ackStatus === 'acknowledged' ? 'confirmed' : po.status,
			updatedAt: now
		};
		await this.db.update(procurementPurchaseOrders).set(updates as any).where(eq(procurementPurchaseOrders.id, poId));
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'update',
			action: 'purchase_order.acknowledgment.updated',
			entityType: 'purchase_order',
			entityId: poId,
			oldValue: po,
			newValue: { ...po, ...updates },
			metadata: { ackStatus: input.ackStatus }
		});
		return { ...po, ...updates };
	}

	async recordPurchaseOrderReceipt(poId: string, input: PurchaseOrderReceiptInput) {
		const po = await this.getPurchaseOrder(poId);
		const items = await this.getPurchaseOrderItems(poId);
		const item = items.find((row) => row.id === input.poItemId);
		if (!item) throw new NotFoundError('Purchase order item', input.poItemId);

		const now = new Date().toISOString();
		const quantityReceived = Math.max(0, finiteNumber(input.quantityReceived));
		if (quantityReceived <= 0) throw new Error('Receipt quantity must be greater than zero');
		const acceptedQuantity = Math.max(0, finiteNumber(input.acceptedQuantity, quantityReceived));
		const rejectedQuantity = Math.max(0, finiteNumber(input.rejectedQuantity));
		const nextReceived = Math.min(finiteNumber(item.quantity), finiteNumber(item.receivedQuantity) + acceptedQuantity);
		const backOrderQuantity = Math.max(0, finiteNumber(item.quantity) - nextReceived);
		const receipt = {
			id: crypto.randomUUID(),
			poId,
			poItemId: input.poItemId,
			receiptNumber: nullable(input.receiptNumber) ?? generatedNumber('GRN'),
			receiptDate: nullable(input.receiptDate) ?? now.slice(0, 10),
			quantityReceived,
			acceptedQuantity,
			rejectedQuantity,
			backOrderQuantity,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(procurementPurchaseOrderReceipts).values(receipt as any);
		await this.db
			.update(procurementPurchaseOrderItems)
			.set({ receivedQuantity: nextReceived, backOrderedQuantity: backOrderQuantity, updatedAt: now } as any)
			.where(eq(procurementPurchaseOrderItems.id, input.poItemId));

		const refreshedItems = items.map((row) =>
			row.id === input.poItemId
				? { ...row, receivedQuantity: nextReceived, backOrderedQuantity: backOrderQuantity }
				: row
		);
		const orderedTotal = refreshedItems.reduce((sum, row) => sum + finiteNumber(row.quantity), 0);
		const receivedTotal = refreshedItems.reduce((sum, row) => sum + finiteNumber(row.receivedQuantity), 0);
		const nextStatus = receivedTotal >= orderedTotal ? 'received' : receivedTotal > 0 ? 'back_ordered' : po.status;
		await this.db
			.update(procurementPurchaseOrders)
			.set({
				status: nextStatus,
				goodsReceiptDate: receipt.receiptDate,
				updatedAt: now
			} as any)
			.where(eq(procurementPurchaseOrders.id, poId));
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'update',
			action: 'purchase_order.receipt.recorded',
			entityType: 'purchase_order',
			entityId: poId,
			oldValue: po,
			newValue: { receipt, status: nextStatus },
			metadata: { poItemId: input.poItemId, quantityReceived, acceptedQuantity, backOrderQuantity }
		});
		return receipt;
	}

	async listPurchaseOrders() {
		const purchaseOrders = await this.db
			.select()
			.from(procurementPurchaseOrders)
			.where(isNull(procurementPurchaseOrders.deletedAt))
			.orderBy(desc(procurementPurchaseOrders.createdAt));
		const suppliers = await this.listSuppliers();
		const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
		const result = [];
		for (const po of purchaseOrders) {
			const [items, receipts] = await Promise.all([
				this.getPurchaseOrderItems(po.id),
				this.db
					.select()
					.from(procurementPurchaseOrderReceipts)
					.where(
						and(
							eq(procurementPurchaseOrderReceipts.poId, po.id),
							isNull(procurementPurchaseOrderReceipts.deletedAt)
						)
					)
					.orderBy(desc(procurementPurchaseOrderReceipts.receiptDate))
			]);
			const orderedQuantity = items.reduce((sum, item) => sum + finiteNumber(item.quantity), 0);
			const receivedQuantity = items.reduce((sum, item) => sum + finiteNumber(item.receivedQuantity), 0);
			const backOrderedQuantity = items.reduce((sum, item) => sum + finiteNumber(item.backOrderedQuantity), 0);
			result.push({
				...po,
				supplier: po.supplierId ? supplierById.get(po.supplierId) ?? null : null,
				items,
				receipts,
				orderedQuantity,
				receivedQuantity,
				backOrderedQuantity
			});
		}
		return result;
	}

	private async getPurchaseOrder(poId: string) {
		const rows = await this.db
			.select()
			.from(procurementPurchaseOrders)
			.where(and(eq(procurementPurchaseOrders.id, poId), isNull(procurementPurchaseOrders.deletedAt)))
			.limit(1);
		const po = rows[0];
		if (!po) throw new NotFoundError('Purchase order', poId);
		return po;
	}

	private async getPurchaseOrderItems(poId: string) {
		return this.db
			.select()
			.from(procurementPurchaseOrderItems)
			.where(and(eq(procurementPurchaseOrderItems.poId, poId), isNull(procurementPurchaseOrderItems.deletedAt)))
			.orderBy(procurementPurchaseOrderItems.createdAt);
	}

	private async resolveSupplierRisk(partnerId: string): Promise<SupplierRiskLevel> {
		const [profile, scorecard] = await Promise.all([
			this.getProfileByPartnerId(partnerId),
			this.getSupplierScorecard(partnerId)
		]);
		if (profile?.supplierStatus === 'blacklisted' || profile?.supplierStatus === 'on_hold') return 'high';
		const latestScore = scorecard.latest?.overallScore;
		if (latestScore !== null && latestScore !== undefined) {
			if (latestScore < 55) return 'high';
			if (latestScore < 70) return 'medium';
			return 'low';
		}
		return profile?.supplierStatus === 'preferred' ? 'low' : 'medium';
	}

	private async getProfilesByPartnerId(partnerIds: string[]) {
		if (partnerIds.length === 0) return new Map<string, typeof partnerSupplierProfiles.$inferSelect>();
		const rows = await this.db
			.select()
			.from(partnerSupplierProfiles)
			.where(
				and(
					inArray(partnerSupplierProfiles.partnerId, partnerIds),
					isNull(partnerSupplierProfiles.deletedAt)
				)
			);
		return new Map(rows.map((row) => [row.partnerId, row]));
	}

	private async getProfileByPartnerId(partnerId: string) {
		const rows = await this.db
			.select()
			.from(partnerSupplierProfiles)
			.where(and(eq(partnerSupplierProfiles.partnerId, partnerId), isNull(partnerSupplierProfiles.deletedAt)))
			.limit(1);
		return rows[0] ?? null;
	}

	private async upsertProfile(partnerId: string, profile: SupplierProfileInput, now: string) {
		const values = {
			supplierType: profile.supplierType ?? 'corporate_local',
			supplierStatus: profile.supplierStatus ?? 'approved',
			acraUen: nullable(profile.acraUen),
			businessRegistrationNo: nullable(profile.businessRegistrationNo),
			gstRegistrationStatus: profile.gstRegistrationStatus ?? 'unknown',
			taxCode: profile.taxCode ?? null,
			billingAddress: nullable(profile.billingAddress),
			shippingAddress: nullable(profile.shippingAddress),
			bankName: nullable(profile.bankName),
			bankAccountNo: nullable(profile.bankAccountNo),
			swiftCode: nullable(profile.swiftCode),
			creditTerms: nullable(profile.creditTerms),
			paymentTerms: nullable(profile.paymentTerms),
			preferredCurrency: nullable(profile.preferredCurrency) ?? 'SGD',
			supplierCategory: nullable(profile.supplierCategory),
			updatedAt: now
		};
		const existing = await this.getProfileByPartnerId(partnerId);
		if (existing) {
			await this.db
				.update(partnerSupplierProfiles)
				.set(values as any)
				.where(eq(partnerSupplierProfiles.id, existing.id));
			return;
		}
		await this.db.insert(partnerSupplierProfiles).values({
			id: crypto.randomUUID(),
			partnerId,
			...values,
			createdAt: now
		} as any);
	}

	private async insertContacts(
		partnerId: string,
		contacts: Array<{ name: string; phoneEmail?: string; wechat?: string; position?: string }>,
		now: string
	) {
		for (const c of contacts) {
			const name = c.name.trim();
			if (!name) continue;
			await this.db.insert(partnerContacts).values({
				id: crypto.randomUUID(),
				partnerId,
				name,
				phoneEmail: c.phoneEmail?.trim() || null,
				wechat: c.wechat?.trim() || null,
				position: c.position?.trim() || null,
				createdAt: now,
				updatedAt: now
			});
		}
	}

	private async insertComplianceRecords(
		partnerId: string,
		records: SupplierComplianceInput[],
		now: string
	) {
		for (const record of records) {
			const title = record.title.trim();
			if (!title) continue;
			await this.db.insert(partnerSupplierComplianceRecords).values({
				id: crypto.randomUUID(),
				partnerId,
				recordType: record.recordType,
				title,
				issuer: nullable(record.issuer),
				referenceNo: nullable(record.referenceNo),
				issueDate: nullable(record.issueDate),
				expiryDate: nullable(record.expiryDate),
				status: record.status ?? 'pending_review',
				notes: nullable(record.notes),
				createdAt: now,
				updatedAt: now
			});
		}
	}

	private async insertAttachments(partnerId: string, attachments: SupplierAttachmentInput[], now: string) {
		for (const attachment of attachments) {
			const title = attachment.title.trim();
			if (!title) continue;
			await this.db.insert(partnerSupplierAttachments).values({
				id: crypto.randomUUID(),
				partnerId,
				attachmentType: attachment.attachmentType,
				title,
				fileName: nullable(attachment.fileName),
				fileUrl: nullable(attachment.fileUrl),
				expiryDate: nullable(attachment.expiryDate),
				notes: nullable(attachment.notes),
				createdAt: now,
				updatedAt: now
			});
		}
	}

	private async getQuotationItems(quotationIds: string[]) {
		if (quotationIds.length === 0) {
			return new Map<string, (typeof procurementSupplierQuotationItems.$inferSelect)[]>();
		}
		const rows = await this.db
			.select()
			.from(procurementSupplierQuotationItems)
			.where(
				and(
					inArray(procurementSupplierQuotationItems.quotationId, quotationIds),
					isNull(procurementSupplierQuotationItems.deletedAt)
				)
			);
		const byQuotation = new Map<string, (typeof procurementSupplierQuotationItems.$inferSelect)[]>();
		for (const row of rows) {
			const list = byQuotation.get(row.quotationId) ?? [];
			list.push(row);
			byQuotation.set(row.quotationId, list);
		}
		return byQuotation;
	}
}
