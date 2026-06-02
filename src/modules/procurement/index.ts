import type { ModuleDefinition } from '$platform/modules/types';

export const procurementModule: ModuleDefinition = {
	manifest: {
		id: 'procurement',
		name: 'Procurement & Supplier',
		layer: 'feature',
		dependencies: ['core', 'inventory']
	}
};

export { createProcurementApi, type ProcurementApi } from './api';
