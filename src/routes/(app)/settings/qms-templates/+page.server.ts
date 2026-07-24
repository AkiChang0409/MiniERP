import type { PageServerLoad } from './$types';
import { createModuleContext } from '$platform/modules';
import { createProjectApi } from '$modules/project';
import {
	listFileTemplates,
	type FileTemplateItem
} from '$platform/integrations/lark/file-template-library';

/**
 * ISO 9001 QMS template library.
 *
 * The "文件库 / 生成" gallery reads the Bitable **File Template** table (the
 * source of truth: template master data + the blank template files). The legacy
 * "模板管理" tab still reads the D1 `qms_templates` mirror; its metadata CRUD is
 * being retired in favour of managing master data directly in Bitable.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			templates: [] as unknown[],
			fileTemplates: [] as FileTemplateItem[],
			fileTemplateRevision: null as number | null,
			fileTemplateMessage: 'Cloudflare platform bindings are required.' as string | null,
			dataMessage: 'Cloudflare platform bindings are required.' as string | null
		};
	}

	// Gallery source of truth: the Bitable File Template table.
	let fileTemplates: FileTemplateItem[] = [];
	let fileTemplateRevision: number | null = null;
	let fileTemplateMessage: string | null = null;
	try {
		const lib = await listFileTemplates(event.platform.env);
		fileTemplates = lib.items;
		fileTemplateRevision = lib.revision;
	} catch (err) {
		fileTemplateMessage = `无法读取 Bitable File Template 表：${(err as Error)?.message ?? '未知错误'}`;
	}

	// Legacy D1 mirror for the metadata admin tab (best-effort).
	let templates: unknown[] = [];
	let dataMessage: string | null = null;
	try {
		const ctx = await createModuleContext(event);
		const project = createProjectApi(ctx);
		templates = await project.listQmsTemplates({ includeInactive: true });
	} catch (err) {
		const msg = (err as Error)?.message ?? '';
		dataMessage = /no such table|qms_templates/i.test(msg)
			? 'Database is missing the qms_templates table. Run `npm run db:migrate:local`.'
			: `无法读取 D1 qms_templates：${msg}`;
	}

	return { templates, fileTemplates, fileTemplateRevision, fileTemplateMessage, dataMessage };
};
