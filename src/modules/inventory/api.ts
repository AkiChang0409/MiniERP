import type { ModuleContext } from '$platform/modules/types';
import { InventoryService } from './service';
import { WarehouseService } from './warehouse-service';

export type InventoryApi = ReturnType<typeof createInventoryApi>;

export function createInventoryApi(ctx: ModuleContext) {
	const itemSvc = new InventoryService(ctx);
	const whSvc = new WarehouseService(ctx);

	return {
		// Items (INV001)
		listItems: itemSvc.listItems.bind(itemSvc),
		getItemDetail: itemSvc.getItemDetail.bind(itemSvc),
		lookupByBarcode: itemSvc.lookupByBarcode.bind(itemSvc),
		createItem: itemSvc.createItem.bind(itemSvc),
		updateItem: itemSvc.updateItem.bind(itemSvc),
		deleteItem: itemSvc.deleteItem.bind(itemSvc),
		generateBarcode: itemSvc.generateBarcode.bind(itemSvc),

		// Warehouses (INV002)
		listWarehouses: whSvc.listWarehouses.bind(whSvc),
		getWarehouseDetail: whSvc.getWarehouseDetail.bind(whSvc),
		createWarehouse: whSvc.createWarehouse.bind(whSvc),
		updateWarehouse: whSvc.updateWarehouse.bind(whSvc),
		deleteWarehouse: whSvc.deleteWarehouse.bind(whSvc),

		// Bins
		listBinsForWarehouse: whSvc.listBinsForWarehouse.bind(whSvc),
		getBinDetail: whSvc.getBinDetail.bind(whSvc),
		createBin: whSvc.createBin.bind(whSvc),
		updateBin: whSvc.updateBin.bind(whSvc),
		deleteBin: whSvc.deleteBin.bind(whSvc),
		lookupBinByBarcode: whSvc.lookupBinByBarcode.bind(whSvc),

		// Stock levels & movements
		listStockLevels: whSvc.listStockLevels.bind(whSvc),
		getStockLevelByItem: whSvc.getStockLevelByItem.bind(whSvc),
		listStockMovementsForItem: whSvc.listStockMovementsForItem.bind(whSvc),
		adjustStock: whSvc.adjustStock.bind(whSvc),

		// Transfers
		listTransfers: whSvc.listTransfers.bind(whSvc),
		getTransferDetail: whSvc.getTransferDetail.bind(whSvc),
		createTransfer: whSvc.createTransfer.bind(whSvc),
		shipTransfer: whSvc.shipTransfer.bind(whSvc),
		receiveTransfer: whSvc.receiveTransfer.bind(whSvc),
		cancelTransfer: whSvc.cancelTransfer.bind(whSvc),

		// Movements (audit trail) + cycle counts + aging — INV003
		listAllMovements: whSvc.listAllMovements.bind(whSvc),
		listCycleCounts: whSvc.listCycleCounts.bind(whSvc),
		getCycleCountDetail: whSvc.getCycleCountDetail.bind(whSvc),
		createCycleCount: whSvc.createCycleCount.bind(whSvc),
		recordCycleCounts: whSvc.recordCycleCounts.bind(whSvc),
		postCycleCount: whSvc.postCycleCount.bind(whSvc),
		cancelCycleCount: whSvc.cancelCycleCount.bind(whSvc),
		getInventoryAging: whSvc.getInventoryAging.bind(whSvc)
	};
}
