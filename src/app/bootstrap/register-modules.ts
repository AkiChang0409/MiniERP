/**
 * Application composition root for active module registration.
 *
 * The platform registry owns only the generic registration mechanism; concrete
 * module selection belongs to the app layer.
 */
import { coreModule } from '$platform/core';
import { documentIntakeModule } from '$modules/document-intake';
import { financeModule } from '$modules/finance';
import { hrModule } from '$modules/hr';
import { inventoryModule } from '$modules/inventory';
import { procurementModule } from '$modules/procurement';
import { projectModule } from '$modules/project';
import { registerModules } from '$platform/registry/register-all';
import { salesCrmModule } from '$modules/sales-crm';

// Procurement and Sales CRM expose supplier/customer workspaces as separate modules.
registerModules([
	coreModule,
	procurementModule,
	salesCrmModule,
	inventoryModule,
	projectModule,
	hrModule,
	financeModule,
	documentIntakeModule
]);
