import type { ModuleContext } from '$platform/modules/types';
import { NotFoundError, ValidationError } from '$platform/modules/errors';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { AuditService } from '$platform/audit/audit-service';
import { createEvent } from '$platform/modules';
import { createInventoryApi, type InventoryApi } from '$modules/inventory';
import { CustomerRepository } from './repository';
import {
	customerPriceListItems,
	customerPriceLists,
	partnerCustomerAttachments,
	partnerCustomerCommunications,
	partnerCustomerContacts,
	partnerCustomerProfiles
} from './repositories/customer.schema';
import {
	salesOrderItems,
	salesOrderShipments,
	salesOrders,
	salesQuotationItems,
	salesQuotations
} from './repositories/sales-order.schema';

type TaxCode = 'SR' | 'ZR' | 'ES' | 'OP';
type CustomerStatus = 'active' | 'on_hold' | 'blacklisted';
type GstRegistrationStatus = 'registered' | 'not_registered' | 'exempt' | 'unknown';

// IA002 — any sales order whose overall discount exceeds this percentage requires
// director approval before it can be confirmed; it is flagged as a revenue risk.
const IA002_DISCOUNT_THRESHOLD_PCT = 20;

type CustomerProfileInput = {
	customerStatus?: CustomerStatus;
	customerTier?: string;
	gstRegistrationStatus?: GstRegistrationStatus;
	taxCode?: TaxCode;
	billingAddress?: string;
	shippingAddress?: string;
	billingTerms?: string;
	creditTerms?: string;
	creditLimit?: number;
	preferredCurrency?: string;
};

type CreateCustomerInput = {
	name: string;
	address?: string;
	contact?: string;
	gstRegNo?: string;
	registrationNo?: string;
	country?: string;
	currency?: string;
	metadata?: string;
	profile?: CustomerProfileInput;
};

type SalesLineInput = {
	itemId?: string;
	itemCode?: string;
	description: string;
	quantity?: number;
	uom?: string;
	unitPrice?: number;
	discountPct?: number;
	taxCode?: TaxCode;
	warehouseId?: string;
	binLocationId?: string;
	notes?: string;
};

export type CreateQuotationInput = {
	quoteNumber?: string;
	customerId: string;
	projectId?: string;
	quoteDate?: string;
	validUntil?: string;
	currency?: string;
	taxCode?: TaxCode;
	discountPct?: number;
	taxAmount?: number;
	notes?: string;
	items: SalesLineInput[];
};

export type CreateSalesOrderInput = {
	orderNumber?: string;
	sourceType?: 'manual' | 'quotation';
	quotationId?: string;
	customerId: string;
	projectId?: string;
	orderDate?: string;
	requestedDeliveryDate?: string;
	currency?: string;
	taxCode?: TaxCode;
	billingAddress?: string;
	shippingAddress?: string;
	discountPct?: number;
	shippingAmount?: number;
	taxAmount?: number;
	notes?: string;
	items: SalesLineInput[];
};

export type SalesOrderApprovalInput = {
	action: 'approve' | 'reject';
	reason?: string;
};

export type SalesOrderShipmentInput = {
	orderItemId: string;
	quantityShipped: number;
	shipmentNumber?: string;
	shipmentDate?: string;
	trackingReference?: string;
	notes?: string;
};

function nullable(value?: string | null) {
	if (value === undefined || value === null) return null;
	const trimmed = String(value).trim();
	return trimmed ? trimmed : null;
}

function finiteNumber(value: unknown, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value: number) {
	return Math.round(value * 100) / 100;
}

function generatedNumber(prefix: string) {
	const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
	const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
	return `${prefix}-${stamp}-${suffix}`;
}

type NormalizedLine = {
	id: string;
	itemId: string | null;
	itemCode: string | null;
	description: string;
	quantity: number;
	uom: string;
	unitPrice: number;
	discountPct: number;
	lineGross: number;
	lineSubtotal: number;
	taxCode: TaxCode | null;
	warehouseId: string | null;
	binLocationId: string | null;
	notes: string | null;
};

function normalizeLines(input: SalesLineInput[]): NormalizedLine[] {
	return input
		.filter((line) => line.description?.trim())
		.map((line) => {
			const quantity = Math.max(0, finiteNumber(line.quantity, 1));
			const unitPrice = Math.max(0, finiteNumber(line.unitPrice));
			const discountPct = Math.min(100, Math.max(0, finiteNumber(line.discountPct)));
			const lineGross = roundMoney(quantity * unitPrice);
			const lineSubtotal = roundMoney(lineGross * (1 - discountPct / 100));
			return {
				id: crypto.randomUUID(),
				itemId: nullable(line.itemId),
				itemCode: nullable(line.itemCode),
				description: line.description.trim(),
				quantity,
				uom: nullable(line.uom) ?? 'unit',
				unitPrice,
				discountPct,
				lineGross,
				lineSubtotal,
				taxCode: line.taxCode ?? null,
				warehouseId: nullable(line.warehouseId),
				binLocationId: nullable(line.binLocationId),
				notes: nullable(line.notes)
			};
		});
}

export class SalesCrmService {
	private customers: CustomerRepository;
	private db: ModuleContext['db'];
	private audit: AuditService;
	private user: ModuleContext['user'];
	private ctx: ModuleContext;
	private inventoryApi: InventoryApi | null = null;

