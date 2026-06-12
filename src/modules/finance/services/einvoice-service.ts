import { and, eq, isNull } from 'drizzle-orm';
import type { ModuleContext } from '$platform/modules/types';
import { businessPartners, companySettings, projects, revenue } from '../../../infrastructure/db/schema';
import { generatePeppolUblXml, createAccessPointClient } from './peppol';
import type { PeppolInvoiceLine } from './peppol';
import { resolveGstCode, GST_SUPPLY_CODE_RATE } from '../domain/gst-constants';

export function createFinanceEInvoiceApi(ctx: ModuleContext) {
	const getCompanySettings = async () => {
		const rows = await ctx.db
			.select({ key: companySettings.key, value: companySettings.value })
			.from(companySettings)
			.where(isNull(companySettings.deletedAt));
		return new Map(rows.map((s) => [s.key, s.value]));
	};

	const generateEInvoice = async (input: {
		revenueId: string;
		dueDate?: string | null;
		paymentTerms?: string | null;
	}) => {
		const [record] = await ctx.db
			.select()
			.from(revenue)
			.where(and(eq(revenue.id, input.revenueId), isNull(revenue.deletedAt)))
			.limit(1);

		if (!record) return null;

		const settingsMap = await getCompanySettings();

		const supplierName = settingsMap.get('company_name') || 'Company';
		const supplierUen = settingsMap.get('company_uen') || '';
		const supplierGstReg = settingsMap.get('company_gst_reg_no') || '';
		const supplierAddress = settingsMap.get('company_address') || '';
		const supplierPostalCode = settingsMap.get('company_postal_code') || '';

		let customerName = record.clientName || 'Customer';
		let customerUen = '';
		let customerGstReg = '';
		let customerAddress = '';

		if (record.projectId) {
			const [project] = await ctx.db
				.select({ customerId: projects.businessPartnerId })
				.from(projects)
				.where(eq(projects.id, record.projectId))
				.limit(1);

			if (project?.customerId) {
				const [bp] = await ctx.db
					.select()
					.from(businessPartners)
					.where(eq(businessPartners.id, project.customerId))
					.limit(1);

				if (bp) {
					customerName = bp.name || customerName;
					customerUen = bp.registrationNo || '';
					customerGstReg = bp.gstRegNo || '';
					customerAddress = bp.address || '';
				}
			}
		}

		const gstCode = resolveGstCode(record.invoiceType, record.gstCode ?? null);
		const gstRate = GST_SUPPLY_CODE_RATE[gstCode] * 100;
		const gstAmount = record.gstAmount ?? 0;
		const subtotal = record.amount - gstAmount;

		const lines: PeppolInvoiceLine[] = [
			{
				id: '1',
				description: record.notes || `Invoice ${record.invoiceNumber || record.id}`,
				quantity: 1,
				unitCode: 'EA',
				unitPrice: subtotal,
				lineTotal: subtotal,
				gstCode,
				gstPercent: gstRate,
				gstAmount
			}
		];

		return generatePeppolUblXml({
			invoiceNumber: record.invoiceNumber || record.id,
			issueDate: record.date,
			dueDate: input.dueDate || null,
			currency: record.currency || 'SGD',
			supplier: {
				name: supplierName,
				uen: supplierUen,
				gstRegNo: supplierGstReg,
				address: {
					streetName: supplierAddress,
					cityName: 'Singapore',
					postalZone: supplierPostalCode,
					countryCode: 'SG'
				}
			},
			customer: {
				name: customerName,
				uen: customerUen,
				gstRegNo: customerGstReg,
				address: {
					streetName: customerAddress,
					cityName: 'Singapore',
					countryCode: 'SG'
				}
			},
			lines,
			subtotal,
			gstTotal: gstAmount,
			total: record.amount,
			notes: record.notes,
			paymentTerms: input.paymentTerms || null
		});
	};

	const getAccessPointStatus = async () => {
		const settingsMap = await getCompanySettings();

		const config = {
			endpoint: settingsMap.get('peppol_ap_endpoint') || '',
			apiKey: settingsMap.get('peppol_ap_api_key') || '',
			senderId: settingsMap.get('peppol_sender_id') || '',
			senderScheme: settingsMap.get('peppol_sender_scheme') || '0195'
		};

		const client = createAccessPointClient(config.endpoint ? config : null);

		return {
			status: client.getStatus(),
			configured: client.isConfigured,
			message: client.isConfigured
				? 'Access Point is configured and ready for e-invoice transmission.'
				: 'Access Point not configured. Set peppol_ap_endpoint, peppol_ap_api_key, peppol_sender_id in Company Settings to enable InvoiceNow transmission.'
		};
	};

	return {
		generateEInvoice,
		getAccessPointStatus
	};
}

export type FinanceEInvoiceApi = ReturnType<typeof createFinanceEInvoiceApi>;
