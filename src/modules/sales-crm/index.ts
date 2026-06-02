import type { ModuleDefinition } from '$platform/modules/types';

export const salesCrmModule: ModuleDefinition = {
	manifest: {
		id: 'sales-crm',
		name: 'Sales & CRM',
		layer: 'feature',
		dependencies: ['core']
	}
};

export { createSalesCrmApi, type SalesCrmApi } from './api';
