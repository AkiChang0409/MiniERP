export type ActivityVariant = 'info' | 'success' | 'warn';

export function parseAuditMetadata(raw: string | null): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw) as unknown;
		return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/**
 * Human-readable line for the project activity feed (English UI copy).
 */
export function summarizeAuditForProject(action: string, meta: Record<string, unknown> | null): string {
	const str = (k: string) => (meta && typeof meta[k] === 'string' ? (meta[k] as string) : '');
	const num = (k: string) => (meta && typeof meta[k] === 'number' ? (meta[k] as number) : null);

	switch (action) {
		case 'project.update': {
			const name = str('name');
			return name ? `Updated project settings (${name})` : 'Updated project settings';
		}
		case 'project.archive':
			return 'Project archived';
		case 'project.remove':
			return 'Project removed';
		case 'contract.create': {
			const src = str('source');
			if (src === 'ar_document_upload' || src === 'doc_hub_upload') {
				const fn = str('fileName');
				return fn ? `Uploaded contract document (${fn})` : 'Uploaded contract document';
			}
			return 'Added a contract record';
		}
		case 'contract.update':
			return 'Updated a contract record';
		case 'contract.delete':
			return 'Removed a contract record';
		case 'quotation.create': {
			const src = str('source');
			if (src === 'ar_document_upload' || src === 'doc_hub_upload') {
				const fn = str('fileName');
				return fn ? `Uploaded quotation document (${fn})` : 'Uploaded quotation document';
			}
			return 'Added a quotation record';
		}
		case 'quotation.update':
			return 'Updated a quotation record';
		case 'quotation.delete':
			return 'Removed a quotation record';
		case 'purchase_order.create': {
			const po = str('poNumber');
			if (str('source') === 'ar_document_upload') {
				const fn = str('fileName');
				if (po && fn) return `Uploaded PO ${po} (${fn})`;
				if (po) return `Uploaded purchase order ${po} (AR)`;
				if (fn) return `Uploaded purchase order document (${fn})`;
				return 'Uploaded purchase order (AR)';
			}
			return po ? `Added purchase order ${po}` : 'Added a purchase order';
		}
		case 'purchase_order.update': {
			const po = str('poNumber');
			return po ? `Updated purchase order ${po}` : 'Updated a purchase order';
		}
		case 'purchase_order.delete':
			return 'Removed a purchase order';
		case 'expense.create': {
			if (str('source') === 'ar_document_upload') {
				const fn = str('fileName');
				const cat = str('category');
				if (fn && cat) return `Uploaded expense document (${fn}) · ${cat}`;
				if (fn) return `Uploaded expense document (${fn})`;
			}
			const cat = str('category');
			const amt = num('amount');
			const cur = str('currency') || 'SGD';
			if (cat && amt != null) return `Added expense: ${cat} (${cur} ${amt})`;
			if (cat) return `Added expense: ${cat}`;
			return 'Added an expense record';
		}
		case 'expense.update':
			return 'Updated an expense record';
		case 'expense.delete':
			return 'Removed an expense record';
		case 'invoice_out.create': {
			const no = str('invoiceNo');
			const fn = str('fileName');
			if (no && fn) return `Uploaded customer invoice ${no} (${fn})`;
			if (no) return `Uploaded customer invoice ${no}`;
			return 'Uploaded customer invoice (AR)';
		}
		case 'invoice_in.create': {
			const sup = str('supplierName');
			const fn = str('fileName');
			if (sup && fn) return `Uploaded supplier invoice — ${sup} (${fn})`;
			if (sup) return `Uploaded supplier invoice — ${sup}`;
			return 'Uploaded supplier invoice (AR)';
		}
		case 'invoice_in.update':
			return 'Updated supplier invoice';
		case 'invoice_in.delete':
			return 'Removed supplier invoice';
		case 'invoice_out.update': {
			const st = str('status');
			return st ? `Updated customer invoice (status: ${st})` : 'Updated customer invoice';
		}
		case 'invoice_out.delete':
			return 'Removed customer invoice';
		case 'project.task.submitted': {
			const name = str('taskName');
			return name ? `Task “${name}” submitted for review` : 'A task was submitted for review';
		}
		case 'project.task.approved': {
			const name = str('taskName');
			return name ? `Task “${name}” approved & completed` : 'A task was approved & completed';
		}
		case 'project.task.rejected': {
			const name = str('taskName');
			const reason = str('reason');
			const base = name ? `Task “${name}” sent back for rework` : 'A task was sent back for rework';
			return reason ? `${base} — ${reason}` : base;
		}
		case 'project.task.blocked': {
			const name = str('taskName');
			return name
				? `Task “${name}” blocked by an unfinished predecessor`
				: 'A task is blocked by an unfinished predecessor';
		}
		case 'document.unclassified_upload': {
			const fn = str('fileName');
			const tag = str('tag');
			if (tag && fn) return `Uploaded other document [${tag}] (${fn})`;
			if (fn) return `Uploaded other document (${fn})`;
			return 'Uploaded other document (AR)';
		}
		default:
			return action.replace(/\./g, ' ');
	}
}

export function activityVariantForAction(action: string): ActivityVariant {
	// Task lifecycle transitions (system-driven) have their own colour mapping.
	if (action === 'project.task.approved') return 'success';
	if (action === 'project.task.rejected' || action === 'project.task.blocked') return 'warn';
	if (action === 'project.task.submitted') return 'info';
	if (action.endsWith('.delete') || action === 'project.remove') return 'warn';
	if (action.startsWith('project.') && action !== 'project.update') return 'warn';
	if (action === 'project.update') return 'success';
	return 'info';
}
