// Read-only: dump live Bitable field names for key tables, to detect drift vs code.
import { readFileSync } from 'node:fs';

const vars = {};
for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
	const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
	if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const tokRes = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ app_id: vars.LARK_APP_ID, app_secret: vars.LARK_APP_SECRET })
});
const tok = await tokRes.json();
if (!tok.tenant_access_token) {
	console.error('token failed', tok);
	process.exit(1);
}
const auth = { Authorization: `Bearer ${tok.tenant_access_token}` };
const app = vars.LARK_BITABLE_APP_TOKEN;

const tables = {
	'Business Partner (SUPPLIER)': vars.LARK_SUPPLIER_TABLE_ID || vars.LARK_BP_TABLE_ID,
	'Projects': vars.LARK_PROJECT_TABLE_ID,
	'Doc Hub': vars.LARK_DOCHUB_TABLE_ID,
	'Dict': vars.LARK_DICT_TABLE_ID,
	'Contact Person': vars.LARK_BP_CONTACT_TABLE_ID
};

for (const [label, tableId] of Object.entries(tables)) {
	if (!tableId) { console.log(`\n### ${label}: (no table id set)`); continue; }
	const r = await fetch(
		`https://open.feishu.cn/open-apis/bitable/v1/apps/${app}/tables/${tableId}/fields?page_size=200`,
		{ headers: auth }
	);
	const j = await r.json();
	if (j.code !== 0) { console.log(`\n### ${label} (${tableId}): ERROR ${j.code} ${j.msg}`); continue; }
	const names = (j.data.items || []).map((f) => `${f.field_name} [${f.type}]`);
	console.log(`\n### ${label} (${tableId})`);
	for (const n of names) console.log('  - ' + n);
}