	constructor(ctx: ModuleContext) {
		this.ctx = ctx;
		this.db = ctx.db;
		this.customers = new CustomerRepository(ctx.db);
		this.audit = new AuditService(ctx);
		this.user = ctx.user;
	}

	private inventory(): InventoryApi {
		if (!this.inventoryApi) this.inventoryApi = createInventoryApi(this.ctx);
		return this.inventoryApi;
	}

	// ------------------------- Customer master -------------------------

	async getCustomerById(id: string) {
		return this.customers.findById(id);
	}

	async listCustomers() {
		const rows = await this.customers.findAll();
		const profiles = await this.getProfiles(rows.map((r) => r.id));
		return rows.map((customer) => ({ ...customer, profile: profiles.get(customer.id) ?? null }));
	}

	async listCustomerOptions() {
		return this.customers.listOptions();
	}

	async listCustomerDirectory() {
		return this.customers.listDirectory();
	}

	private async getProfiles(partnerIds: string[]) {
		const ids = partnerIds.filter(Boolean);
		const map = new Map<string, typeof partnerCustomerProfiles.$inferSelect>();
		if (ids.length === 0) return map;
		const rows = await this.db
			.select()
			.from(partnerCustomerProfiles)
			.where(
				and(
					inArray(partnerCustomerProfiles.partnerId, ids),
					isNull(partnerCustomerProfiles.deletedAt)
				)
			);
		for (const row of rows) map.set(row.partnerId, row);
		return map;
	}

	async getProfileByPartnerId(partnerId: string) {
		const map = await this.getProfiles([partnerId]);
		return map.get(partnerId) ?? null;
	}

	async getCustomerDetail(id: string) {
		const customer = await this.customers.findById(id);
		if (!customer) throw new NotFoundError('Customer', id);
		const [profile, contacts, communications, attachments, priceLists] = await Promise.all([
			this.getProfileByPartnerId(id),
			this.db
				.select()
				.from(partnerCustomerContacts)
				.where(
					and(eq(partnerCustomerContacts.partnerId, id), isNull(partnerCustomerContacts.deletedAt))
				)
				.orderBy(desc(partnerCustomerContacts.isPrimary)),
			this.db
				.select()
				.from(partnerCustomerCommunications)
				.where(
					and(
						eq(partnerCustomerCommunications.partnerId, id),
						isNull(partnerCustomerCommunications.deletedAt)
					)
				)
				.orderBy(desc(partnerCustomerCommunications.occurredAt)),
			this.db
				.select()
				.from(partnerCustomerAttachments)
				.where(
					and(
						eq(partnerCustomerAttachments.partnerId, id),
						isNull(partnerCustomerAttachments.deletedAt)
					)
				)
				.orderBy(desc(partnerCustomerAttachments.createdAt)),
			this.listPriceLists(id)
		]);
		return { customer, profile, contacts, communications, attachments, priceLists };
	}

