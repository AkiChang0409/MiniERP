/**
 * SmartFin Bitable registry — the concrete Base + table set to sync
 * (Bitable-as-source-of-truth). Table ids come from the Base introspection dump;
 * they're stable. `ready:false` marks tables that are still skeletons in Bitable
 * (only a title field) — skipped by "sync all" until fields are built.
 *
 * The Base app_token is one for the whole Base; it comes from env
 * (`LARK_BITABLE_APP_TOKEN`). It is a Base identifier, not the Lark app secret.
 */
export interface BitableTableDef {
	tableId: string;
	name: string;
	/** stable slug used for the typed `bt_<key>` mirror + routing. */
	key: string;
	/** false = still a skeleton table in Bitable (skip in bulk sync). */
	ready: boolean;
}

export const BITABLE_TABLES: readonly BitableTableDef[] = [
	{ tableId: 'tblQzG5SD2URlzs6', name: '🚩 Projects', key: 'projects', ready: true },
	{ tableId: 'tblW3ug6R6JTDPvd', name: '✅  Tasks', key: 'tasks', ready: true },
	{ tableId: 'tblIk8QcBeEPAUL8', name: 'Requirement', key: 'requirement', ready: true },
	{ tableId: 'tblfY3urfppAncOZ', name: 'Deliverable', key: 'deliverable', ready: true },
	{ tableId: 'tblQ4XMPWLVALfrF', name: 'Doc Hub', key: 'doc_hub', ready: true },
	{ tableId: 'tblJcL3sRLYqhX7G', name: 'Doc Category Dictionary', key: 'doc_category', ready: true },
	{ tableId: 'tblqL7J7D6tCabvM', name: 'QA & Test', key: 'qa_test', ready: true },
	{ tableId: 'tblP6qV21OatoslO', name: 'File Template', key: 'file_template', ready: true },
	{ tableId: 'tbl0pcxKZFCYZZ4l', name: 'QMS Record', key: 'qms_record', ready: true },
	{ tableId: 'tbliFPrXsruKos4f', name: 'Members', key: 'members', ready: true },
	{ tableId: 'tblaIbspkF5SUn6B', name: 'Department', key: 'department', ready: true },
	// The old "Business Partner" table was split: this id was renamed to "Customers",
	// and suppliers moved to a new dedicated table (`suppliers` below).
	{ tableId: 'tblsYri9cgxgfYrB', name: 'Customers', key: 'customers', ready: true },
	{ tableId: 'tblBbsCszL823vz9', name: 'Suppliers', key: 'suppliers', ready: true },
	{ tableId: 'tblZcoJ7hVTWVk1b', name: 'Contact Person', key: 'contact_person', ready: true },
	{ tableId: 'tbl8x8L1ZazHESLj', name: 'Quotation', key: 'quotation', ready: false },
	{ tableId: 'tblacMmS2cFonqkx', name: 'Items', key: 'items', ready: true },
	{ tableId: 'tblWCyise8iEE4Lz', name: 'Warehouse', key: 'warehouse', ready: true },
	{ tableId: 'tbluDI9IO3BItKl0', name: 'Inventory Balance', key: 'inventory_balance', ready: true },
	{ tableId: 'tblCeCjuLupnX6Im', name: 'Procurement Request (Pending)', key: 'procurement_request', ready: false },
	{ tableId: 'tbl9EoyDIFn5r9JY', name: 'Purchase Order', key: 'purchase_order', ready: true },
	{ tableId: 'tblhuqow8EHcpU3l', name: 'Inventory Flow', key: 'inventory_flow', ready: true },
	{ tableId: 'tblcpDkHblGLwtzL', name: 'Shipment Items', key: 'shipment_items', ready: true },
	{ tableId: 'tblepuB54ojDCnE6', name: 'Supplier Invoice', key: 'supplier_invoice', ready: true },
	{ tableId: 'tblu0YO7vWUhDfTM', name: 'Customer Invoice', key: 'customer_invoice', ready: true },
	{ tableId: 'tblDaq2hvsa1JTkj', name: 'Income', key: 'income', ready: true },
	{ tableId: 'tblMAHBd3erMl8ql', name: 'Outcome', key: 'outcome', ready: true },
	{ tableId: 'tbliwRdAiFOpYnTR', name: 'Daily Report', key: 'daily_report', ready: true },
	{ tableId: 'tbl7Cn3ltyRPG3hk', name: 'Action List', key: 'action_list', ready: true },
	{ tableId: 'tblf8alBar0LVTgl', name: 'Leave', key: 'leave', ready: true },
	{ tableId: 'tblq0hnIlKKCCWiQ', name: 'Risk', key: 'risk', ready: true },
	{ tableId: 'tbl94v1J7CKAzkPQ', name: 'Table Link', key: 'table_link', ready: true },
	{ tableId: 'tblJXaBlnO36ofmd', name: 'Quarter(pending)', key: 'quarter', ready: false },
	{ tableId: 'tblI08F3EPrkD90R', name: '💡  Instructions', key: 'instructions', ready: true }
];

export function bitableAppToken(env: Env): string {
	const token = env.LARK_BITABLE_APP_TOKEN;
	if (!token) {
		throw new Error('LARK_BITABLE_APP_TOKEN is not configured');
	}
	return token;
}

export function findBitableTable(idOrKey: string): BitableTableDef | undefined {
	return BITABLE_TABLES.find((t) => t.tableId === idOrKey || t.key === idOrKey);
}
