import type { ModuleContext } from '$platform/modules/types';
import { NotFoundError, ValidationError } from '$platform/modules/errors';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { AuditService } from '$platform/audit/audit-service';
import { createEvent } from '$platform/modules';
import { createInventoryApi, type InventoryApi } from '$modules/inventory';
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
import {
	procurementSupplierInvoiceLines,
	procurementSupplierInvoices
} from './repositories/supplier-invoice.schema';

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
	// PUR005 — inventory linkage used by the GRN flow.
	itemId?: string;
	warehouseId?: string;
	binLocationId?: string;
	quarantineBinId?: string;
	inspectionRequired?: boolean;
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
	// PUR005 — optional GRN inputs (override PO-line defaults when present)
	itemId?: string;
	warehouseId?: string;
	binLocationId?: string;
	quarantineBinId?: string;
	unitCost?: number;
	inspectionRequired?: boolean;
};

export type ReceiptInspectionInput = {
	decision: 'accept' | 'reject' | 'quarantine';
	acceptedQuantity?: number;
	rejectedQuantity?: number;
	reason?: string;
	notes?: string;
	returnRequired?: boolean;
};

// PUR006 — Supplier invoice 3-way matching.
export type SupplierInvoiceLineInput = {
	poItemId?: string;
	description?: string;
	itemCode?: string;
	quantityInvoiced: number;
	unitPriceInvoiced: number;
	taxCode?: TaxCode;
	notes?: string;
};

export type CreateSupplierInvoiceInput = {
	invoiceNumber: string;
	invoiceReference?: string;
	supplierId?: string;
	poId?: string;
	projectId?: string;
	invoiceDate?: string;
	receivedDate?: string;
	dueDate?: string;
	currency?: string;
	shippingAmount?: number;
	taxAmount?: number;
	dutiesAmount?: number;
	discountAmount?: number;
	subtotalAmount?: number;
	totalAmount?: number;
	notes?: string;
	lines: SupplierInvoiceLineInput[];
};

export type SupplierInvoiceDecisionInput = {
	action: 'approve' | 'reject' | 'override_approve';
	reason?: string;
};

