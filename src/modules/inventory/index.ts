import type { ModuleDefinition } from '$platform/modules/types';

export const inventoryModule: ModuleDefinition = {
	manifest: {
		id: 'inventory',
		name: 'Inventory & Warehouse',
		layer: 'feature',
		dependencies: ['core']
	}
};

export { createInventoryApi, type InventoryApi } from './api';
export type {
	ItemInput,
	ItemBarcodeInput,
	ItemAttachmentInput,
	ItemType,
	ItemStatus,
	ValuationMethod,
	BarcodeType,
	PackagingLevel,
	AttachmentType
} from './service';
export type {
	WarehouseStatus,
	BinLocationType,
	TransferStatus,
	MovementType,
	WarehouseInput,
	BinInput,
	StockAdjustmentInput,
	TransferLineInput,
	TransferInput,
	CycleCountInput,
	CycleCountLineCountInput,
	AgingBucket
} from './warehouse-service';
export { IA002_VALUE_THRESHOLD, DEFAULT_AGING_BUCKETS } from './warehouse-service';
