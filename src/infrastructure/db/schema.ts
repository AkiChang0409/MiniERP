/**
 * Target-layer schema barrel.
 *
 * Table definitions still live with their owning legacy modules during the
 * migration, but infrastructure/db is now the active schema assembly point.
 */

// Core platform tables (split across platform & infrastructure)
export { users } from '$platform/auth/users.schema';
export { auditLogs } from '$platform/audit/audit-log.schema';
export { companySettings } from '$platform/config/company-settings.schema';
export { uploadIdempotency, uploadFileDedup } from '$infrastructure/storage/upload-guards.schema';

// Invite codes (RBAC user invitation)
export { inviteCodes } from '$platform/auth/invite-codes.schema';

// better-auth tables (sessions, accounts, verifications)
export { sessions, accounts, verifications } from '../../platform/auth/auth-tables';

// Person tables (HR module)
export {
	persons,
	personRoles,
	employeeProfiles,
	shareholderProfiles,
	freelancerProfiles
} from '$modules/hr/repositories/person.schema';

// Sales CRM customer tables and shared customer/supplier base table
export {
	businessPartners,
	partnerCustomerProfiles
} from '$modules/sales-crm/repositories/customer.schema';

// Procurement supplier tables
export {
	partnerSupplierProfiles,
	partnerSupplierComplianceRecords,
	partnerSupplierAttachments,
	partnerSupplierEvaluations,
	partnerContacts
} from '$modules/procurement/repositories/supplier.schema';
export {
	procurementRfqs,
	procurementRfqItems,
	procurementRfqSuppliers,
	procurementSupplierQuotations,
	procurementSupplierQuotationItems,
	procurementPurchaseOrders,
	procurementPurchaseOrderItems,
	procurementPurchaseOrderReceipts
} from '$modules/procurement/repositories/rfq.schema';

// Project module
export {
	projects,
	projectEmployees,
	projectCollaborators,
	projectComments
} from '$modules/project/repositories/project.schema';

// Project archive documents (contracts / quotations / POs)
export {
	contracts,
	quotations,
	purchaseOrders,
	arDocumentLinks
} from '$modules/project/repositories/archive.schema';

// Employee tables (HR module)
export {
	employeeSalaries,
	employeeCompensationComponents,
	employeeProjectAllocations,
	compensationComponents,
	payoutRecords
} from '$modules/hr/repositories/employee.schema';

// Leave Management tables (HR module)
export {
	leaveTypes,
	leaveRequests,
	leaveBalances,
	leaveApprovalRecords
} from '$modules/hr/repositories/leave.schema';

// Attendance Management tables (HR module)
export { attendanceRecords } from '$modules/hr/repositories/attendance.schema';

// Overtime Management tables (HR module)
export {
	overtimeRequests,
	overtimeApprovalRecords
} from '$modules/hr/repositories/overtime.schema';

// Finance fact tables (canonical expense + revenue per v4 expense-revenue-design)
export {
	documents,
	businessTrips,
	expenses,
	revenue,
	expenseCategories
} from '$modules/finance/repositories/expense.schema';

// Tax tables (finance module)
export { gstReturns, personIncome, timeLogs } from '$modules/finance/repositories/tax.schema';

// Document Intake module (target-layer artifact storage)
export { documentArtifacts } from '../../modules/document-intake/repositories/document-artifact.schema';

// Inventory module (item master + attachments + barcodes)
export {
	items,
	inventoryItemAttachments,
	inventoryItemBarcodes
} from '$modules/inventory/repositories/item.schema';

// Inventory module — warehouse / bin / stock levels / movements / transfers / cycle counts
export {
	warehouses,
	warehouseBinLocations,
	inventoryStockLevels,
	inventoryStockMovements,
	inventoryStockTransfers,
	inventoryStockTransferLines,
	inventoryCycleCounts,
	inventoryCycleCountLines
} from '$modules/inventory/repositories/warehouse.schema';
