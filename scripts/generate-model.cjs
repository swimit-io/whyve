#!/usr/bin/env node
/* Generate src/model.json from the fixed-column tables in docs/record-model.md. `--check` fails on drift. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'docs/record-model.md'), 'utf8');

function table(heading, columns) {
    const lines = source.split('\n'), start = lines.findIndex(l => l.startsWith('## ') && l.slice(3).replace(/^\d+\.\s*/, '') === heading);
    if (start < 0) throw new Error(`Missing section: ${heading}`);
    const rows = [];
    let header = null;
    for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
        const line = lines[i];
        if (!line.startsWith('|')) { if (header) break; continue; }
        const cells = line.slice(1, -1).split('|').map(c => c.trim());
        if (!header) { header = cells; if (JSON.stringify(header) !== JSON.stringify(columns)) throw new Error(`${heading}: columns ${header.join(',')} differ from ${columns.join(',')}`); continue; }
        if (cells.every(c => /^-+$/.test(c))) continue;
        if (cells.length !== columns.length) throw new Error(`${heading}: malformed row ${line}`);
        rows.push(Object.fromEntries(columns.map((c, j) => [c, cells[j]])));
    }
    if (!rows.length) throw new Error(`${heading}: empty table`);
    return rows;
}
const TYPES = ['string', 'string_list', 'kind', 'scope', 'key', 'timestamp', 'id', 'id_list', 'schema', 'state', 'authorization', 'reason', 'delimiter', 'date', 'digest'];
function type(value) {
    if (value.startsWith('enum:')) return { type: 'enum', values: value.slice(5).split(',') };
    if (!TYPES.includes(value)) throw new Error(`Unknown type ${value}`);
    return { type: value };
}
function limit(value) {
    if (value === '0') return {};
    const list = /^(\d+)x(\d+)$/.exec(value);
    if (list) return { max_items: Number(list[1]), max_item_chars: Number(list[2]) };
    if (!/^\d+$/.test(value)) throw new Error(`Invalid limit ${value}`);
    return { max: Number(value) };
}
const strip = value => value.replace(/`/g, '');
const header = row => ({ key: row.key, ...type(row.type), class: row.class, ...limit(row.limit), rule: strip(row.rule) });

const common = table('Common headers', ['order', 'key', 'type', 'class', 'limit', 'rule']).map((row, i) => {
    if (Number(row.order) !== i + 1) throw new Error('Common header order must be consecutive.');
    return header(row);
});
const kindHeaders = table('Kind headers', ['kind', 'key', 'type', 'class', 'limit', 'rule']);
const sections = table('Sections', ['kind', 'order', 'section', 'alias', 'field', 'required', 'list', 'flag']);
const kinds = {};
for (const row of table('Kinds', ['kind', 'schema', 'authority', 'key', 'slot', 'update', 'filename', 'retire', 'summary'])) {
    const own = sections.filter(s => s.kind === row.kind);
    own.forEach((s, i) => { if (Number(s.order) !== i + 1) throw new Error(`${row.kind}: section order must be consecutive.`); });
    if (!own.length || own[0].required !== 'yes') throw new Error(`${row.kind}: the first section is the required primary meaning.`);
    kinds[row.kind] = {
        schema: row.schema, authority: row.authority, key: row.key, slot: row.slot, update: row.update, filename: row.filename,
        retire: row.retire.split(','), summary: row.summary,
        headers: kindHeaders.filter(h => h.kind === row.kind).map(header),
        sections: own.map(s => ({ name: s.section, alias: s.alias, field: s.field, required: s.required === 'yes', list: s.list === 'yes', flag: s.flag === '-' ? null : s.flag })),
    };
}
for (const h of kindHeaders) if (!kinds[h.kind]) throw new Error(`Unknown kind ${h.kind}`);
for (const s of sections) if (!kinds[s.kind]) throw new Error(`Unknown kind ${s.kind}`);
const limits = Object.fromEntries(table('Limits', ['name', 'value', 'rule']).map(row => [row.name, Number(row.value)]));
const model = {
    schema: 'whyve-record-model/v3', protocol: 'context-common/v3', area_index_schema: 'context-area-index/v2', root_index_schema: 'context-root-index/v2',
    sources_section: { name: 'Sources', alias: '출처' }, common, kinds, limits,
};
const output = JSON.stringify(model, null, 1) + '\n', target = path.join(root, 'src/model.json');
if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
        console.error('src/model.json differs from docs/record-model.md; run node scripts/generate-model.cjs.');
        process.exit(1);
    }
}
else fs.writeFileSync(target, output);
