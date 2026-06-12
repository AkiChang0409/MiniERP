/**
 * Application composition root for finance capability service ports.
 *
 * Forwarding capabilities (`match-supplier` / `match-purchase-order` /
 * `suggest-next-finance-task`) declare their dependencies as the
 * `FinanceCapabilityDeps` port interface and never import a service or another
 * module directly. This is the one place allowed to wire those ports to real
 * implementations — finance's own service + the procurement module — so module
 * boundaries stay intact (the boundary linter forbids finance → procurement).
 *
 * Injected per-request into the workflow engine via `run.capabilityDeps`
 * (and available to any future agent-execution route the same way).
 */
import type { ModuleContext } from '$platform/modules/types';
import { createProcurementApi } from '$modules/procurement';
import type { FinanceCapabilityDeps } from '$modules/finance/capabilities';
import { suggestNextFinanceTask } from '$modules/finance/services/finance-task-service';

export function createFinanceCapabilityDeps(
	ctx: ModuleContext,
	opts: { tenantId?: string } = {}
): FinanceCapabilityDeps {
	const tenantId = opts.tenantId ?? 'default';
	const procurement = createProcurementApi(ctx);

	return {
		suggestNextTask: (input) =>
			suggestNextFinanceTask(ctx.db, tenantId, input, new Date()),

		lookupSuppliers: async () => {
			const suppliers = await procurement.listSuppliers();
			return suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }));
		},

		lookupPurchaseOrders: async () => {
			const pos = await procurement.listPurchaseOrders();
			return pos.map((po) => ({
				id: po.id,
				poNumber: po.poNumber,
				supplierId: po.supplierId ?? '',
				supplierName: po.supplier?.name ?? '',
				totalAmount: po.totalAmount ?? 0,
				currency: po.currency ?? 'SGD'
			}));
		}
	};
}
