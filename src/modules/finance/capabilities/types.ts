import type { z } from 'zod';
import type { PlatformCapabilityContext } from '$platform/ai/capability-registry';
import type { FinanceRiskLevel } from '../agent/types';

/** A suggested follow-up finance task surfaced after a workflow completes. */
export interface SuggestedNextTask {
	title: string;
	detail: string;
	workflowId: string | null;
	count: number;
}

/** Candidate supplier returned by the supplier-lookup port (procurement-backed). */
export interface SupplierLookupResult {
	id: string;
	name: string;
	recentInvoiceCount?: number;
}

/** Candidate purchase order returned by the PO-lookup port (procurement-backed). */
export interface PurchaseOrderLookupResult {
	id: string;
	poNumber: string;
	supplierId: string;
	supplierName: string;
	totalAmount: number;
	currency: string;
}

/**
 * Service ports injected by the composition root (routes / workers / the
 * workflow advance route) so a capability can FORWARD to a real service or
 * cross-module data source WITHOUT importing it — preserving module boundaries
 * and the "capability forwards, never reimplements" rule. Each port is optional:
 * pure unit / demo calls omit `deps`, and forwarding capabilities degrade
 * gracefully to an empty result rather than fabricating mock data.
 */
export interface FinanceCapabilityDeps {
	/** Suggest the next finance task (→ finance-task-service). */
	suggestNextTask?(input: {
		afterWorkflowId?: string;
		afterSupplierName?: string;
	}): Promise<SuggestedNextTask | null>;
	/** Look up candidate suppliers for matching (→ procurement supplier gateway). */
	lookupSuppliers?(query: { counterpartyName?: string }): Promise<SupplierLookupResult[]>;
	/** Look up candidate purchase orders for matching (→ procurement PO gateway). */
	lookupPurchaseOrders?(query: {
		supplierId?: string;
		supplierName?: string;
		totalAmount?: number;
		currency?: string;
	}): Promise<PurchaseOrderLookupResult[]>;
}

/**
 * Finance capability execution context. Extends the platform context (which
 * carries `tenantId` / `userId` / `useMock` / `env` / `moduleContext`) so it
 * automatically tracks any future platform additions instead of drifting from a
 * hand-copied field list. Finance capabilities read `env` (Workers AI) and the
 * forwarding ones read `deps`; they do not use `moduleContext`.
 */
export interface FinanceCapabilityContext extends PlatformCapabilityContext {
	/**
	 * Optional service ports for forwarding capabilities (match-*, suggest-next).
	 * Injected per-request by the composition root; absent in unit/demo calls.
	 */
	deps?: FinanceCapabilityDeps;
}

export interface FinanceCapabilityDescriptor {
	id: string;
	description: string;
	riskLevel: FinanceRiskLevel;
}

export interface FinanceCapability<TInput, TOutput> extends FinanceCapabilityDescriptor {
	/**
	 * Runtime Zod schema for the capability input. Required in the finance
	 * reference module: the platform registry serializes it into a JSON Schema
	 * tool spec (see `listToolSpecs`) so the Finance Agent can invoke this
	 * capability via function-calling. This is the "SDK-for-agent" contract.
	 */
	inputSchema: z.ZodType<TInput>;
	execute(input: TInput, ctx: FinanceCapabilityContext): Promise<TOutput>;
}
