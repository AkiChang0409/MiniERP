import { GST_SUPPLY_CODE_RATE, SG_GST_RATE_PERCENT } from '../../domain/gst-constants';
import type { PeppolInvoiceInput, PeppolInvoiceLine, PeppolParty, PeppolXmlResult } from './types';

const PEPPOL_BIS_PROFILE = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';
const UBL_CUSTOMIZATION =
	'urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:sg:3.0';
const UBL_NS = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const CAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

function esc(value: string | null | undefined): string {
	if (!value) return '';
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function amt(value: number, currency: string): string {
	return `<cbc:Amount currencyID="${esc(currency)}">${value.toFixed(2)}</cbc:Amount>`;
}

function taxAmount(value: number, currency: string): string {
	return `<cbc:TaxAmount currencyID="${esc(currency)}">${value.toFixed(2)}</cbc:TaxAmount>`;
}

function taxableAmount(value: number, currency: string): string {
	return `<cbc:TaxableAmount currencyID="${esc(currency)}">${value.toFixed(2)}</cbc:TaxableAmount>`;
}

function gstCategoryId(code: string): string {
	switch (code) {
		case 'SR': return 'S';
		case 'ZR': return 'Z';
		case 'ES': return 'E';
		case 'OP': return 'O';
		default: return 'S';
	}
}

function gstSchemeId(code: string): string {
	switch (code) {
		case 'SR': return 'GST';
		case 'ZR': return 'GST';
		case 'ES': return 'GST';
		case 'OP': return 'GST';
		default: return 'GST';
	}
}

function buildPartyXml(party: PeppolParty, role: 'AccountingSupplierParty' | 'AccountingCustomerParty'): string {
	const countryCode = party.address?.countryCode || 'SG';
	const endpointScheme = party.uen ? '0195' : '9999';
	const endpointId = party.uen || party.name;

	return `<cac:${role}>
  <cac:Party>
    <cbc:EndpointID schemeID="${endpointScheme}">${esc(endpointId)}</cbc:EndpointID>
    <cac:PartyIdentification>
      <cbc:ID schemeID="0195">${esc(party.uen || '')}</cbc:ID>
    </cac:PartyIdentification>
    <cac:PartyName>
      <cbc:Name>${esc(party.name)}</cbc:Name>
    </cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${esc(party.address?.streetName)}</cbc:StreetName>
      <cbc:CityName>${esc(party.address?.cityName || 'Singapore')}</cbc:CityName>
      <cbc:PostalZone>${esc(party.address?.postalZone)}</cbc:PostalZone>
      <cac:Country>
        <cbc:IdentificationCode>${esc(countryCode)}</cbc:IdentificationCode>
      </cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>${esc(party.gstRegNo || party.uen || '')}</cbc:CompanyID>
      <cac:TaxScheme>
        <cbc:ID>GST</cbc:ID>
      </cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${esc(party.name)}</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0195">${esc(party.uen || '')}</cbc:CompanyID>
    </cac:PartyLegalEntity>${party.contact ? `
    <cac:Contact>
      <cbc:Name>${esc(party.contact.name)}</cbc:Name>${party.contact.telephone ? `
      <cbc:Telephone>${esc(party.contact.telephone)}</cbc:Telephone>` : ''}${party.contact.email ? `
      <cbc:ElectronicMail>${esc(party.contact.email)}</cbc:ElectronicMail>` : ''}
    </cac:Contact>` : ''}
  </cac:Party>
</cac:${role}>`;
}

function buildTaxSubtotalXml(lines: PeppolInvoiceLine[], currency: string): string {
	const byCode = new Map<string, { taxable: number; tax: number; percent: number }>();

	for (const line of lines) {
		const key = line.gstCode;
		const existing = byCode.get(key) || { taxable: 0, tax: 0, percent: line.gstPercent };
		existing.taxable += line.lineTotal;
		existing.tax += line.gstAmount;
		byCode.set(key, existing);
	}

	return Array.from(byCode.entries())
		.map(
			([code, data]) => `    <cac:TaxSubtotal>
      ${taxableAmount(data.taxable, currency)}
      ${taxAmount(data.tax, currency)}
      <cac:TaxCategory>
        <cbc:ID>${gstCategoryId(code)}</cbc:ID>
        <cbc:Percent>${data.percent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>${gstSchemeId(code)}</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`
		)
		.join('\n');
}

function buildInvoiceLineXml(line: PeppolInvoiceLine, currency: string): string {
	return `  <cac:InvoiceLine>
    <cbc:ID>${esc(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(line.unitCode || 'EA')}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${line.lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${esc(line.description)}</cbc:Description>
      <cbc:Name>${esc(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${gstCategoryId(line.gstCode)}</cbc:ID>
        <cbc:Percent>${line.gstPercent.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>GST</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(currency)}">${line.unitPrice.toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

export function generatePeppolUblXml(input: PeppolInvoiceInput): PeppolXmlResult {
	const currency = input.currency || 'SGD';
	const dueDate = input.dueDate || input.issueDate;
	const paymentMeansCode = input.paymentMeansCode || '30';

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="${UBL_NS}"
  xmlns:cac="${CAC_NS}"
  xmlns:cbc="${CBC_NS}">
  <cbc:CustomizationID>${UBL_CUSTOMIZATION}</cbc:CustomizationID>
  <cbc:ProfileID>${PEPPOL_BIS_PROFILE}</cbc:ProfileID>
  <cbc:ID>${esc(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${esc(input.issueDate)}</cbc:IssueDate>
  <cbc:DueDate>${esc(dueDate)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${input.notes ? `<cbc:Note>${esc(input.notes)}</cbc:Note>` : ''}
  <cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${esc(currency)}</cbc:TaxCurrencyCode>
  ${buildPartyXml(input.supplier, 'AccountingSupplierParty')}
  ${buildPartyXml(input.customer, 'AccountingCustomerParty')}
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${esc(paymentMeansCode)}</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>${esc(dueDate)}</cbc:PaymentDueDate>
  </cac:PaymentMeans>${input.paymentTerms ? `
  <cac:PaymentTerms>
    <cbc:Note>${esc(input.paymentTerms)}</cbc:Note>
  </cac:PaymentTerms>` : ''}
  <cac:TaxTotal>
    ${taxAmount(input.gstTotal, currency)}
${buildTaxSubtotalXml(input.lines, currency)}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(currency)}">${input.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(currency)}">${input.subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(currency)}">${input.total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(currency)}">${input.total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${input.lines.map((line) => buildInvoiceLineXml(line, currency)).join('\n')}
</Invoice>`;

	return {
		xml,
		invoiceNumber: input.invoiceNumber,
		profileId: PEPPOL_BIS_PROFILE,
		customizationId: UBL_CUSTOMIZATION
	};
}
