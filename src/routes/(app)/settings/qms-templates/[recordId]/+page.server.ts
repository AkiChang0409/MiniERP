import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getFileTemplate } from '$platform/integrations/lark/file-template-library';

/**
 * Detail page for one ISO 9001 file template: its Info/explanation, a
 * structured fill form, and a live preview. Reads the single record from the
 * Bitable File Template table.
 */
export const load: PageServerLoad = async (event) => {
	if (!event.platform) throw error(500, 'Cloudflare platform bindings are required.');

	let res: Awaited<ReturnType<typeof getFileTemplate>>;
	try {
		res = await getFileTemplate(event.platform.env, event.params.recordId);
	} catch (e) {
		throw error(502, `无法读取 Bitable File Template 记录：${(e as Error)?.message ?? '未知错误'}`);
	}
	if (!res) throw error(404, '模板不存在。');

	return { item: res.item, revision: res.revision };
};
