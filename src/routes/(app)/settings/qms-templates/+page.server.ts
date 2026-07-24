import type { PageServerLoad } from './$types';
import {
	listFileTemplates,
	type FileTemplateItem
} from '$platform/integrations/lark/file-template-library';

/**
 * ISO 9001 QMS template library. Reads the Bitable **File Template** table (the
 * source of truth: template master data + the blank template files). Master-data
 * CRUD lives in Bitable, not here.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.platform) {
		return {
			fileTemplates: [] as FileTemplateItem[],
			fileTemplateRevision: null as number | null,
			fileTemplateMessage: 'Cloudflare platform bindings are required.' as string | null
		};
	}

	try {
		const lib = await listFileTemplates(event.platform.env);
		return {
			fileTemplates: lib.items,
			fileTemplateRevision: lib.revision,
			fileTemplateMessage: null as string | null
		};
	} catch (err) {
		return {
			fileTemplates: [] as FileTemplateItem[],
			fileTemplateRevision: null as number | null,
			fileTemplateMessage: `无法读取 Bitable File Template 表：${(err as Error)?.message ?? '未知错误'}`
		};
	}
};
