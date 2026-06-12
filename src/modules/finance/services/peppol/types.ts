import type { GstSupplyCode } from '../../domain/gst-constants';

export interface PeppolParty {
	name: string;
	uen?: string | null;
	gstRegNo?: string | null;
	address?: {
		streetName?: string | null;
		cityName?: string | null;
		postalZone?: string | null;
		countryCode?: string | null;
	} | null;
	contact?: {
		name?: string | null;
		telephone?: string | null;
		email?: string | null;
	} | null;
}

export interface PeppolInvoiceLine {
	id: string;
	description: string;
	quantity: number;
	unitCode?: string;
	unitPrice: number;
	lineTotal: number;
	gstCode: GstSupplyCode;
	gstPercent: number;
	gstAmount: number;
}

export interface PeppolInvoiceInput {
	invoiceNumber: string;
	issueDate: string;
	dueDate?: string | null;
	currency: string;
	supplier: PeppolParty;
	customer: PeppolParty;
	lines: PeppolInvoiceLine[];
	subtotal: number;
	gstTotal: number;
	total: number;
	notes?: string | null;
	paymentMeansCode?: string;
	paymentTerms?: string | null;
}

export interface PeppolXmlResult {
	xml: string;
	invoiceNumber: string;
	profileId: string;
	customizationId: string;
}

export interface AccessPointConfig {
	endpoint: string;
	apiKey: string;
	senderId: string;
	senderScheme: string;
}

export interface AccessPointSubmission {
	invoiceNumber: string;
	xml: string;
	recipientId: string;
	recipientScheme: string;
}

export interface AccessPointResult {
	ok: boolean;
	transmissionId?: string;
	error?: string;
	timestamp: string;
}
