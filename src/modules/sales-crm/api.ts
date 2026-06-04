import type { ModuleContext } from '$platform/modules/types';
import { SalesCrmService } from './service';

export type SalesCrmApi = ReturnType<typeof createSalesCrmApi>;

export function createSalesCrmApi(ctx: ModuleContext) {
	const svc = new SalesCrmService(ctx);

	return {
		// Customer master
		getCustomerById: svc.getCustomerById.bind(svc),
		getCustomerDetail: svc.getCustomerDetail.bind(svc),
		listCustomers: svc.listCustomers.bind(svc),
		listCustomerOptions: svc.listCustomerOptions.bind(svc),
		listCustomerDirectory: svc.listCustomerDirectory.bind(svc),
		createCustomer: svc.createCustomer.bind(svc),
		updateCustomer: svc.updateCustomer.bind(svc),
		deleteCustomer: svc.deleteCustomer.bind(svc),

		// Profile & credit
		upsertCustomerProfile: svc.upsertCustomerProfile.bind(svc),
		setCreditHold: svc.setCreditHold.bind(svc),

		// Contacts
		addCustomerContact: svc.addCustomerContact.bind(svc),
		deleteCustomerContact: svc.deleteCustomerContact.bind(svc),

		// Communications
		logCommunication: svc.logCommunication.bind(svc),

		// Attachments
		addCustomerAttachment: svc.addCustomerAttachment.bind(svc),
		deleteCustomerAttachment: svc.deleteCustomerAttachment.bind(svc),

		// Price lists
		listPriceLists: svc.listPriceLists.bind(svc),
		createPriceList: svc.createPriceList.bind(svc),
		addPriceListItem: svc.addPriceListItem.bind(svc),
		deletePriceList: svc.deletePriceList.bind(svc),
		deletePriceListItem: svc.deletePriceListItem.bind(svc),
		resolveCustomerPrice: svc.resolveCustomerPrice.bind(svc),

		// Quotations
		listQuotations: svc.listQuotations.bind(svc),
		getQuotation: svc.getQuotation.bind(svc),
		createQuotation: svc.createQuotation.bind(svc),
		convertQuotationToOrder: svc.convertQuotationToOrder.bind(svc),

		// Sales orders
		listSalesOrders: svc.listSalesOrders.bind(svc),
		getSalesOrder: svc.getSalesOrder.bind(svc),
		createSalesOrder: svc.createSalesOrder.bind(svc),
		approveSalesOrder: svc.approveSalesOrder.bind(svc),
		confirmSalesOrder: svc.confirmSalesOrder.bind(svc),
		advanceSalesOrderStatus: svc.advanceSalesOrderStatus.bind(svc),
		shipSalesOrder: svc.shipSalesOrder.bind(svc),
		invoiceSalesOrder: svc.invoiceSalesOrder.bind(svc)
	};
}
