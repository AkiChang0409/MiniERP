import * as financeAgent from './agent';
import { financeAppSurface } from './app';
import { financeCapabilities, financeCapabilityIds } from './capabilities';
import { financeManifestV2 } from './config';
import * as financeContracts from './contracts/index';
import * as financeEvents from './events';
import type { ModuleDefinition } from '$platform/modules/types';
import { toLegacyModuleManifest } from '$platform/registry/contracts';
import * as financePolicies from './policies';
import * as financeRepositories from './repositories';
import * as financeRules from './rules';
import * as financeServices from './services';
import { financeWorkflows, financeWorkflowIds } from './workflows';

export const financeModule: ModuleDefinition = {
	manifest: toLegacyModuleManifest(financeManifestV2),
	manifestV2: financeManifestV2
};

export { createFinanceApi, type FinanceApi } from './services/api';
export {
	financeAgentActionSets,
	financeAllAgentActions,
	type FinanceAgentActionSets
} from './capabilities/agent-actions';
export type { FinanceBillingApi } from './services/billing-service';
export type { FinanceDocumentsApi } from './services/document-service';
export type { FinanceExpensesApi } from './services/expense-service';
export type { FinanceInsightsApi } from './services/insight-service';
export type { FinanceRevenueApi } from './services/revenue-service';
export type { FinanceTaxesApi } from './services/tax-service';
export type { CategoryServiceApi } from './services/category-service';
export type { FinanceEInvoiceApi } from './services/einvoice-service';
export type { FinanceInboundContract, FinancePublicGroup } from './contracts/inbound';
export { FINANCE_PUBLIC_GROUPS } from './contracts/inbound';
export { financeAppSurface };
export { financeWorkflows, financeWorkflowIds };
export { financeCapabilities, financeCapabilityIds };
// Async document-processing pipeline (Ship 2) hooks. Worker entry +
// /api/documents route invoke these to bridge document-intake's classifier
// output → finance category-aware field extraction. Exposed through the
// barrel so cross-module callers don't violate Rule 2 of the boundary linter.
export { extractDocumentFieldsCapability } from './capabilities/extract-document-fields';
export {
	categoryIdForDocumentType,
	findCategoryById,
	FALLBACK_CATEGORY_ID,
	DEFAULT_SUPPLIER_INVOICE_CATEGORY_ID,
	FINANCE_CATEGORY_CATALOG
} from './workflows/financial-document-intake/categories';
export type { CategoryDefinition } from './workflows/financial-document-intake/categories';
export {
	createFinanceTaskService,
	type FinanceTaskService,
	getTodayBriefItems,
	type TodayBriefItem,
	type TodayBriefData
} from './services/finance-task-service';
export { financeManifestV2 };
export {
	financeAgentManifest,
	classifyFinanceIntent,
	financeWorkflowBinding,
	resolveWorkflowForIntent,
	financeAgentAllowedCapabilities,
	financeAgentForbiddenActions,
	financeAgentRefusalCopy,
	findCapabilityPolicy,
	isForbiddenAction
} from './agent';
export type {
	FinanceAgentManifest,
	ClassifyFinanceIntentInput,
	FinanceCapabilityPolicyEntry,
	FinanceIntent,
	FinanceIntentResult,
	FinanceAgentRequest,
	FinanceAgentResponse,
	FinanceAgentAction,
	FinanceAgentActionType,
	FinanceAgentState,
	FinanceAgentStatus,
	FinanceEvidence,
	FinanceEvidenceType,
	FinanceForbiddenAction,
	FinanceOwnedDomain,
	FinanceRiskLevel,
	FinanceUserDecisionRequest,
	FinanceValidationIssue
} from './agent';
export { generatePeppolUblXml, createAccessPointClient } from './services/peppol';
export type {
	PeppolInvoiceLine,
	PeppolInvoiceInput,
	PeppolXmlResult,
	PeppolParty,
	AccessPointConfig
} from './services/peppol';
export {
	SG_GST_RATE,
	SG_GST_RATE_PERCENT,
	GST_SUPPLY_CODES,
	GST_SUPPLY_CODE_LABELS,
	GST_SUPPLY_CODE_RATE,
	resolveGstCode,
	calcGstFromSubtotal,
	calcGstFromGrossAmount,
	calcSubtotalFromGross
} from './rules/gst-constants';
export type { GstSupplyCode } from './rules/gst-constants';

export {
	financeContracts,
	financeServices,
	financeRules,
	financeRepositories,
	financePolicies,
	financeEvents
};

export const financePublicSurface = {
	manifest: financeManifestV2,
	agent: financeAgent,
	contracts: financeContracts,
	capabilities: financeCapabilities,
	workflows: financeWorkflows,
	services: financeServices,
	app: financeAppSurface
};
