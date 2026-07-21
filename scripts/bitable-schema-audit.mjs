#!/usr/bin/env node
/**
 * Bitable schema audit — read-only snapshot of the live Lark Base structure.
 *
 * Traverses every table in the Base and records each field's name + type. Writes
 * a machine-readable snapshot to reports/bitable-schema.json. If a previous
 * snapshot exists, it diffs against it and prints what changed (added / removed /
 * renamed-or-retyped fields, added / removed tables) — this is the drift check to
 * run whenever someone edits the Base, so MiniERP field mappings can be realigned.
 *
 * Usage:
 *   node scripts/bitable-schema-audit.mjs            # audit + diff vs last snapshot
 *   node scripts/bitable-schema-audit.mjs --no-write # print only, don't update snapshot
 *
 * Credentials come from .dev.vars (LARK_APP_ID / LARK_APP_SECRET /
 * LARK_BITABLE_APP_TOKEN). Read-only: only calls list-tables / list-fields.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const SNAPSHOT_PATH = 'reports/bitable-schema.json';
const API = 'https://open.feishu.cn/open-apis';

// Lark Bitable field type codes → human labels.
const TYPE_NAMES = {
	1: 'Text', 2: 'Number', 3: 'SingleSelect', 4: 'MultiSelect', 5: 'DateTime',
	7: 'Checkbox', 11: 'Person', 13: 'Phone', 15: 'Url', 17: 'Attachment',
	18: 'SingleLink', 19: 'Lookup', 20: 'Formula', 21: 'DuplexLink', 22: 'Location',
	23: 'GroupChat', 1001: 'CreatedTime', 1002: 'ModifiedTime', 1003: 'CreatedUser',
	1004: 'ModifiedUser', 1005: 'AutoNumber'
};
const typeName = (t) => TYPE_NAMES[t] || `type-${t}`;

function loadDevVars() {
	const vars = {};
	for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	return vars;
}

async function tenantToken(vars) {
	const r = await fetch(`${API}/auth/v3/tenant_access_token/internal`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ app_id: vars.LARK_APP_ID, app_secret: vars.LARK_APP_SECRET })
	});
	const j = await r.json();
	if (!j.tenant_access_token) throw new Error(`token failed: ${j.code} ${j.msg}`);
	return j.tenant_access_token;
}

async function listTables(auth, app) {
	const out = [];
	let pageToken;
	do {
		const qs = new URLSearchParams({ page_size: '100' });
		if (pageToken) qs.set('page_token', pageToken);
		const j = await (await fetch(`${API}/bitable/v1/apps/${app}/tables?${qs}`, { headers: auth })).json();
		if (j.code !== 0) throw new Error(`list tables failed: ${j.code} ${j.msg}`);
		for (const t of j.data.items || []) out.push({ tableId: t.table_id, name: t.name });
		pageToken = j.data.has_more ? j.data.page_token : undefined;
	} while (pageToken);
	return out;
}

async function listFields(auth, app, tableId) {
	// Primary: metadata /fields endpoint (has types). Fallback: /records/search
	// (names only) — the fields endpoint occasionally returns 2200 for some tables.
	const out = [];
	let pageToken;
	do {
		const qs = new URLSearchParams({ page_size: '200' });
		if (pageToken) qs.set('page_token', pageToken);
		const j = await (await fetch(`${API}/bitable/v1/apps/${app}/tables/${tableId}/fields?${qs}`, { headers: auth })).json();
		if (j.code !== 0) {
			if (out.length === 0) return await fieldsViaSearch(auth, app, tableId, j);
			break;
		}
		for (const f of j.data.items || []) out.push({ name: f.field_name, type: f.type, typeName: typeName(f.type) });
		pageToken = j.data.has_more ? j.data.page_token : undefined;
	} while (pageToken);
	return { fields: out, source: 'fields' };
}

async function fieldsViaSearch(auth, app, tableId, fieldsErr) {
	const j = await (await fetch(`${API}/bitable/v1/apps/${app}/tables/${tableId}/records/search?page_size=1`, {
		method: 'POST', headers: auth, body: '{}'
	})).json();
	if (j.code !== 0 || !j.data?.items?.length) {
		return { fields: [], source: 'unavailable', note: `fields:${fieldsErr.code}/${fieldsErr.msg}; search:${j.code}/${j.msg || 'empty'}` };
	}
	const fields = Object.keys(j.data.items[0].fields).map((name) => ({ name, type: null, typeName: '(unknown — via search)' }));
	return { fields, source: 'search', note: `fields endpoint failed (${fieldsErr.code}/${fieldsErr.msg}); names via record sample, types unknown` };
}

function diffSnapshots(prev, curr) {
	const changes = [];
	const prevTables = new Map(prev.tables.map((t) => [t.tableId, t]));
	const currTables = new Map(curr.tables.map((t) => [t.tableId, t]));
	for (const [id, t] of currTables) if (!prevTables.has(id)) changes.push(`+ TABLE added: "${t.name}" (${id})`);
	for (const [id, t] of prevTables) if (!currTables.has(id)) changes.push(`- TABLE removed: "${t.name}" (${id})`);
	for (const [id, cur] of currTables) {
		const pre = prevTables.get(id);
		if (!pre) continue;
		if (pre.name !== cur.name) changes.push(`~ TABLE renamed: "${pre.name}" → "${cur.name}" (${id})`);
		const preF = new Map(pre.fields.map((f) => [f.name, f]));
		const curF = new Map(cur.fields.map((f) => [f.name, f]));
		for (const [n, f] of curF) if (!preF.has(n)) changes.push(`  + [${cur.name}] field added: "${n}" [${f.typeName}]`);
		for (const [n, f] of preF) if (!curF.has(n)) changes.push(`  - [${cur.name}] field removed: "${n}" [${f.typeName}]`);
		for (const [n, f] of curF) {
			const p = preF.get(n);
			if (p && p.type != null && f.type != null && p.type !== f.type)
				changes.push(`  ~ [${cur.name}] field retyped: "${n}" [${p.typeName}] → [${f.typeName}]`);
		}
	}
	return changes;
}

// ── main ──────────────────────────────────────────────────────────────────
const noWrite = process.argv.includes('--no-write');
const vars = loadDevVars();
const app = vars.LARK_BITABLE_APP_TOKEN;
if (!app) throw new Error('LARK_BITABLE_APP_TOKEN not set in .dev.vars');
const auth = { Authorization: `Bearer ${await tenantToken(vars)}`, 'Content-Type': 'application/json' };

const tables = await listTables(auth, app);
const snapshot = { appToken: app, tableCount: tables.length, tables: [] };

for (const t of tables) {
	const { fields, source, note } = await listFields(auth, app, t.tableId);
	snapshot.tables.push({ tableId: t.tableId, name: t.name, source, note, fields });
}
// Stable ordering so snapshots diff cleanly regardless of API order.
snapshot.tables.sort((a, b) => a.name.localeCompare(b.name));

// ── readable report ─────────────────────────────────────────────────────
console.log(`\n=== Lark Base schema — ${snapshot.tableCount} tables ===`);
for (const t of snapshot.tables) {
	const tag = t.source === 'fields' ? '' : `  [${t.source}${t.note ? ': ' + t.note : ''}]`;
	console.log(`\n## ${t.name}  (${t.tableId})${tag}`);
	for (const f of t.fields) console.log(`   - ${f.name}  [${f.typeName}]`);
	if (!t.fields.length) console.log('   (no fields readable)');
}

// ── diff vs previous snapshot ────────────────────────────────────────────
if (existsSync(SNAPSHOT_PATH)) {
	const prev = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
	const changes = diffSnapshots(prev, snapshot);
	console.log(`\n=== Drift vs previous snapshot (${prev.generatedAt || 'unknown time'}) ===`);
	if (!changes.length) console.log('  (no changes)');
	else for (const c of changes) console.log('  ' + c);
} else {
	console.log(`\n(no previous snapshot at ${SNAPSHOT_PATH} — this run establishes the baseline)`);
}

// ── persist snapshot ─────────────────────────────────────────────────────
if (!noWrite) {
	snapshot.generatedAt = new Date().toISOString();
	if (!existsSync('reports')) mkdirSync('reports', { recursive: true });
	writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2));
	console.log(`\nSnapshot written → ${SNAPSHOT_PATH}  (commit it; next run diffs against it)`);
}
