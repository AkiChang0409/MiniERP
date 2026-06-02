import type { RequestHandler } from './$types';

import { createModuleContext } from '$platform/modules';
import { createProcurementApi } from '$modules/procurement';
import { fail, ok } from '$platform/http';

export const GET: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);
		const suppliers = await procurement.listSuppliers();
		return ok(suppliers);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

export const POST: RequestHandler = async (event) => {
	try {
		const ctx = await createModuleContext(event);
		const procurement = createProcurementApi(ctx);

		const body = (await event.request.json()) as {
			name?: string;
			address?: string;
			contact?: string;
			itemDescription?: string;
			dateCreate?: string;
			projectRelated?: string;
			gstRegNo?: string;
			contacts?: Array<{
				name?: string;
				phoneEmail?: string;
				wechat?: string;
				position?: string;
			}>;
			metadata?: unknown;
			profile?: {
				supplierType?: 'individual' | 'corporate_local' | 'corporate_international';
				supplierStatus?: 'approved' | 'preferred' | 'on_hold' | 'blacklisted';
				acraUen?: string;
				businessRegistrationNo?: string;
				gstRegistrationStatus?: 'registered' | 'not_registered' | 'exempt' | 'unknown';
				taxCode?: 'SR' | 'ZR' | 'ES' | 'OP';
				billingAddress?: string;
				shippingAddress?: string;
				bankName?: string;
				bankAccountNo?: string;
				swiftCode?: string;
				creditTerms?: string;
				paymentTerms?: string;
				preferredCurrency?: string;
				supplierCategory?: string;
			};
			complianceRecords?: Array<{
				recordType: 'licence' | 'permit' | 'insurance' | 'certificate' | 'other';
				title?: string;
				issuer?: string;
				referenceNo?: string;
				issueDate?: string;
				expiryDate?: string;
				status?: 'valid' | 'expiring' | 'expired' | 'pending_review';
				notes?: string;
			}>;
			attachments?: Array<{
				attachmentType: 'mou' | 'nda' | 'contract' | 'certificate' | 'licence' | 'permit' | 'insurance' | 'other';
				title?: string;
				fileName?: string;
				fileUrl?: string;
				expiryDate?: string;
				notes?: string;
			}>;
		};

		if (!body.name) {
			return fail('Missing required field: name');
		}

		const result = await procurement.createSupplier({
			name: body.name,
			address: body.address,
			contact: body.contact,
			itemDescription: body.itemDescription,
			dateCreate: body.dateCreate,
			projectRelated: body.projectRelated,
			gstRegNo: body.gstRegNo,
			profile: body.profile,
			contacts: (body.contacts ?? [])
				.map((c) => ({
					name: String(c.name ?? '').trim(),
					phoneEmail: String(c.phoneEmail ?? '').trim() || undefined,
					wechat: String(c.wechat ?? '').trim() || undefined,
					position: String(c.position ?? '').trim() || undefined
				}))
				.filter((c) => c.name),
			complianceRecords: (body.complianceRecords ?? [])
				.map((record) => ({
					recordType: record.recordType,
					title: String(record.title ?? '').trim(),
					issuer: record.issuer,
					referenceNo: record.referenceNo,
					issueDate: record.issueDate,
					expiryDate: record.expiryDate,
					status: record.status,
					notes: record.notes
				}))
				.filter((record) => record.title),
			attachments: (body.attachments ?? [])
				.map((attachment) => ({
					attachmentType: attachment.attachmentType,
					title: String(attachment.title ?? '').trim(),
					fileName: attachment.fileName,
					fileUrl: attachment.fileUrl,
					expiryDate: attachment.expiryDate,
					notes: attachment.notes
				}))
				.filter((attachment) => attachment.title),
			metadata: body.metadata ? JSON.stringify(body.metadata) : undefined
		});

		return ok({ id: result.id }, 201);
	} catch (e) {
		return fail((e as Error).message, 500);
	}
};