// Price variance > IA004_PRICE_VARIANCE_THRESHOLD_PCT triggers IA004 audit
// alert and forces manual review even on otherwise matched invoices.
const IA004_PRICE_VARIANCE_THRESHOLD_PCT = 5;
// Anything within MATCH_PRICE_TOLERANCE_PCT is considered a clean match;
// between that and the IA threshold is "price_variance — review" but no IA.
const MATCH_PRICE_TOLERANCE_PCT = 1;
// Allow tiny rounding drift between invoice qty and received qty before
// flagging a qty mismatch (matches the receive tolerance UI).
const MATCH_QTY_TOLERANCE = 1e-6;

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
	private ctx: ModuleContext;
	private inventoryApi: InventoryApi | null = null;

	constructor(ctx: ModuleContext) {
		this.ctx = ctx;
		this.db = ctx.db;
		this.suppliers = new SupplierRepository(ctx.db);
		this.audit = new AuditService(ctx);
		this.user = ctx.user;
	}

	private inventory(): InventoryApi {
		if (!this.inventoryApi) this.inventoryApi = createInventoryApi(this.ctx);
		return this.inventoryApi;
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
				itemId: nullable(item.itemId),
				warehouseId: nullable(item.warehouseId),
				binLocationId: nullable(item.binLocationId),
				quarantineBinId: nullable(item.quarantineBinId),
				inspectionRequired: item.inspectionRequired ?? false,
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
		if (quantityReceived <= 0) throw new ValidationError('Receipt quantity must be greater than zero');

		// Resolve inventory linkage — receipt input overrides PO-line defaults.
		const itemId = nullable(input.itemId) ?? (item.itemId as string | null);
		const warehouseId = nullable(input.warehouseId) ?? (item.warehouseId as string | null);
		const binLocationId = nullable(input.binLocationId) ?? (item.binLocationId as string | null);
		const quarantineBinId = nullable(input.quarantineBinId) ?? (item.quarantineBinId as string | null);

		// Resolve inspection requirement: item input > PO-line flag > item master flag > supplier profile flag.
		const itemMaster = itemId ? await this.findInventoryItem(itemId) : null;
		const supplierProfile = po.supplierId ? await this.getProfileByPartnerId(po.supplierId) : null;
		const inspectionRequired =
			input.inspectionRequired ??
			((item as any).inspectionRequired as boolean | undefined) ??
			Boolean(itemMaster?.inspectionRequired) ??
			Boolean(supplierProfile?.inspectionRequired) ??
			false;

		// Over-receipt tolerance: receipts may exceed the open balance up to
		// `(quantity * (1 + tolerance/100))`. Beyond that we reject the GRN.
		const tolerancePct = Math.max(
			0,
			finiteNumber(itemMaster?.overReceiptTolerancePct, 0)
		);
		const ordered = finiteNumber(item.quantity);
		const alreadyReceived = finiteNumber(item.receivedQuantity);
		const maxReceivable = ordered * (1 + tolerancePct / 100);
		const projectedReceived = alreadyReceived + quantityReceived;
		if (projectedReceived - maxReceivable > 1e-6) {
			throw new ValidationError(
				`Receipt exceeds over-receipt tolerance: ordered ${ordered}, already received ${alreadyReceived}, this receipt ${quantityReceived}, tolerance ${tolerancePct}% (max ${maxReceivable})`
			);
		}
		const overReceiptFlag = projectedReceived - ordered > 1e-6;

		// Accepted / rejected default — when no QC required, the warehouse user
		// can split the receipt up front. When QC is required we ignore the
		// up-front split because the inspector makes that call later.
		const acceptedQuantityInput = Math.max(
			0,
			Math.min(quantityReceived, finiteNumber(input.acceptedQuantity, quantityReceived))
		);
		const rejectedQuantityInput = Math.max(
			0,
			Math.min(quantityReceived - acceptedQuantityInput, finiteNumber(input.rejectedQuantity))
		);

		// Short receipt — back-order balance after THIS receipt assuming the
		// accepted portion lands. Inspection-routed receipts treat the whole
		// receipt as in-flight (back order unchanged) until the inspector accepts.
		const provisionalReceived = inspectionRequired
			? alreadyReceived
			: Math.min(ordered, alreadyReceived + acceptedQuantityInput);
		const backOrderQuantity = Math.max(0, ordered - provisionalReceived);

		const unitCost =
			input.unitCost !== undefined
				? Math.max(0, finiteNumber(input.unitCost))
				: finiteNumber(item.unitPrice, 0);

		const receiptId = crypto.randomUUID();
		const receiptDate = nullable(input.receiptDate) ?? now.slice(0, 10);
		const receiptNumber = nullable(input.receiptNumber) ?? generatedNumber('GRN');

		// If we have a full inventory triple and inspection is NOT required,
		// stock lands directly in the receiving bin and we trigger payment.
		// If inspection IS required and a quarantine bin is provided, stock is
		// routed to that bin and waits for the inspector.
		let quarantineMovementId: string | null = null;
		let acceptanceMovementId: string | null = null;
		const canTouchInventory = Boolean(itemId && warehouseId);

		if (inspectionRequired && canTouchInventory && quarantineBinId && quantityReceived > 0) {
			const movement = await this.inventory().adjustStock({
				itemId: itemId!,
				warehouseId: warehouseId!,
				binLocationId: quarantineBinId,
				quantityDelta: quantityReceived,
				movementType: 'receipt',
				unitCost,
				referenceType: 'po_receipt_quarantine',
				referenceId: receiptId,
				notes: `GRN ${receiptNumber} pending inspection`
			});
			quarantineMovementId = movement.movementId;
		} else if (
			!inspectionRequired &&
			canTouchInventory &&
			binLocationId &&
			acceptedQuantityInput > 0
		) {
			const movement = await this.inventory().adjustStock({
				itemId: itemId!,
				warehouseId: warehouseId!,
				binLocationId,
				quantityDelta: acceptedQuantityInput,
				movementType: 'receipt',
				unitCost,
				referenceType: 'po_receipt',
				referenceId: receiptId,
				notes: `GRN ${receiptNumber} accepted on receipt`
			});
			acceptanceMovementId = movement.movementId;
		}

		const initialStatus: 'pending_inspection' | 'accepted' = inspectionRequired
			? 'pending_inspection'
			: 'accepted';
		const initialInspectionStatus: 'not_required' | 'pending' = inspectionRequired
			? 'pending'
			: 'not_required';

		const receipt = {
			id: receiptId,
			poId,
			poItemId: input.poItemId,
			receiptNumber,
			receiptDate,
			quantityReceived,
			acceptedQuantity: inspectionRequired ? 0 : acceptedQuantityInput,
			rejectedQuantity: inspectionRequired ? 0 : rejectedQuantityInput,
			backOrderQuantity,
			status: initialStatus,
			inspectionRequired,
			inspectionStatus: initialInspectionStatus,
			inspectionDecisionAt: null,
			inspectionDecisionByUserId: null,
			inspectionDecisionByEmail: null,
			inspectionNotes: null,
			rejectionReason: null,
			returnRequired: false,
			overReceiptFlag,
			itemId,
			warehouseId,
			binLocationId,
			quarantineBinId,
			unitCost,
			quarantineMovementId,
			acceptanceMovementId,
			returnMovementId: null,
			paymentTriggeredAt: null,
			paymentReference: null,
			receivedByUserId: this.user?.id ?? null,
			receivedByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(procurementPurchaseOrderReceipts).values(receipt as any);

		// Only "accepted" portion updates the PO line received_qty. Inspection-
		// routed receipts don't bump received_qty until the inspector accepts.
		await this.db
			.update(procurementPurchaseOrderItems)
			.set({
				receivedQuantity: provisionalReceived,
				backOrderedQuantity: backOrderQuantity,
				updatedAt: now
			} as any)
			.where(eq(procurementPurchaseOrderItems.id, input.poItemId));

		await this.recomputePoStatus(poId, receiptDate, now);

		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'update',
			action: inspectionRequired
				? 'purchase_order.receipt.pending_inspection'
				: 'purchase_order.receipt.recorded',
			entityType: 'purchase_order',
			entityId: poId,
			oldValue: po,
			newValue: { receipt },
			metadata: {
				poItemId: input.poItemId,
				receiptId,
				quantityReceived,
				acceptedQuantity: receipt.acceptedQuantity,
				rejectedQuantity: receipt.rejectedQuantity,
				backOrderQuantity,
				inspectionRequired,
				overReceiptFlag,
				itemId,
				warehouseId,
				quarantineBinId
			}
		});

		// Receipts that auto-accept (no QC) trigger payment immediately.
		if (!inspectionRequired && acceptedQuantityInput > 0) {
			await this.triggerPurchaseOrderPayment(poId, receiptId, {
				acceptedQuantity: acceptedQuantityInput,
				unitCost
			});
		}

		return receipt;
	}

	async recordReceiptInspection(receiptId: string, input: ReceiptInspectionInput) {
		const receipt = await this.getReceipt(receiptId);
		if (receipt.inspectionStatus !== 'pending' && receipt.inspectionStatus !== 'quarantined') {
			throw new ValidationError(
				`Receipt ${receipt.receiptNumber ?? receiptId} is not awaiting inspection (status ${receipt.inspectionStatus})`
			);
		}
		const po = await this.getPurchaseOrder(receipt.poId);
		const items = await this.getPurchaseOrderItems(receipt.poId);
		const poItem = items.find((row) => row.id === receipt.poItemId);
		if (!poItem) throw new NotFoundError('Purchase order item', receipt.poItemId);

		const now = new Date().toISOString();
		const quantityReceived = finiteNumber(receipt.quantityReceived);
		const acceptedQuantity = Math.max(
			0,
			Math.min(quantityReceived, finiteNumber(input.acceptedQuantity, quantityReceived))
		);
		const rejectedQuantity = Math.max(
			0,
			Math.min(quantityReceived - acceptedQuantity, finiteNumber(input.rejectedQuantity))
		);

		let acceptanceMovementId = receipt.acceptanceMovementId as string | null;
		let returnMovementId = receipt.returnMovementId as string | null;
		let nextStatus: 'accepted' | 'rejected' | 'quarantined' = 'accepted';
		let nextInspectionStatus: 'accepted' | 'rejected' | 'quarantined' = 'accepted';
		let returnRequired = Boolean(input.returnRequired);

		const canTouchInventory = Boolean(receipt.itemId && receipt.warehouseId);

		if (input.decision === 'accept') {
			nextStatus = 'accepted';
			nextInspectionStatus = 'accepted';
			if (canTouchInventory && acceptedQuantity > 0) {
				// If stock was previously parked in quarantine, drain it first
				// (negative quarantine movement) before crediting the receiving bin.
				if (receipt.quarantineBinId && receipt.quarantineMovementId) {
					await this.inventory().adjustStock({
						itemId: receipt.itemId!,
						warehouseId: receipt.warehouseId!,
						binLocationId: receipt.quarantineBinId,
						quantityDelta: -acceptedQuantity,
						movementType: 'transfer_out',
						unitCost: receipt.unitCost ?? undefined,
						referenceType: 'po_receipt_release',
						referenceId: receipt.id,
						notes: `GRN ${receipt.receiptNumber ?? receipt.id} accepted`
					});
				}
				if (receipt.binLocationId) {
					const movement = await this.inventory().adjustStock({
						itemId: receipt.itemId!,
						warehouseId: receipt.warehouseId!,
						binLocationId: receipt.binLocationId,
						quantityDelta: acceptedQuantity,
						movementType: receipt.quarantineMovementId ? 'transfer_in' : 'receipt',
						unitCost: receipt.unitCost ?? undefined,
						referenceType: 'po_receipt',
						referenceId: receipt.id,
						notes: `GRN ${receipt.receiptNumber ?? receipt.id} accepted into stock`
					});
					acceptanceMovementId = movement.movementId;
				}
			}
		} else if (input.decision === 'reject') {
			nextStatus = 'rejected';
			nextInspectionStatus = 'rejected';
			returnRequired = input.returnRequired ?? true;
			// Stock previously parked in quarantine must come back out (return / scrap).
			if (canTouchInventory && receipt.quarantineBinId && receipt.quarantineMovementId) {
				const movement = await this.inventory().adjustStock({
					itemId: receipt.itemId!,
					warehouseId: receipt.warehouseId!,
					binLocationId: receipt.quarantineBinId,
					quantityDelta: -quantityReceived,
					movementType: 'scrap',
					unitCost: receipt.unitCost ?? undefined,
					referenceType: 'po_receipt_return',
					referenceId: receipt.id,
					notes: `GRN ${receipt.receiptNumber ?? receipt.id} rejected${
						input.reason ? `: ${input.reason}` : ''
					}`
				});
				returnMovementId = movement.movementId;
			}
		} else {
			// quarantine — keep in quarantine bin, mark decision so it doesn't
			// block the receipt list but flag for follow-up review.
			nextStatus = 'quarantined';
			nextInspectionStatus = 'quarantined';
		}

		await this.db
			.update(procurementPurchaseOrderReceipts)
			.set({
				status: nextStatus,
				inspectionStatus: nextInspectionStatus,
				acceptedQuantity,
				rejectedQuantity,
				inspectionDecisionAt: now,
				inspectionDecisionByUserId: this.user?.id ?? null,
				inspectionDecisionByEmail: this.user?.email ?? null,
				inspectionNotes: nullable(input.notes),
				rejectionReason: nullable(input.reason),
				returnRequired,
				acceptanceMovementId,
				returnMovementId,
				updatedAt: now
			} as any)
			.where(eq(procurementPurchaseOrderReceipts.id, receiptId));

		// Bump PO line received quantity only if we just accepted stock.
		if (input.decision === 'accept' && acceptedQuantity > 0) {
			const nextReceived = Math.min(
				finiteNumber(poItem.quantity) *
					(1 + finiteNumber((await this.findInventoryItem(receipt.itemId as string | null))?.overReceiptTolerancePct, 0) / 100),
				finiteNumber(poItem.receivedQuantity) + acceptedQuantity
			);
			const nextBackOrder = Math.max(0, finiteNumber(poItem.quantity) - nextReceived);
			await this.db
				.update(procurementPurchaseOrderItems)
				.set({
					receivedQuantity: nextReceived,
					backOrderedQuantity: nextBackOrder,
					updatedAt: now
				} as any)
				.where(eq(procurementPurchaseOrderItems.id, receipt.poItemId));
		}

		await this.recomputePoStatus(receipt.poId, receipt.receiptDate as string, now);

		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'update',
			action: `purchase_order.receipt.inspection.${input.decision}`,
			entityType: 'purchase_order',
			entityId: receipt.poId,
			oldValue: receipt,
			newValue: {
				status: nextStatus,
				inspectionStatus: nextInspectionStatus,
				acceptedQuantity,
				rejectedQuantity,
				reason: input.reason ?? null
			},
			metadata: {
				receiptId,
				decision: input.decision,
				acceptedQuantity,
				rejectedQuantity,
				returnRequired
			}
		});

		if (input.decision === 'accept' && acceptedQuantity > 0) {
			await this.triggerPurchaseOrderPayment(receipt.poId, receiptId, {
				acceptedQuantity,
				unitCost: receipt.unitCost ?? undefined
			});
		}

		return this.getReceipt(receiptId);
	}

	/** Payment trigger — writes audit + event so finance/AP picks it up.
	 * In MVP there is no AP invoice module yet, so this records the trigger on
	 * the GRN and emits `purchase_order.payment.due`. */
	private async triggerPurchaseOrderPayment(
		poId: string,
		receiptId: string,
		ctx: { acceptedQuantity: number; unitCost?: number | null }
	) {
		const now = new Date().toISOString();
		const paymentReference = generatedNumber('AP');
		await this.db
			.update(procurementPurchaseOrderReceipts)
			.set({
				paymentTriggeredAt: now,
				paymentReference,
				updatedAt: now
			} as any)
			.where(eq(procurementPurchaseOrderReceipts.id, receiptId));

		const amount =
			ctx.acceptedQuantity > 0 && ctx.unitCost
				? roundMoney(ctx.acceptedQuantity * Number(ctx.unitCost))
				: null;
		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: 'purchase_order.payment.triggered',
			entityType: 'purchase_order',
			entityId: poId,
			metadata: {
				receiptId,
				paymentReference,
				acceptedQuantity: ctx.acceptedQuantity,
				unitCost: ctx.unitCost ?? null,
				amount
			}
		});
		this.ctx.eventBus?.emit(
			createEvent('purchase_order.payment.due', 'procurement', {
				poId,
				receiptId,
				paymentReference,
				acceptedQuantity: ctx.acceptedQuantity,
				unitCost: ctx.unitCost ?? null,
				amount
			})
		);
	}

	private async recomputePoStatus(poId: string, lastReceiptDate: string, now: string) {
		const refreshed = await this.getPurchaseOrderItems(poId);
		const orderedTotal = refreshed.reduce((sum, row) => sum + finiteNumber(row.quantity), 0);
		const receivedTotal = refreshed.reduce((sum, row) => sum + finiteNumber(row.receivedQuantity), 0);
		const nextStatus =
			receivedTotal >= orderedTotal && orderedTotal > 0
				? 'received'
				: receivedTotal > 0
					? 'partially_received'
					: null;
		const updates: Record<string, unknown> = {
			goodsReceiptDate: lastReceiptDate,
			updatedAt: now
		};
		if (nextStatus) updates.status = nextStatus;
		await this.db
			.update(procurementPurchaseOrders)
			.set(updates as any)
			.where(eq(procurementPurchaseOrders.id, poId));
	}

	private async getReceipt(receiptId: string) {
		const rows = await this.db
			.select()
			.from(procurementPurchaseOrderReceipts)
			.where(
				and(
					eq(procurementPurchaseOrderReceipts.id, receiptId),
					isNull(procurementPurchaseOrderReceipts.deletedAt)
				)
			)
			.limit(1);
		const receipt = rows[0];
		if (!receipt) throw new NotFoundError('PO receipt', receiptId);
		return receipt;
	}

	private async findInventoryItem(itemId: string | null) {
		if (!itemId) return null;
		try {
			const detail = await this.inventory().getItemDetail(itemId);
			return detail.item as any;
		} catch (err) {
			if (err instanceof NotFoundError) return null;
			throw err;
		}
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

	// ──────────────────────────────────────────────────────────────────────
	// PUR006 — Supplier invoice + 3-way matching
	// ──────────────────────────────────────────────────────────────────────

	async listSupplierInvoices() {
		const invoices = await this.db
			.select()
			.from(procurementSupplierInvoices)
			.where(isNull(procurementSupplierInvoices.deletedAt))
			.orderBy(desc(procurementSupplierInvoices.createdAt));
		if (invoices.length === 0) return [];
		const suppliers = await this.listSuppliers();
		const supplierById = new Map(suppliers.map((s) => [s.id, s]));
		const lineRows = await this.db
			.select()
			.from(procurementSupplierInvoiceLines)
			.where(
				and(
					inArray(
						procurementSupplierInvoiceLines.invoiceId,
						invoices.map((i) => i.id)
					),
					isNull(procurementSupplierInvoiceLines.deletedAt)
				)
			);
		const linesByInvoice = new Map<string, (typeof procurementSupplierInvoiceLines.$inferSelect)[]>();
		for (const row of lineRows) {
			const list = linesByInvoice.get(row.invoiceId) ?? [];
			list.push(row);
			linesByInvoice.set(row.invoiceId, list);
		}
		return invoices.map((inv) => ({
			...inv,
			supplier: inv.supplierId ? supplierById.get(inv.supplierId) ?? null : null,
			lines: linesByInvoice.get(inv.id) ?? []
		}));
	}

	async getSupplierInvoiceDetail(id: string) {
		const rows = await this.db
			.select()
			.from(procurementSupplierInvoices)
			.where(
				and(
					eq(procurementSupplierInvoices.id, id),
					isNull(procurementSupplierInvoices.deletedAt)
				)
			)
			.limit(1);
		const invoice = rows[0];
		if (!invoice) throw new NotFoundError('Supplier invoice', id);
		const lines = await this.db
			.select()
			.from(procurementSupplierInvoiceLines)
			.where(
				and(
					eq(procurementSupplierInvoiceLines.invoiceId, id),
					isNull(procurementSupplierInvoiceLines.deletedAt)
				)
			)
			.orderBy(procurementSupplierInvoiceLines.createdAt);
		const supplier = invoice.supplierId
			? (await this.listSuppliers()).find((s) => s.id === invoice.supplierId) ?? null
			: null;
		const po = invoice.poId
			? (await this.db
					.select()
					.from(procurementPurchaseOrders)
					.where(eq(procurementPurchaseOrders.id, invoice.poId))
					.limit(1))[0] ?? null
			: null;
		return { invoice, lines, supplier, purchaseOrder: po };
	}

	async createSupplierInvoice(input: CreateSupplierInvoiceInput) {
		const invoiceNumber = input.invoiceNumber?.trim();
		if (!invoiceNumber) throw new ValidationError('Supplier invoice number is required');
		if (!input.lines || input.lines.length === 0) {
			throw new ValidationError('Supplier invoice must have at least one line');
		}

		const now = new Date().toISOString();
		const invoiceId = crypto.randomUUID();
		const invoiceReference = nullable(input.invoiceReference) ?? generatedNumber('SI');
		const subtotalAmount = input.lines.reduce(
			(sum, line) =>
				sum + roundMoney(finiteNumber(line.quantityInvoiced) * finiteNumber(line.unitPriceInvoiced)),
			0
		);
		const shippingAmount = Math.max(0, finiteNumber(input.shippingAmount));
		const taxAmount = Math.max(0, finiteNumber(input.taxAmount));
		const dutiesAmount = Math.max(0, finiteNumber(input.dutiesAmount));
		const discountAmount = Math.max(0, finiteNumber(input.discountAmount));
		const totalAmount = roundMoney(
			subtotalAmount + shippingAmount + taxAmount + dutiesAmount - discountAmount
		);

		// We need the supplier on the PO to validate ownership when both are
		// provided — refuse mismatches up front rather than surface a confusing
		// "no_po" downstream.
		let supplierId = nullable(input.supplierId);
		if (input.poId) {
			const po = await this.getPurchaseOrder(input.poId);
			if (supplierId && po.supplierId && supplierId !== po.supplierId) {
				throw new ValidationError('Invoice supplier does not match PO supplier');
			}
			supplierId = supplierId ?? po.supplierId;
		}

		await this.db.insert(procurementSupplierInvoices).values({
			id: invoiceId,
			invoiceNumber,
			invoiceReference,
			supplierId: supplierId ?? null,
			poId: nullable(input.poId),
			projectId: nullable(input.projectId),
			invoiceDate: nullable(input.invoiceDate) ?? now.slice(0, 10),
			receivedDate: nullable(input.receivedDate) ?? now.slice(0, 10),
			dueDate: nullable(input.dueDate),
			currency: nullable(input.currency) ?? 'SGD',
			subtotalAmount: input.subtotalAmount ?? subtotalAmount,
			shippingAmount,
			taxAmount,
			dutiesAmount,
			discountAmount,
			totalAmount: input.totalAmount ?? totalAmount,
			matchStatus: 'unmatched',
			status: 'pending_match',
			approvalStatus: 'pending_review',
			createdByUserId: this.user?.id ?? null,
			createdByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		} as any);

		for (const line of input.lines) {
			const quantityInvoiced = Math.max(0, finiteNumber(line.quantityInvoiced));
			const unitPriceInvoiced = Math.max(0, finiteNumber(line.unitPriceInvoiced));
			const lineSubtotal = roundMoney(quantityInvoiced * unitPriceInvoiced);
			const description = (line.description ?? line.itemCode ?? '').trim() || 'Line item';
			await this.db.insert(procurementSupplierInvoiceLines).values({
				id: crypto.randomUUID(),
				invoiceId,
				poItemId: nullable(line.poItemId),
				receiptId: null,
				description,
				itemCode: nullable(line.itemCode),
				quantityInvoiced,
				unitPriceInvoiced,
				lineSubtotal,
				taxCode: line.taxCode ?? null,
				poUnitPrice: null,
				poQuantityOrdered: null,
				quantityReceivedMatched: 0,
				quantityPreviouslyInvoiced: 0,
				priceVariancePct: null,
				qtyVariance: null,
				lineMatchStatus: 'unmatched',
				iaExceptionCode: null,
				approvalOverride: false,
				approvalOverrideReason: null,
				notes: nullable(line.notes),
				createdAt: now,
				updatedAt: now
			} as any);
		}

		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: 'supplier_invoice.created',
			entityType: 'supplier_invoice',
			entityId: invoiceId,
			metadata: {
				invoiceNumber,
				invoiceReference,
				supplierId,
				poId: input.poId ?? null,
				totalAmount
			}
		});

		// Immediately try a 3-way match so the user sees the verdict on the
		// detail page. Auto-approval only happens when all lines clean-match.
		await this.runThreeWayMatch(invoiceId);
		return this.getSupplierInvoiceDetail(invoiceId);
	}

	/** Recomputes the per-line + header match verdict for an invoice. Safe to
	 * call repeatedly — wipes prior IA004 flags and re-derives from PO + GRN
	 * snapshots. */
	private async runThreeWayMatch(invoiceId: string) {
		const detail = await this.getSupplierInvoiceDetail(invoiceId);
		const { invoice, lines } = detail;
		const now = new Date().toISOString();

		// Cache PO items + receipts for the lines we will touch.
		const poItemIds = lines.map((l) => l.poItemId).filter(Boolean) as string[];
		const poItemsById = new Map<string, typeof procurementPurchaseOrderItems.$inferSelect>();
		const receiptsByPoItem = new Map<
			string,
			(typeof procurementPurchaseOrderReceipts.$inferSelect)[]
		>();
		if (poItemIds.length > 0) {
			const poItemRows = await this.db
				.select()
				.from(procurementPurchaseOrderItems)
				.where(
					and(
						inArray(procurementPurchaseOrderItems.id, poItemIds),
						isNull(procurementPurchaseOrderItems.deletedAt)
					)
				);
			for (const row of poItemRows) poItemsById.set(row.id, row);
			const receiptRows = await this.db
				.select()
				.from(procurementPurchaseOrderReceipts)
				.where(
					and(
						inArray(procurementPurchaseOrderReceipts.poItemId, poItemIds),
						isNull(procurementPurchaseOrderReceipts.deletedAt)
					)
				);
			for (const row of receiptRows) {
				const list = receiptsByPoItem.get(row.poItemId) ?? [];
				list.push(row);
				receiptsByPoItem.set(row.poItemId, list);
			}
		}

		// Compute how much was already invoiced on each PO item (excluding this
		// invoice) so partial deliveries split across invoices match cleanly.
		const previouslyInvoicedByPoItem = await this.computePreviouslyInvoiced(
			poItemIds,
			invoiceId
		);

		let maxPriceVariancePct = 0;
		let anyIa004 = false;
		const lineVerdicts: Array<{
			lineId: string;
			status: typeof procurementSupplierInvoiceLines.$inferSelect.lineMatchStatus;
			priceVariancePct: number | null;
			qtyVariance: number | null;
			receiptId: string | null;
			poUnitPrice: number | null;
			poQuantityOrdered: number | null;
			quantityReceivedMatched: number;
			quantityPreviouslyInvoiced: number;
			iaExceptionCode: string | null;
		}> = [];

		for (const line of lines) {
			const quantityInvoiced = finiteNumber(line.quantityInvoiced);
			const unitPriceInvoiced = finiteNumber(line.unitPriceInvoiced);
			const poItem = line.poItemId ? poItemsById.get(line.poItemId) ?? null : null;

			if (!poItem) {
				lineVerdicts.push({
					lineId: line.id,
					status: invoice.poId ? 'no_po' : 'unmatched',
					priceVariancePct: null,
					qtyVariance: null,
					receiptId: null,
					poUnitPrice: null,
					poQuantityOrdered: null,
					quantityReceivedMatched: 0,
					quantityPreviouslyInvoiced: 0,
					iaExceptionCode: null
				});
				continue;
			}

			const poUnitPrice = finiteNumber(poItem.unitPrice);
			const poQuantityOrdered = finiteNumber(poItem.quantity);
			const acceptedReceipts = (receiptsByPoItem.get(poItem.id) ?? []).filter(
				(r) => r.status === 'accepted' || r.inspectionStatus === 'accepted'
			);
			const quantityReceivedMatched = acceptedReceipts.reduce(
				(sum, r) => sum + finiteNumber(r.acceptedQuantity),
				0
			);
			const quantityPreviouslyInvoiced = previouslyInvoicedByPoItem.get(poItem.id) ?? 0;
			const matchedReceipt = acceptedReceipts[acceptedReceipts.length - 1] ?? null;

			// Price variance — compute against PO unit price. Zero PO price is
			// treated as "no price to compare" so a brand new line shows as
			// price_variance instead of dividing by zero.
			const priceVariancePct =
				poUnitPrice > 0
					? roundScore(((unitPriceInvoiced - poUnitPrice) / poUnitPrice) * 100)
					: null;
			const absVariance = priceVariancePct !== null ? Math.abs(priceVariancePct) : Infinity;
			if (priceVariancePct !== null && absVariance > maxPriceVariancePct) {
				maxPriceVariancePct = absVariance;
			}

			// Qty check — does the invoiced qty fit inside the unbilled accepted
			// qty? Over-invoice means accepted < invoiced + previously invoiced.
			const unbilledReceived = quantityReceivedMatched - quantityPreviouslyInvoiced;
			const qtyVariance = roundMoney(quantityInvoiced - Math.max(0, unbilledReceived));

			let status: typeof procurementSupplierInvoiceLines.$inferSelect.lineMatchStatus = 'matched';
			let iaExceptionCode: string | null = null;

			if (quantityReceivedMatched <= MATCH_QTY_TOLERANCE) {
				status = 'missing_grn';
			} else if (qtyVariance > MATCH_QTY_TOLERANCE) {
				// Invoicing more than was received — could be over-invoice (line)
				// or qty mismatch (header). Distinguish for the chip.
				status = quantityInvoiced > quantityReceivedMatched ? 'over_invoiced' : 'qty_mismatch';
			} else if (priceVariancePct === null) {
				status = 'price_variance';
			} else if (absVariance > IA004_PRICE_VARIANCE_THRESHOLD_PCT) {
				status = 'price_variance';
				iaExceptionCode = 'IA004';
				anyIa004 = true;
			} else if (absVariance > MATCH_PRICE_TOLERANCE_PCT) {
				status = 'price_variance';
			}

			lineVerdicts.push({
				lineId: line.id,
				status,
				priceVariancePct,
				qtyVariance,
				receiptId: matchedReceipt?.id ?? null,
				poUnitPrice,
				poQuantityOrdered,
				quantityReceivedMatched,
				quantityPreviouslyInvoiced,
				iaExceptionCode
			});
		}

		// Persist line verdicts.
		for (const verdict of lineVerdicts) {
			await this.db
				.update(procurementSupplierInvoiceLines)
				.set({
					receiptId: verdict.receiptId,
					poUnitPrice: verdict.poUnitPrice,
					poQuantityOrdered: verdict.poQuantityOrdered,
					quantityReceivedMatched: verdict.quantityReceivedMatched,
					quantityPreviouslyInvoiced: verdict.quantityPreviouslyInvoiced,
					priceVariancePct: verdict.priceVariancePct,
					qtyVariance: verdict.qtyVariance,
					lineMatchStatus: verdict.status,
					iaExceptionCode: verdict.iaExceptionCode,
					updatedAt: now
				} as any)
				.where(eq(procurementSupplierInvoiceLines.id, verdict.lineId));
		}

		// Roll line verdicts up to a header status.
		const headerMatch = this.summarizeMatch(lineVerdicts.map((v) => v.status));
		const allMatched = lineVerdicts.length > 0 && lineVerdicts.every((v) => v.status === 'matched');
		const nextStatus = allMatched ? 'matched' : 'pending_match';
		const nextApproval = allMatched && !anyIa004 ? 'auto_approved' : 'pending_review';
		const headerUpdates = {
			matchStatus: headerMatch,
			status: nextStatus,
			approvalStatus: nextApproval,
			iaExceptionCode: anyIa004 ? 'IA004' : null,
			iaExceptionReason: anyIa004
				? `Price variance exceeds ${IA004_PRICE_VARIANCE_THRESHOLD_PCT}% on at least one line vs PO`
				: null,
			maxPriceVariancePct: maxPriceVariancePct === 0 ? null : maxPriceVariancePct,
			approvedAt: allMatched && !anyIa004 ? now : invoice.approvedAt,
			approvedByUserId:
				allMatched && !anyIa004 ? this.user?.id ?? null : invoice.approvedByUserId,
			approvedByEmail:
				allMatched && !anyIa004 ? this.user?.email ?? null : invoice.approvedByEmail,
			updatedAt: now
		};
		await this.db
			.update(procurementSupplierInvoices)
			.set(headerUpdates as any)
			.where(eq(procurementSupplierInvoices.id, invoiceId));

		if (anyIa004) {
			await this.audit.writeLog({
				module: 'procurement',
				actionType: 'permission_change',
				action: 'supplier_invoice.alert.ia004',
				entityType: 'supplier_invoice',
				entityId: invoiceId,
				metadata: {
					invoiceReference: invoice.invoiceReference,
					maxPriceVariancePct,
					thresholdPct: IA004_PRICE_VARIANCE_THRESHOLD_PCT,
					poId: invoice.poId
				}
			});
		}

		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'update',
			action: 'supplier_invoice.match.evaluated',
			entityType: 'supplier_invoice',
			entityId: invoiceId,
			metadata: {
				matchStatus: headerMatch,
				approvalStatus: nextApproval,
				maxPriceVariancePct,
				iaExceptionCode: anyIa004 ? 'IA004' : null,
				lineVerdicts: lineVerdicts.map((v) => ({
					lineId: v.lineId,
					status: v.status,
					priceVariancePct: v.priceVariancePct,
					qtyVariance: v.qtyVariance
				}))
			}
		});

		// Auto-approval shortcut: trigger payment immediately so AP / finance
		// can pick the payable up without a reviewer touching it.
		if (allMatched && !anyIa004) {
			await this.triggerSupplierInvoicePayment(invoiceId);
		}
	}

	async recordSupplierInvoiceDecision(
		invoiceId: string,
		input: SupplierInvoiceDecisionInput
	) {
		const detail = await this.getSupplierInvoiceDetail(invoiceId);
		const invoice = detail.invoice;
		const now = new Date().toISOString();

		if (invoice.status === 'paid' || invoice.status === 'cancelled') {
			throw new ValidationError(`Invoice already ${invoice.status}`);
		}

		// override_approve = "I know there is a variance, approve anyway".
		// reject closes the invoice; approve only allowed when matched.
		if (input.action === 'approve') {
			if (invoice.matchStatus !== 'matched') {
				throw new ValidationError(
					`Invoice match status is ${invoice.matchStatus}; use override_approve to bypass review`
				);
			}
			await this.db
				.update(procurementSupplierInvoices)
				.set({
					status: 'approved',
					approvalStatus: 'approved',
					approvedByUserId: this.user?.id ?? null,
					approvedByEmail: this.user?.email ?? null,
					approvedAt: now,
					updatedAt: now
				} as any)
				.where(eq(procurementSupplierInvoices.id, invoiceId));
			await this.audit.writeLog({
				module: 'procurement',
				actionType: 'update',
				action: 'supplier_invoice.approved',
				entityType: 'supplier_invoice',
				entityId: invoiceId,
				metadata: { reason: input.reason ?? null }
			});
			await this.triggerSupplierInvoicePayment(invoiceId);
		} else if (input.action === 'override_approve') {
			const reason = nullable(input.reason);
			if (!reason) {
				throw new ValidationError('Override approval requires a reason');
			}
			await this.db
				.update(procurementSupplierInvoices)
				.set({
					status: 'approved',
					approvalStatus: 'approved',
					approvedByUserId: this.user?.id ?? null,
					approvedByEmail: this.user?.email ?? null,
					approvedAt: now,
					notes: invoice.notes
						? `${invoice.notes}\n[override approval] ${reason}`
						: `[override approval] ${reason}`,
					updatedAt: now
				} as any)
				.where(eq(procurementSupplierInvoices.id, invoiceId));
			await this.audit.writeLog({
				module: 'procurement',
				actionType: 'update',
				action: 'supplier_invoice.override_approved',
				entityType: 'supplier_invoice',
				entityId: invoiceId,
				metadata: {
					reason,
					matchStatus: invoice.matchStatus,
					iaExceptionCode: invoice.iaExceptionCode
				}
			});
			await this.triggerSupplierInvoicePayment(invoiceId);
		} else if (input.action === 'reject') {
			const reason = nullable(input.reason);
			if (!reason) throw new ValidationError('Rejection requires a reason');
			await this.db
				.update(procurementSupplierInvoices)
				.set({
					status: 'rejected',
					approvalStatus: 'rejected',
					rejectionReason: reason,
					updatedAt: now
				} as any)
				.where(eq(procurementSupplierInvoices.id, invoiceId));
			await this.audit.writeLog({
				module: 'procurement',
				actionType: 'update',
				action: 'supplier_invoice.rejected',
				entityType: 'supplier_invoice',
				entityId: invoiceId,
				metadata: { reason, matchStatus: invoice.matchStatus }
			});
		}
		return this.getSupplierInvoiceDetail(invoiceId);
	}

	async runSupplierInvoiceRematch(invoiceId: string) {
		await this.runThreeWayMatch(invoiceId);
		return this.getSupplierInvoiceDetail(invoiceId);
	}

	private async triggerSupplierInvoicePayment(invoiceId: string) {
		const detail = await this.getSupplierInvoiceDetail(invoiceId);
		const invoice = detail.invoice;
		if (invoice.paymentTriggeredAt) return;
		const now = new Date().toISOString();
		// Reuse the GRN payment reference when we have one — keeps the audit
		// trail joinable across PUR005 + PUR006. Otherwise mint a fresh AP-...
		// reference so AP still has a key to hang the payable off.
		const grnPaymentReference =
			detail.lines.find((l) => l.receiptId)?.receiptId
				? (
						await this.db
							.select({ ref: procurementPurchaseOrderReceipts.paymentReference })
							.from(procurementPurchaseOrderReceipts)
							.where(
								eq(
									procurementPurchaseOrderReceipts.id,
									detail.lines.find((l) => l.receiptId)?.receiptId as string
								)
							)
							.limit(1)
				  )[0]?.ref ?? null
				: null;
		const paymentReference = grnPaymentReference ?? generatedNumber('AP');

		await this.db
			.update(procurementSupplierInvoices)
			.set({
				paymentReference,
				paymentTriggeredAt: now,
				updatedAt: now
			} as any)
			.where(eq(procurementSupplierInvoices.id, invoiceId));

		await this.audit.writeLog({
			module: 'procurement',
			actionType: 'create',
			action: 'supplier_invoice.payment.triggered',
			entityType: 'supplier_invoice',
			entityId: invoiceId,
			metadata: {
				invoiceReference: invoice.invoiceReference,
				paymentReference,
				totalAmount: invoice.totalAmount,
				supplierId: invoice.supplierId
			}
		});

		this.ctx.eventBus?.emit(
			createEvent('supplier_invoice.approved.for_payment', 'procurement', {
				invoiceId,
				invoiceNumber: invoice.invoiceNumber,
				invoiceReference: invoice.invoiceReference,
				paymentReference,
				supplierId: invoice.supplierId,
				poId: invoice.poId,
				totalAmount: invoice.totalAmount,
				currency: invoice.currency,
				dueDate: invoice.dueDate
			})
		);
	}

	private async computePreviouslyInvoiced(poItemIds: string[], excludeInvoiceId: string) {
		const map = new Map<string, number>();
		if (poItemIds.length === 0) return map;
		// Sum lines from invoices that are not rejected / cancelled and not the
		// invoice we are currently re-matching.
		const peers = await this.db
			.select({
				poItemId: procurementSupplierInvoiceLines.poItemId,
				quantityInvoiced: procurementSupplierInvoiceLines.quantityInvoiced,
				invoiceId: procurementSupplierInvoiceLines.invoiceId,
				invoiceStatus: procurementSupplierInvoices.status
			})
			.from(procurementSupplierInvoiceLines)
			.innerJoin(
				procurementSupplierInvoices,
				eq(procurementSupplierInvoiceLines.invoiceId, procurementSupplierInvoices.id)
			)
			.where(
				and(
					inArray(procurementSupplierInvoiceLines.poItemId, poItemIds),
					isNull(procurementSupplierInvoiceLines.deletedAt),
					isNull(procurementSupplierInvoices.deletedAt)
				)
			);
		for (const row of peers) {
			if (!row.poItemId) continue;
			if (row.invoiceId === excludeInvoiceId) continue;
			if (row.invoiceStatus === 'rejected' || row.invoiceStatus === 'cancelled') continue;
			map.set(row.poItemId, (map.get(row.poItemId) ?? 0) + finiteNumber(row.quantityInvoiced));
		}
		return map;
	}

	private summarizeMatch(
		statuses: Array<typeof procurementSupplierInvoiceLines.$inferSelect.lineMatchStatus>
	): typeof procurementSupplierInvoices.$inferSelect.matchStatus {
		if (statuses.length === 0) return 'unmatched';
		if (statuses.every((s) => s === 'matched')) return 'matched';
		if (statuses.some((s) => s === 'no_po')) return 'no_po';
		if (statuses.some((s) => s === 'missing_grn')) return 'missing_grn';
		if (statuses.some((s) => s === 'price_variance')) return 'price_variance';
		if (statuses.some((s) => s === 'qty_mismatch' || s === 'over_invoiced')) return 'qty_mismatch';
		return 'unmatched';
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