	async createCustomer(data: CreateCustomerInput) {
		const name = data.name?.trim();
		if (!name) throw new ValidationError('Customer name is required');
		const { id } = await this.customers.create({
			name,
			address: nullable(data.address),
			contact: nullable(data.contact),
			gstRegNo: nullable(data.gstRegNo),
			metadata: nullable(data.metadata)
		});
		if (data.registrationNo || data.country || data.currency) {
			await this.customers.update(id, {
				registrationNo: nullable(data.registrationNo),
				country: nullable(data.country),
				currency: nullable(data.currency)
			});
		}
		if (data.profile) await this.upsertCustomerProfile(id, data.profile);
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'create',
			action: 'customer.created',
			entityType: 'customer',
			entityId: id,
			metadata: { name }
		});
		return { id };
	}

	async updateCustomer(
		id: string,
		data: Partial<{
			name: string;
			address: string;
			contact: string;
			gstRegNo: string;
			registrationNo: string;
			country: string;
			currency: string;
		}>,
		profile?: CustomerProfileInput
	) {
		const existing = await this.customers.findById(id);
		if (!existing) throw new NotFoundError('Customer', id);
		await this.customers.update(id, {
			...(data.name !== undefined ? { name: data.name.trim() } : {}),
			...(data.address !== undefined ? { address: nullable(data.address) } : {}),
			...(data.contact !== undefined ? { contact: nullable(data.contact) } : {}),
			...(data.gstRegNo !== undefined ? { gstRegNo: nullable(data.gstRegNo) } : {}),
			...(data.registrationNo !== undefined
				? { registrationNo: nullable(data.registrationNo) }
				: {}),
			...(data.country !== undefined ? { country: nullable(data.country) } : {}),
			...(data.currency !== undefined ? { currency: nullable(data.currency) } : {})
		});
		if (profile) await this.upsertCustomerProfile(id, profile);
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: 'customer.updated',
			entityType: 'customer',
			entityId: id,
			metadata: { id }
		});
		return { id };
	}

	async deleteCustomer(id: string) {
		const customer = await this.customers.findById(id);
		if (!customer) throw new NotFoundError('Customer', id);
		await this.customers.softDelete(id);
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'delete',
			action: 'customer.deleted',
			entityType: 'customer',
			entityId: id
		});
	}

	// ------------------------- Profile & credit -------------------------

	async upsertCustomerProfile(partnerId: string, input: CustomerProfileInput) {
		const existing = await this.getProfileByPartnerId(partnerId);
		const now = new Date().toISOString();
		const patch = {
			customerStatus: input.customerStatus ?? existing?.customerStatus ?? 'active',
			customerTier: input.customerTier ?? existing?.customerTier ?? null,
			gstRegistrationStatus:
				input.gstRegistrationStatus ?? existing?.gstRegistrationStatus ?? 'unknown',
			taxCode: input.taxCode ?? existing?.taxCode ?? null,
			billingAddress: nullable(input.billingAddress) ?? existing?.billingAddress ?? null,
			shippingAddress: nullable(input.shippingAddress) ?? existing?.shippingAddress ?? null,
			billingTerms: nullable(input.billingTerms) ?? existing?.billingTerms ?? null,
			creditTerms: nullable(input.creditTerms) ?? existing?.creditTerms ?? null,
			creditLimit:
				input.creditLimit !== undefined
					? String(Math.max(0, finiteNumber(input.creditLimit)))
					: (existing?.creditLimit ?? null),
			preferredCurrency:
				nullable(input.preferredCurrency) ?? existing?.preferredCurrency ?? 'SGD'
		};
		if (existing) {
			await this.db
				.update(partnerCustomerProfiles)
				.set({ ...patch, updatedAt: now } as any)
				.where(eq(partnerCustomerProfiles.id, existing.id));
			return { id: existing.id };
		}
		const id = crypto.randomUUID();
		await this.db.insert(partnerCustomerProfiles).values({
			id,
			partnerId,
			...patch,
			creditHoldFlag: false,
			creditHoldReason: null,
			createdAt: now,
			updatedAt: now
		} as any);
		return { id };
	}

	async setCreditHold(partnerId: string, input: { hold: boolean; reason?: string }) {
		const existing = await this.getProfileByPartnerId(partnerId);
		const now = new Date().toISOString();
		if (!existing) {
			await this.upsertCustomerProfile(partnerId, {});
		}
		const profile = existing ?? (await this.getProfileByPartnerId(partnerId))!;
		await this.db
			.update(partnerCustomerProfiles)
			.set({
				creditHoldFlag: input.hold,
				creditHoldReason: input.hold ? nullable(input.reason) : null,
				updatedAt: now
			} as any)
			.where(eq(partnerCustomerProfiles.id, profile.id));
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: input.hold ? 'customer.credit_hold.set' : 'customer.credit_hold.cleared',
			entityType: 'customer',
			entityId: partnerId,
			metadata: { hold: input.hold, reason: input.reason ?? null }
		});
		return { partnerId, creditHoldFlag: input.hold };
	}

	// ------------------------- Contacts -------------------------

	async addCustomerContact(
		partnerId: string,
		input: { name: string; phoneEmail?: string; position?: string; isPrimary?: boolean; notes?: string }
	) {
		const customer = await this.customers.findById(partnerId);
		if (!customer) throw new NotFoundError('Customer', partnerId);
		if (!input.name?.trim()) throw new ValidationError('Contact name is required');
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.insert(partnerCustomerContacts).values({
			id,
			partnerId,
			name: input.name.trim(),
			phoneEmail: nullable(input.phoneEmail),
			position: nullable(input.position),
			isPrimary: input.isPrimary ?? false,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		} as any);
		return { id };
	}

	async deleteCustomerContact(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(partnerCustomerContacts)
			.set({ deletedAt: now, updatedAt: now } as any)
			.where(eq(partnerCustomerContacts.id, id));
	}

	// ------------------------- Communications -------------------------

	async logCommunication(
		partnerId: string,
		input: {
			channel?: 'call' | 'email' | 'meeting' | 'note' | 'other';
			subject: string;
			body?: string;
			occurredAt?: string;
			contactName?: string;
		}
	) {
		const customer = await this.customers.findById(partnerId);
		if (!customer) throw new NotFoundError('Customer', partnerId);
		if (!input.subject?.trim()) throw new ValidationError('Communication subject is required');
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.insert(partnerCustomerCommunications).values({
			id,
			partnerId,
			channel: input.channel ?? 'note',
			subject: input.subject.trim(),
			body: nullable(input.body),
			occurredAt: nullable(input.occurredAt) ?? now,
			contactName: nullable(input.contactName),
			loggedByUserId: this.user?.id ?? null,
			loggedByEmail: this.user?.email ?? null,
			createdAt: now,
			updatedAt: now
		} as any);
		return { id };
	}

	// ------------------------- Attachments -------------------------

	async addCustomerAttachment(
		partnerId: string,
		input: {
			attachmentType?: 'contract' | 'agreement' | 'price_agreement' | 'nda' | 'other';
			title: string;
			fileName?: string;
			fileUrl?: string;
			expiryDate?: string;
			notes?: string;
		}
	) {
		const customer = await this.customers.findById(partnerId);
		if (!customer) throw new NotFoundError('Customer', partnerId);
		if (!input.title?.trim()) throw new ValidationError('Attachment title is required');
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.insert(partnerCustomerAttachments).values({
			id,
			partnerId,
			attachmentType: input.attachmentType ?? 'contract',
			title: input.title.trim(),
			fileName: nullable(input.fileName),
			fileUrl: nullable(input.fileUrl),
			expiryDate: nullable(input.expiryDate),
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		} as any);
		return { id };
	}

	async deleteCustomerAttachment(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(partnerCustomerAttachments)
			.set({ deletedAt: now, updatedAt: now } as any)
			.where(eq(partnerCustomerAttachments.id, id));
	}

	// ------------------------- Price lists -------------------------

	async listPriceLists(partnerId?: string) {
		const clause = partnerId
			? and(
					or(
						eq(customerPriceLists.partnerId, partnerId),
						isNull(customerPriceLists.partnerId)
					),
					isNull(customerPriceLists.deletedAt)
				)
			: isNull(customerPriceLists.deletedAt);
		const lists = await this.db
			.select()
			.from(customerPriceLists)
			.where(clause)
			.orderBy(desc(customerPriceLists.createdAt));
		if (lists.length === 0) return [] as Array<(typeof lists)[number] & { items: any[] }>;
		const items = await this.db
			.select()
			.from(customerPriceListItems)
			.where(
				and(
					inArray(
						customerPriceListItems.priceListId,
						lists.map((l) => l.id)
					),
					isNull(customerPriceListItems.deletedAt)
				)
			);
		return lists.map((list) => ({
			...list,
			items: items.filter((it) => it.priceListId === list.id)
		}));
	}

	async createPriceList(input: {
		partnerId?: string;
		groupName?: string;
		name: string;
		currency?: string;
		status?: 'draft' | 'active' | 'inactive';
		validFrom?: string;
		validTo?: string;
		notes?: string;
		items?: Array<{
			itemId?: string;
			itemCode?: string;
			description: string;
			uom?: string;
			unitPrice: number;
			minQuantity?: number;
			discountPct?: number;
		}>;
	}) {
		if (!input.name?.trim()) throw new ValidationError('Price list name is required');
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.insert(customerPriceLists).values({
			id,
			partnerId: nullable(input.partnerId),
			groupName: nullable(input.groupName),
			name: input.name.trim(),
			currency: nullable(input.currency) ?? 'SGD',
			status: input.status ?? 'active',
			validFrom: nullable(input.validFrom),
			validTo: nullable(input.validTo),
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		} as any);
		for (const item of input.items ?? []) {
			if (!item.description?.trim()) continue;
			await this.addPriceListItem(id, item);
		}
		return { id };
	}

	async addPriceListItem(
		priceListId: string,
		item: {
			itemId?: string;
			itemCode?: string;
			description: string;
			uom?: string;
			unitPrice: number;
			minQuantity?: number;
			discountPct?: number;
		}
	) {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		await this.db.insert(customerPriceListItems).values({
			id,
			priceListId,
			itemId: nullable(item.itemId),
			itemCode: nullable(item.itemCode),
			description: item.description.trim(),
			uom: nullable(item.uom) ?? 'unit',
			unitPrice: Math.max(0, finiteNumber(item.unitPrice)),
			minQuantity: Math.max(0, finiteNumber(item.minQuantity)),
			discountPct: Math.min(100, Math.max(0, finiteNumber(item.discountPct))),
			createdAt: now,
			updatedAt: now
		} as any);
		return { id };
	}

	async deletePriceList(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(customerPriceLists)
			.set({ deletedAt: now, updatedAt: now } as any)
			.where(eq(customerPriceLists.id, id));
	}

	async deletePriceListItem(id: string) {
		const now = new Date().toISOString();
		await this.db
			.update(customerPriceListItems)
			.set({ deletedAt: now, updatedAt: now } as any)
			.where(eq(customerPriceListItems.id, id));
	}

	/** Resolve the effective unit price for an item given the customer's price lists. */
	async resolveCustomerPrice(partnerId: string, itemId: string, quantity = 1) {
		const lists = await this.listPriceLists(partnerId);
		const active = lists.filter((l) => l.status === 'active');
		let best: { unitPrice: number; discountPct: number; priceListId: string } | null = null;
		for (const list of active) {
			for (const item of list.items) {
				if (item.itemId !== itemId) continue;
				if (quantity < Number(item.minQuantity)) continue;
				const effective = Number(item.unitPrice) * (1 - Number(item.discountPct) / 100);
				if (!best || effective < best.unitPrice * (1 - best.discountPct / 100)) {
					best = {
						unitPrice: Number(item.unitPrice),
						discountPct: Number(item.discountPct),
						priceListId: list.id
					};
				}
			}
		}
		return best;
	}

	// ------------------------- Credit check -------------------------

	/** Outstanding exposure = total of the customer's open (confirmed→shipped) orders. */
	private async getOpenExposure(customerId: string, excludeOrderId?: string) {
		const rows = await this.db
			.select({
				id: salesOrders.id,
				totalAmount: salesOrders.totalAmount,
				status: salesOrders.status
			})
			.from(salesOrders)
			.where(and(eq(salesOrders.customerId, customerId), isNull(salesOrders.deletedAt)));
		const open = rows.filter(
			(r) =>
				r.id !== excludeOrderId &&
				['confirmed', 'picking', 'packed', 'shipped'].includes(r.status)
		);
		return open.reduce((sum, r) => sum + Number(r.totalAmount), 0);
	}

	private async runCreditCheck(customerId: string, orderTotal: number, excludeOrderId?: string) {
		const profile = await this.getProfileByPartnerId(customerId);
		if (!profile) return { hold: false, message: null as string | null };
		if (profile.creditHoldFlag) {
			return {
				hold: true,
				message: `Customer is on credit hold${profile.creditHoldReason ? `: ${profile.creditHoldReason}` : ''}.`
			};
		}
		const limit = Number(profile.creditLimit) || 0;
		if (limit > 0) {
			const exposure = await this.getOpenExposure(customerId, excludeOrderId);
			if (exposure + orderTotal > limit) {
				return {
					hold: true,
					message: `Order would push exposure to ${roundMoney(exposure + orderTotal)} over credit limit ${limit}.`
				};
			}
		}
		return { hold: false, message: null };
	}

	// ------------------------- Quotations -------------------------

	async listQuotations() {
		return this.db
			.select()
			.from(salesQuotations)
			.where(isNull(salesQuotations.deletedAt))
			.orderBy(desc(salesQuotations.createdAt));
	}

	async getQuotation(id: string) {
		const rows = await this.db
			.select()
			.from(salesQuotations)
			.where(and(eq(salesQuotations.id, id), isNull(salesQuotations.deletedAt)))
			.limit(1);
		const quotation = rows[0];
		if (!quotation) throw new NotFoundError('Quotation', id);
		const items = await this.db
			.select()
			.from(salesQuotationItems)
			.where(
				and(eq(salesQuotationItems.quotationId, id), isNull(salesQuotationItems.deletedAt))
			);
		const customer = await this.customers.findById(quotation.customerId);
		return { quotation, items, customer };
	}

	async createQuotation(input: CreateQuotationInput) {
		const customer = await this.customers.findById(input.customerId);
		if (!customer) throw new NotFoundError('Customer', input.customerId);
		const lines = normalizeLines(input.items);
		if (lines.length === 0) throw new ValidationError('At least one quotation line is required');

		const now = new Date().toISOString();
		const quotationId = crypto.randomUUID();
		const grossSubtotal = roundMoney(lines.reduce((s, l) => s + l.lineGross, 0));
		const lineSubtotal = roundMoney(lines.reduce((s, l) => s + l.lineSubtotal, 0));
		const headerDiscountPct = Math.min(100, Math.max(0, finiteNumber(input.discountPct)));
		const headerDiscountAmount = roundMoney(lineSubtotal * (headerDiscountPct / 100));
		const taxAmount = Math.max(0, finiteNumber(input.taxAmount));
		const subtotalAmount = lineSubtotal;
		const totalAmount = roundMoney(subtotalAmount - headerDiscountAmount + taxAmount);

		await this.db.insert(salesQuotations).values({
			id: quotationId,
			quoteNumber: nullable(input.quoteNumber) ?? generatedNumber('QO'),
			customerId: input.customerId,
			projectId: nullable(input.projectId),
			status: 'draft',
			currency: nullable(input.currency) ?? customer.currency ?? 'SGD',
			quoteDate: nullable(input.quoteDate) ?? now.slice(0, 10),
			validUntil: nullable(input.validUntil),
			taxCode: input.taxCode ?? null,
			subtotalAmount,
			discountAmount: roundMoney(grossSubtotal - lineSubtotal + headerDiscountAmount),
			discountPct: headerDiscountPct,
			taxAmount,
			totalAmount,
			createdByUserId: this.user?.id ?? null,
			createdByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		} as any);
		for (const line of lines) {
			await this.db.insert(salesQuotationItems).values({
				id: line.id,
				quotationId,
				itemId: line.itemId,
				itemCode: line.itemCode,
				description: line.description,
				quantity: line.quantity,
				uom: line.uom,
				unitPrice: line.unitPrice,
				discountPct: line.discountPct,
				lineSubtotal: line.lineSubtotal,
				taxCode: line.taxCode,
				notes: line.notes,
				createdAt: now,
				updatedAt: now
			} as any);
		}
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'create',
			action: 'quotation.created',
			entityType: 'sales_quotation',
			entityId: quotationId,
			metadata: { customerId: input.customerId, totalAmount }
		});
		return { id: quotationId };
	}

	async convertQuotationToOrder(quotationId: string, overrides?: Partial<CreateSalesOrderInput>) {
		const { quotation, items } = await this.getQuotation(quotationId);
		if (quotation.status === 'converted') {
			throw new ValidationError('Quotation has already been converted to an order');
		}
		const order = await this.createSalesOrder({
			sourceType: 'quotation',
			quotationId,
			customerId: quotation.customerId,
			projectId: quotation.projectId ?? undefined,
			currency: quotation.currency,
			taxCode: (quotation.taxCode as TaxCode | null) ?? undefined,
			discountPct: quotation.discountPct,
			taxAmount: quotation.taxAmount,
			requestedDeliveryDate: overrides?.requestedDeliveryDate,
			billingAddress: overrides?.billingAddress,
			shippingAddress: overrides?.shippingAddress,
			notes: overrides?.notes ?? quotation.notes ?? undefined,
			items: items.map((it) => ({
				itemId: it.itemId ?? undefined,
				itemCode: it.itemCode ?? undefined,
				description: it.description,
				quantity: it.quantity,
				uom: it.uom,
				unitPrice: it.unitPrice,
				discountPct: it.discountPct,
				taxCode: (it.taxCode as TaxCode | null) ?? undefined
			}))
		});
		const now = new Date().toISOString();
		await this.db
			.update(salesQuotations)
			.set({ status: 'converted', convertedOrderId: order.id, updatedAt: now } as any)
			.where(eq(salesQuotations.id, quotationId));
		return order;
	}

	// ------------------------- Sales orders -------------------------

	async listSalesOrders() {
		return this.db
			.select()
			.from(salesOrders)
			.where(isNull(salesOrders.deletedAt))
			.orderBy(desc(salesOrders.createdAt));
	}

	async getSalesOrder(id: string) {
		const rows = await this.db
			.select()
			.from(salesOrders)
			.where(and(eq(salesOrders.id, id), isNull(salesOrders.deletedAt)))
			.limit(1);
		const order = rows[0];
		if (!order) throw new NotFoundError('Sales order', id);
		const [items, shipments, customer] = await Promise.all([
			this.db
				.select()
				.from(salesOrderItems)
				.where(and(eq(salesOrderItems.orderId, id), isNull(salesOrderItems.deletedAt))),
			this.db
				.select()
				.from(salesOrderShipments)
				.where(
					and(eq(salesOrderShipments.orderId, id), isNull(salesOrderShipments.deletedAt))
				)
				.orderBy(desc(salesOrderShipments.shipmentDate)),
			this.customers.findById(order.customerId)
		]);
		return { order, items, shipments, customer };
	}

	async createSalesOrder(input: CreateSalesOrderInput) {
		const customer = await this.customers.findById(input.customerId);
		if (!customer) throw new NotFoundError('Customer', input.customerId);
		const lines = normalizeLines(input.items);
		if (lines.length === 0) throw new ValidationError('At least one order line is required');

		const now = new Date().toISOString();
		const orderId = crypto.randomUUID();
		const profile = await this.getProfileByPartnerId(input.customerId);

		const grossSubtotal = roundMoney(lines.reduce((s, l) => s + l.lineGross, 0));
		const lineSubtotal = roundMoney(lines.reduce((s, l) => s + l.lineSubtotal, 0));
		const headerDiscountPct = Math.min(100, Math.max(0, finiteNumber(input.discountPct)));
		const headerDiscountAmount = roundMoney(lineSubtotal * (headerDiscountPct / 100));
		const shippingAmount = Math.max(0, finiteNumber(input.shippingAmount));
		const taxAmount = Math.max(0, finiteNumber(input.taxAmount));
		const subtotalAmount = lineSubtotal;
		const totalAmount = roundMoney(
			subtotalAmount - headerDiscountAmount + shippingAmount + taxAmount
		);
		// Total discount as a share of gross — combines line discounts and the
		// header discount, which is what IA002 governs.
		const totalDiscountAmount = roundMoney(grossSubtotal - lineSubtotal + headerDiscountAmount);
		const overallDiscountPct =
			grossSubtotal > 0 ? roundMoney((totalDiscountAmount / grossSubtotal) * 100) : 0;
		const ia002 = overallDiscountPct > IA002_DISCOUNT_THRESHOLD_PCT;

		const credit = await this.runCreditCheck(input.customerId, totalAmount);
		const approvalStatus = ia002 ? 'pending_approval' : 'not_required';

		const order = {
			id: orderId,
			orderNumber: nullable(input.orderNumber) ?? generatedNumber('SO'),
			sourceType: input.sourceType ?? 'manual',
			quotationId: nullable(input.quotationId),
			customerId: input.customerId,
			projectId: nullable(input.projectId),
			status: 'draft',
			approvalStatus,
			orderDate: nullable(input.orderDate) ?? now.slice(0, 10),
			requestedDeliveryDate: nullable(input.requestedDeliveryDate),
			confirmedDeliveryDate: null,
			currency: nullable(input.currency) ?? customer.currency ?? 'SGD',
			taxCode: input.taxCode ?? profile?.taxCode ?? null,
			billingAddress:
				nullable(input.billingAddress) ?? profile?.billingAddress ?? customer.address ?? null,
			shippingAddress: nullable(input.shippingAddress) ?? profile?.shippingAddress ?? null,
			subtotalAmount,
			discountAmount: totalDiscountAmount,
			discountPct: overallDiscountPct,
			shippingAmount,
			taxAmount,
			totalAmount,
			creditHoldFlag: credit.hold,
			creditCheckMessage: credit.message,
			iaExceptionCode: ia002 ? 'IA002' : null,
			iaExceptionReason: ia002
				? `Sales order discount ${overallDiscountPct}% exceeds ${IA002_DISCOUNT_THRESHOLD_PCT}% and requires director approval.`
				: null,
			approvedByUserId: null,
			approvedByEmail: null,
			approvedAt: null,
			rejectedReason: null,
			createdByUserId: this.user?.id ?? null,
			createdByEmail: this.user?.email ?? null,
			notes: nullable(input.notes),
			createdAt: now,
			updatedAt: now
		};
		await this.db.insert(salesOrders).values(order as any);
		for (const line of lines) {
			await this.db.insert(salesOrderItems).values({
				id: line.id,
				orderId,
				itemId: line.itemId,
				itemCode: line.itemCode,
				description: line.description,
				quantity: line.quantity,
				uom: line.uom,
				unitPrice: line.unitPrice,
				discountPct: line.discountPct,
				lineSubtotal: line.lineSubtotal,
				taxCode: line.taxCode,
				reservedQuantity: 0,
				shippedQuantity: 0,
				backOrderedQuantity: 0,
				atpAtConfirm: null,
				warehouseId: line.warehouseId,
				binLocationId: line.binLocationId,
				notes: line.notes,
				createdAt: now,
				updatedAt: now
			} as any);
		}
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'create',
			action: ia002 ? 'sales_order.created.pending_approval' : 'sales_order.created',
			entityType: 'sales_order',
			entityId: orderId,
			newValue: order,
			metadata: {
				customerId: input.customerId,
				totalAmount,
				overallDiscountPct,
				creditHold: credit.hold,
				approvalStatus
			}
		});
		if (ia002) {
			await this.audit.writeLog({
				module: 'sales-crm',
				actionType: 'permission_change',
				action: 'sales_order.alert.ia002',
				entityType: 'sales_order',
				entityId: orderId,
				metadata: {
					alertCode: 'IA002',
					overallDiscountPct,
					thresholdPct: IA002_DISCOUNT_THRESHOLD_PCT,
					totalAmount
				}
			});
		}
		return { ...order, items: lines };
	}

	async approveSalesOrder(orderId: string, input: SalesOrderApprovalInput) {
		const { order } = await this.getSalesOrder(orderId);
		if (order.approvalStatus !== 'pending_approval') {
			throw new ValidationError('Sales order is not pending approval');
		}
		const now = new Date().toISOString();
		const approved = input.action === 'approve';
		const updates = {
			approvalStatus: approved ? 'approved' : 'rejected',
			status: approved ? order.status : 'cancelled',
			approvedByUserId: approved ? this.user?.id ?? null : null,
			approvedByEmail: approved ? this.user?.email ?? null : null,
			approvedAt: approved ? now : null,
			rejectedReason: approved ? null : nullable(input.reason),
			updatedAt: now
		};
		await this.db
			.update(salesOrders)
			.set(updates as any)
			.where(eq(salesOrders.id, orderId));
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: approved ? 'sales_order.approved' : 'sales_order.rejected',
			entityType: 'sales_order',
			entityId: orderId,
			oldValue: order,
			newValue: { ...order, ...updates },
			metadata: { totalAmount: order.totalAmount }
		});
		return { ...order, ...updates };
	}

	/**
	 * Confirm a draft order: run ATP per line, reserve what's available, push the
	 * shortfall to back-order. Blocked while director approval is pending.
	 */
	async confirmSalesOrder(orderId: string, input?: { confirmedDeliveryDate?: string }) {
		const { order, items } = await this.getSalesOrder(orderId);
		if (order.status !== 'draft') {
			throw new ValidationError(`Only draft orders can be confirmed (current: ${order.status})`);
		}
		if (order.approvalStatus === 'pending_approval') {
			throw new ValidationError('Director approval is required before this order can be confirmed');
		}
		if (order.approvalStatus === 'rejected') {
			throw new ValidationError('Sales order was rejected and cannot be confirmed');
		}
		const inv = this.inventory();
		const now = new Date().toISOString();

		for (const line of items) {
			if (!line.itemId || !line.warehouseId || !line.binLocationId) {
				// Non-stock / service line — nothing to reserve.
				continue;
			}
			const levels = await inv.getStockLevelByItem(line.itemId);
			const cell = levels.find(
				(l: any) =>
					l.level.warehouseId === line.warehouseId &&
					l.level.binLocationId === line.binLocationId
			);
			const available = cell
				? Number(cell.level.quantityOnHand) - Number(cell.level.quantityReserved)
				: 0;
			const toReserve = Math.min(Number(line.quantity), Math.max(0, available));
			const backOrder = roundMoney(Number(line.quantity) - toReserve);
			if (toReserve > 0) {
				await inv.reserveStock({
					itemId: line.itemId,
					warehouseId: line.warehouseId,
					binLocationId: line.binLocationId,
					quantityDelta: toReserve
				});
			}
			await this.db
				.update(salesOrderItems)
				.set({
					reservedQuantity: toReserve,
					backOrderedQuantity: backOrder,
					atpAtConfirm: available,
					updatedAt: now
				} as any)
				.where(eq(salesOrderItems.id, line.id));
		}

		const updates = {
			status: 'confirmed',
			confirmedDeliveryDate:
				nullable(input?.confirmedDeliveryDate) ?? order.requestedDeliveryDate ?? null,
			updatedAt: now
		};
		await this.db
			.update(salesOrders)
			.set(updates as any)
			.where(eq(salesOrders.id, orderId));
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: 'sales_order.confirmed',
			entityType: 'sales_order',
			entityId: orderId,
			metadata: { creditHold: order.creditHoldFlag }
		});
		return this.getSalesOrder(orderId);
	}

	/** Simple fulfilment status transitions: confirmed → picking → packed. */
	async advanceSalesOrderStatus(orderId: string, target: 'picking' | 'packed') {
		const { order } = await this.getSalesOrder(orderId);
		const allowed: Record<string, string[]> = {
			picking: ['confirmed'],
			packed: ['picking', 'confirmed']
		};
		if (!allowed[target].includes(order.status)) {
			throw new ValidationError(`Cannot move order from ${order.status} to ${target}`);
		}
		const now = new Date().toISOString();
		await this.db
			.update(salesOrders)
			.set({ status: target, updatedAt: now } as any)
			.where(eq(salesOrders.id, orderId));
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: `sales_order.${target}`,
			entityType: 'sales_order',
			entityId: orderId
		});
		return this.getSalesOrder(orderId);
	}

	/**
	 * Record one or more line shipments. Draws down physical stock, releases the
	 * matching reservation, and tracks back-order. The order flips to `shipped`
	 * only once every line is fully shipped.
	 */
	async shipSalesOrder(orderId: string, shipments: SalesOrderShipmentInput[]) {
		const { order, items } = await this.getSalesOrder(orderId);
		if (!['confirmed', 'picking', 'packed', 'shipped'].includes(order.status)) {
			throw new ValidationError(`Order in status ${order.status} cannot be shipped`);
		}
		if (order.creditHoldFlag) {
			throw new ValidationError('Order is on credit hold and cannot be shipped');
		}
		const inv = this.inventory();
		const now = new Date().toISOString();
		const itemsById = new Map(items.map((it) => [it.id, it]));

		for (const ship of shipments) {
			const line = itemsById.get(ship.orderItemId);
			if (!line) throw new NotFoundError('Sales order item', ship.orderItemId);
			const qty = Math.max(0, finiteNumber(ship.quantityShipped));
			if (qty <= 0) continue;
			const remaining = Number(line.quantity) - Number(line.shippedQuantity);
			if (qty > remaining + 1e-6) {
				throw new ValidationError(
					`Shipment ${qty} exceeds remaining ${remaining} on line ${line.description}`
				);
			}

			let movementId: string | null = null;
			if (line.itemId && line.warehouseId && line.binLocationId) {
				const releaseQty = Math.min(qty, Number(line.reservedQuantity));
				if (releaseQty > 0) {
					await inv.reserveStock({
						itemId: line.itemId,
						warehouseId: line.warehouseId,
						binLocationId: line.binLocationId,
						quantityDelta: -releaseQty
					});
				}
				const movement = await inv.adjustStock({
					itemId: line.itemId,
					warehouseId: line.warehouseId,
					binLocationId: line.binLocationId,
					quantityDelta: -qty,
					movementType: 'issue',
					referenceType: 'sales_order_shipment',
					referenceId: orderId
				});
				movementId = movement.movementId;
			}

			const newShipped = roundMoney(Number(line.shippedQuantity) + qty);
			const newBackOrder = roundMoney(Math.max(0, Number(line.quantity) - newShipped));
			const newReserved = roundMoney(Math.max(0, Number(line.reservedQuantity) - qty));
			await this.db
				.update(salesOrderItems)
				.set({
					shippedQuantity: newShipped,
					backOrderedQuantity: newBackOrder,
					reservedQuantity: newReserved,
					updatedAt: now
				} as any)
				.where(eq(salesOrderItems.id, line.id));

			await this.db.insert(salesOrderShipments).values({
				id: crypto.randomUUID(),
				orderId,
				orderItemId: line.id,
				shipmentNumber: nullable(ship.shipmentNumber) ?? generatedNumber('SH'),
				shipmentDate: nullable(ship.shipmentDate) ?? now.slice(0, 10),
				quantityShipped: qty,
				backOrderQuantity: newBackOrder,
				warehouseId: line.warehouseId,
				binLocationId: line.binLocationId,
				movementId,
				trackingReference: nullable(ship.trackingReference),
				shippedByUserId: this.user?.id ?? null,
				shippedByEmail: this.user?.email ?? null,
				notes: nullable(ship.notes),
				createdAt: now,
				updatedAt: now
			} as any);
		}

		const refreshed = await this.db
			.select()
			.from(salesOrderItems)
			.where(and(eq(salesOrderItems.orderId, orderId), isNull(salesOrderItems.deletedAt)));
		const fullyShipped = refreshed.every(
			(l) => Number(l.shippedQuantity) >= Number(l.quantity) - 1e-6
		);
		const nextStatus = fullyShipped ? 'shipped' : order.status === 'shipped' ? 'shipped' : 'packed';
		await this.db
			.update(salesOrders)
			.set({ status: nextStatus, updatedAt: now } as any)
			.where(eq(salesOrders.id, orderId));
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: fullyShipped ? 'sales_order.shipped' : 'sales_order.partially_shipped',
			entityType: 'sales_order',
			entityId: orderId,
			metadata: { fullyShipped }
		});
		return this.getSalesOrder(orderId);
	}

	/** Mark a fully-shipped order as invoiced and notify finance/AR via event. */
	async invoiceSalesOrder(orderId: string) {
		const { order, customer } = await this.getSalesOrder(orderId);
		if (order.status !== 'shipped') {
			throw new ValidationError('Only fully-shipped orders can be invoiced');
		}
		const now = new Date().toISOString();
		await this.db
			.update(salesOrders)
			.set({ status: 'invoiced', updatedAt: now } as any)
			.where(eq(salesOrders.id, orderId));
		await this.audit.writeLog({
			module: 'sales-crm',
			actionType: 'update',
			action: 'sales_order.invoiced',
			entityType: 'sales_order',
			entityId: orderId,
			metadata: { totalAmount: order.totalAmount }
		});
		await this.ctx.eventBus.emit(
			createEvent('sales_order.invoiced', 'sales-crm', {
				orderId,
				customerId: order.customerId,
				customerName: customer?.name ?? null,
				totalAmount: order.totalAmount,
				currency: order.currency,
				taxCode: order.taxCode
			})
		);
		return this.getSalesOrder(orderId);
	}
}
