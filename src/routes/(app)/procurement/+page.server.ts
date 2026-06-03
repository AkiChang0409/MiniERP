import type { PageServerLoad } from './$types';

import { createProcurementApi } from '$modules/procurement';
import { createModuleContext } from '$platform/modules';

export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			counts: {
				rfqsOpen: 0,
				rfqsAwaitingQuotes: 0,
				posPendingApproval: 0,
				posAwaitingAck: 0,
				receiptsPendingInspection: 0,
				invoicesPendingReview: 0,
				invoicesWithIa004: 0
			},
			recentInvoices: [],
			recentReceipts: []
		};
	}
	const ctx = await createModuleContext(event);
	const procurement = createProcurementApi(ctx);
	const [rfqs, pos, invoices] = await Promise.all([
		procurement.listRfqs(),
		procurement.listPurchaseOrders(),
		procurement.listSupplierInvoices()
	]);

	const counts = {
		rfqsOpen: rfqs.filter((r) => r.status === 'draft' || r.status === 'sent').length,
		rfqsAwaitingQuotes: rfqs.filter(
			(r) => (r.status === 'sent' || r.status === 'draft') && r.quotationCount === 0
		).length,
		posPendingApproval: pos.filter((p) => p.approvalStatus === 'pending_approval').length,
		posAwaitingAck: pos.filter(
			(p) => p.approvalStatus === 'approved' && p.ackStatus !== 'acknowledged'
		).length,
		receiptsPendingInspection: pos.reduce(
			(sum, p) =>
				sum + (p.receipts ?? []).filter((r: any) => r.inspectionStatus === 'pending').length,
			0
		),
		invoicesPendingReview: invoices.filter((i) => i.approvalStatus === 'pending_review').length,
		invoicesWithIa004: invoices.filter((i) => i.iaExceptionCode === 'IA004').length
	};

	return {
		counts,
		recentInvoices: invoices.slice(0, 5),
		recentReceipts: pos
			.flatMap((p) =>
				(p.receipts ?? []).map((r: any) => ({
					poId: p.id,
					poNumber: p.poNumber,
					supplierName: p.supplier?.name ?? null,
					...r
				}))
			)
			.sort((a, b) => String(b.receiptDate).localeCompare(String(a.receiptDate)))
			.slice(0, 5)
	};
};
