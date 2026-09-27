import { contracts, ObjectValue, check, fail, object, exact, compactJson, strictJson, requireId, codepoints, shortText, stringList, substantive, timestamp, date, canonicalScope, canonicalKey, canonicalDigest, compareText, WhyveError, EXIT } from './common';
import { snapshotText, validateSnapshotSize } from './snapshot';
export type Kind = 'snapshot' | 'observation' | 'archive' | 'decision' | 'assumption' | 'term' | 'intent' | 'document';
export interface ContextDocument {
    frontmatter: ObjectValue;
    sections: Record<string, string>;
    warnings: ObjectValue[];
}
export const kinds = Object.keys(contracts.capabilities) as Kind[];
export const schemaKind = (schema: string) => /^context-(.+)\/v1$/.exec(schema)?.[1] ?? '';
export function descriptorFor(kind: string): ObjectValue | undefined { return contracts.owners[kind]?.descriptor; }
export function sectionName(schema: string, name: string): string { return contracts.aliases[schema]?.[name] ?? name; }
export function sectionValue(doc: ContextDocument, name: string): string { return Object.entries(doc.sections).find(([k]) => sectionName(doc.frontmatter.schema, k) === name)?.[1] ?? ''; }
export function existingStyle(schema: string, sections: Record<string, string>, existing: Record<string, string>): Record<string, string> {
    const aliases = contracts.aliases[schema] ?? {}, legacy = Object.keys(existing).some(k => Object.hasOwn(aliases, k));
    return Object.fromEntries(Object.entries(sections).map(([k, v]) => [legacy ? Object.keys(aliases).find(a => aliases[a] === sectionName(schema, k)) ?? k : sectionName(schema, k), v]));
}
export function validFrontmatterValue(value: unknown, nested = false): boolean {
    return value === null || typeof value === 'string' || typeof value === 'boolean' || (Array.isArray(value) && value.every(v => typeof v === 'string')) || (!nested && object(value) && Object.values(value).every(v => validFrontmatterValue(v, true)));
}
export function parseFrontmatter(text: string): {
    frontmatter: ObjectValue;
    lines: string[];
    closing: number;
} {
    check(!text.startsWith('\ufeff'), 'frontmatter_unsupported', 'UTF-8 BOM is not supported.');
    const withoutCRLF = text.replace(/\r\n/g, '');
    check(!withoutCRLF.includes('\r') && !(text.includes('\r\n') && withoutCRLF.includes('\n')), 'frontmatter_unsupported', 'Mixed or bare-CR newlines are not supported.');
    const lines = text.replace(/\r\n/g, '\n').split('\n'), closing = lines.indexOf('---', 1);
    check(lines[0] === '---' && closing > 0 && lines[closing + 1] === '', 'frontmatter_unsupported', 'Frontmatter delimiters and following blank line are required.');
    const frontmatter: ObjectValue = {};
    for (const line of lines.slice(1, closing)) {
        const split = line.indexOf(': '), key = line.slice(0, split), raw = line.slice(split + 2);
        check(split > 0 && /^[a-z][a-z0-9_]*$/.test(key) && !Object.hasOwn(frontmatter, key), 'frontmatter_unsupported', 'Invalid or duplicate frontmatter key.', { key });
        const value = strictJson(raw, 'frontmatter_unsupported');
        check(compactJson(value) === raw && validFrontmatterValue(value), 'frontmatter_unsupported', 'Frontmatter value is outside the JSON-compatible subset.', { key });
        Object.defineProperty(frontmatter, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return { frontmatter, lines, closing };
}
export function validateDescriptor(d: ObjectValue): void {
    check(object(d), 'owner_profile_invalid', 'Owner descriptor must be an object.');
    const v2 = d.schema === 'context-owner-descriptor/v2';
    exact(d, ['schema', 'owner', 'kind', 'artifact_schema', 'authority', ...(v2 ? ['structural_profile'] : [])], 'owner_profile_invalid');
    check(v2 || d.schema === 'context-owner-descriptor/v1', 'owner_profile_invalid', 'Unsupported owner descriptor.');
    check(/^[a-z][a-z0-9_-]{0,79}$/.test(d.kind) && /^context-[a-z][a-z0-9_-]*$/.test(d.owner) && /^context-[a-z][a-z0-9_-]*\/v[1-9]\d*$/.test(d.artifact_schema), 'owner_profile_invalid', 'Invalid owner coordinates.');
    check(['authoritative', 'evidence', 'staging', 'provisional', 'definitional', 'directional', 'descriptive'].includes(d.authority), 'owner_profile_invalid', 'Invalid authority.');
    check(Buffer.byteLength(compactJson(d)) <= 8192, 'owner_profile_invalid', 'Owner descriptor is too large.');
    if (!v2)
        return;
    const p = d.structural_profile;
    exact(p, ['schema', 'fields', 'sections', 'index_projection', 'lifecycle'], 'owner_profile_invalid');
    check(p.schema === 'context-structural-profile/v1' && object(p.fields) && Object.keys(p.fields).length <= 24, 'owner_profile_invalid', 'Invalid structural profile.');
    for (const [key, spec] of Object.entries(p.fields) as [
        string,
        ObjectValue
    ][]) {
        check(/^[a-z][a-z0-9_]*$/.test(key) && !contracts.common_keys.includes(key), 'owner_profile_invalid', 'Profile field collides with a common field.');
        check(object(spec) && ['string', 'string_list', 'date', 'timestamp', 'enum', 'context_id', 'context_id_list', 'relation_map'].includes(spec.type) && typeof spec.required === 'boolean', 'owner_profile_invalid', 'Invalid profile field specification.');
        const bounds = spec.type === 'string' ? ['min_chars', 'max_chars'] : ['string_list', 'context_id_list'].includes(spec.type) ? ['min_items', 'max_items', ...(spec.type === 'string_list' ? ['max_item_chars'] : [])] : [];
        for (const key of bounds)
            check(Number.isSafeInteger(spec[key]) && spec[key] >= 0, 'owner_profile_invalid', 'Invalid field bound.');
        const keys = ['type', 'required', ...bounds, ...(spec.type === 'enum' ? ['values'] : spec.type === 'relation_map' ? ['keys', 'max_items'] : [])];
        exact(spec, keys, 'owner_profile_invalid');
        if (spec.type === 'string')
            check(spec.min_chars <= spec.max_chars && spec.max_chars <= 4000 && (!spec.required || spec.min_chars >= 1), 'owner_profile_invalid', 'Invalid string bounds.');
        if (['string_list', 'context_id_list'].includes(spec.type))
            check(spec.min_items <= spec.max_items && spec.max_items <= 12 && (!spec.required || spec.min_items >= 1), 'owner_profile_invalid', 'Invalid list bounds.');
        if (spec.type === 'string_list')
            check(spec.max_item_chars >= 1 && spec.max_item_chars <= 2000, 'owner_profile_invalid', 'Invalid list item bounds.');
        if (spec.type === 'relation_map') {
            stringList(spec.keys, 'keys', 1, 12, 80);
            check(Number.isSafeInteger(spec.max_items) && spec.max_items >= 1 && spec.max_items <= 12, 'owner_profile_invalid', 'Invalid relation cardinality.');
        }
        if (spec.type === 'enum')
            stringList(spec.values, 'values', 1, 12, 80);
    }
    exact(p.sections, ['ordered', 'required', 'primary'], 'owner_profile_invalid');
    const ordered = stringList(p.sections.ordered, 'ordered', 1, 12, 80), required = stringList(p.sections.required, 'required', 1, 12, 80);
    check(new Set(ordered).size === ordered.length && ordered.every(k => !k.startsWith('#')) && compactJson(ordered.filter(k => required.includes(k))) === compactJson(required) && required.includes(p.sections.primary), 'owner_profile_invalid', 'Invalid section profile.');
    const projection = stringList(p.index_projection, 'index_projection', 0, 4, 80);
    check(projection.every(k => Object.hasOwn(p.fields, k) && ['string', 'date', 'timestamp', 'enum', 'context_id'].includes(p.fields[k].type)), 'owner_profile_invalid', 'Projection references an undeclared scalar field.');
    exact(p.lifecycle, ['allowed_topologies', 'reasons'], 'owner_profile_invalid');
    check(Array.isArray(p.lifecycle.allowed_topologies) && p.lifecycle.allowed_topologies.every((x: string) => ['create_current', 'replace_same_state', 'retire_current', 'supersede_current', 'delete_one'].includes(x)) && object(p.lifecycle.reasons), 'owner_profile_invalid', 'Invalid lifecycle topology.');
    for (const recipe of Object.values(p.lifecycle.reasons) as ObjectValue[]) {
        exact(recipe, ['topology', 'required_fields', 'forbidden_fields', 'successor', 'references'], 'owner_profile_invalid');
        check(p.lifecycle.allowed_topologies.includes(recipe.topology) && ['required', 'forbidden', 'optional'].includes(recipe.successor), 'owner_profile_invalid', 'Invalid lifecycle recipe.');
        for (const field of [...recipe.required_fields, ...recipe.forbidden_fields])
            check(Object.hasOwn(p.fields, field), 'owner_profile_invalid', 'Undeclared lifecycle field.');
        check(['retire_current', 'supersede_current'].includes(recipe.topology) && ['retired_at', 'retired_reason'].every(f => recipe.required_fields.includes(f)) && !recipe.required_fields.some((f: string) => recipe.forbidden_fields.includes(f)), 'owner_profile_invalid', 'Invalid retirement fields.');
        check(Array.isArray(recipe.references) && recipe.references.length <= 8, 'owner_profile_invalid', 'Invalid lifecycle references.');
        for (const r of recipe.references) {
            exact(r, ['location', 'field', 'target', 'match'], 'owner_profile_invalid');
            check(['predecessor', 'successor'].includes(r.location) && ['predecessor', 'successor'].includes(r.target) && ['equals', 'contains'].includes(r.match) && p.fields[r.field]?.type === (r.match === 'equals' ? 'context_id' : 'context_id_list'), 'owner_profile_invalid', 'Invalid reference recipe.');
        }
        if (recipe.topology === 'supersede_current')
            check(recipe.successor === 'required' && recipe.required_fields.includes('superseded_by') && recipe.references.some((r: ObjectValue) => r.location === 'predecessor' && r.target === 'successor') && recipe.references.some((r: ObjectValue) => r.location === 'successor' && r.target === 'predecessor'), 'owner_profile_invalid', 'Supersession requires reciprocal edges.');
    }
}
function validateProfileValue(key: string, value: unknown, spec: ObjectValue): void {
    switch (spec.type) {
        case 'string':
            check(typeof value === 'string' && !value.includes('\n') && codepoints(value) >= spec.min_chars && codepoints(value) <= spec.max_chars && (spec.min_chars === 0 || !!value.trim()), 'schema_invalid', 'Profiled string violates its bounds.', { field: key });
            break;
        case 'string_list': {
            const list = stringList(value, key, spec.min_items, spec.max_items, spec.max_item_chars);
            check(new Set(list).size === list.length, 'schema_invalid', 'Duplicate list item.', { field: key });
            break;
        }
        case 'context_id':
            requireId(value, key);
            break;
        case 'context_id_list': {
            const list = stringList(value, key, spec.min_items, spec.max_items, 36);
            list.forEach(v => requireId(v, key));
            check(new Set(list).size === list.length, 'schema_invalid', 'Duplicate context ID.');
            break;
        }
        case 'timestamp':
            timestamp(value as string);
            break;
        case 'date':
            date(value as string);
            break;
        case 'enum':
            check(spec.values.includes(value), 'schema_invalid', 'Undeclared enum value.', { field: key });
            break;
        case 'relation_map':
            check(object(value) && Object.keys(value).every(k => spec.keys.includes(k)), 'schema_invalid', 'Relations must use declared predicates.');
            for (const [predicate, ids] of Object.entries(value)) {
                const list = stringList(ids, predicate, 1, spec.max_items, 36);
                list.forEach(id => requireId(id));
                check(new Set(list).size === list.length, 'schema_invalid', 'Duplicate relation ID.');
            }
            break;
    }
}
export function validateFrontmatter(fm: ObjectValue, descriptor?: ObjectValue): ObjectValue[] {
    for (const key of ['schema', 'id', 'title', 'summary', 'created_at', 'captured_from'])
        check(Object.hasOwn(fm, key), 'schema_invalid', 'Required frontmatter field is missing.', { missing: [key] });
    const d = descriptor ?? descriptorFor(schemaKind(fm.schema));
    if (d) {
        validateDescriptor(d);
        check(d.artifact_schema === fm.schema, 'schema_invalid', 'Artifact schema differs from its descriptor.');
    }
    const profile = d?.structural_profile;
    check(profile || contracts.sections[fm.schema], 'schema_invalid', 'Unsupported artifact schema.', { schema: fm.schema });
    requireId(fm.id);
    shortText(fm.title, 'title', 120);
    shortText(fm.summary, 'summary', 280);
    check(['conversation', 'workspace', 'manual', 'import'].includes(fm.captured_from), 'schema_invalid', 'Invalid captured_from.');
    const created = Date.parse(timestamp(fm.created_at));
    for (const key of ['updated_at', 'verified_at', 'retired_at'])
        if (Object.hasOwn(fm, key))
            check(Date.parse(timestamp(fm[key])) >= created, 'clock_invalid', `${key} cannot precede created_at.`, {}, EXIT.conflict);
    for (const [key, max] of [['tags', 40], ['search_terms', 40], ['source_refs', 500]] as const)
        if (Object.hasOwn(fm, key))
            stringList(fm[key], key, 0, 12, max);
    if (profile) {
        const allowed = new Set([...contracts.common_keys, ...Object.keys(profile.fields), 'claim_fingerprint', 'source_claim_fingerprint']);
        check(Object.keys(fm).every(k => allowed.has(k)), 'schema_invalid', 'Artifact contains undeclared profiled fields.');
        for (const [key, spec] of Object.entries(profile.fields) as [
            string,
            ObjectValue
        ][]) {
            check(!spec.required || Object.hasOwn(fm, key), 'schema_invalid', 'Required profiled field is missing.', { field: key });
            if (Object.hasOwn(fm, key))
                validateProfileValue(key, fm[key], spec);
        }
    }
    const kind = schemaKind(fm.schema);
    if (kind === 'snapshot') {
        check(fm.section_delimiter === undefined || (typeof fm.section_delimiter === 'string' && /^[a-z][a-z0-9]*-snap-[1-9][0-9]{0,5}$/.test(fm.section_delimiter)), 'schema_invalid', 'Invalid SNAP section delimiter.');
        stringList(fm.anchors ?? [], 'anchors', 0, 12, 36).forEach(x => requireId(x, 'anchors'));
        check(!['verified_at', 'retired_at', 'retired_reason', 'retirement_note', 'supersedes', 'superseded_by'].some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Snapshot cannot carry history or verification fields.');
    }
    if (kind === 'archive') {
        stringList(fm.source_refs, 'source_refs', 1);
        check(!['updated_at', 'verified_at', 'retired_at', 'retired_reason', 'retirement_note', 'supersedes', 'superseded_by', 'relations'].some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Archive is immutable.');
    }
    if (kind === 'observation')
        check(fm.kind_hint === undefined || fm.kind_hint === 'decision', 'schema_invalid', 'Invalid observation kind_hint.');
    if (['decision', 'term', 'intent', 'document', 'assumption'].includes(kind)) {
        check(fm.scope === canonicalScope(fm.scope), 'slot_invalid', 'Stored scope must be canonical.');
        if (['intent', 'document'].includes(kind))
            check(fm[kind + '_key'] === canonicalKey(fm[kind + '_key']), 'slot_invalid', 'Stored key must be canonical.');
        if (kind === 'decision') {
            check(fm.decision_key === canonicalKey(fm.decision_key), 'slot_invalid', 'Stored decision_key must be canonical.');
            check(!Object.hasOwn(fm, 'verified_at') && !Object.hasOwn(fm, 'status'), 'schema_invalid', 'DEC forbids verified_at and status.');
        }
        if (kind === 'term') {
            check(fm.term_key === canonicalKey(fm.term), 'slot_invalid', 'term_key must be derived from term.');
            const all = [fm.term, ...(fm.aliases ?? []), ...(fm.deprecated_terms ?? [])].map(canonicalKey);
            check(new Set(all).size === all.length, 'term_overlap', 'Term vocabulary must have disjoint canonical keys.', {}, EXIT.conflict);
        }
    }
    if (fm.revisit_on !== undefined)
        date(fm.revisit_on);
    if (fm.supersedes !== undefined)
        stringList(fm.supersedes, 'supersedes', 0, 12, 36).forEach(v => requireId(v, 'supersedes'));
    if (fm.superseded_by !== undefined)
        requireId(fm.superseded_by, 'superseded_by');
    if (fm.relations !== undefined) {
        check(object(fm.relations), 'schema_invalid', 'Relations must be an object.');
        for (const [key, value] of Object.entries(fm.relations))
            if (key.includes(':')) {
                check(/^[a-z][a-z0-9_]{0,79}:[a-z][a-z0-9_-]{0,79}$/.test(key), 'typed_relation_invalid', 'Invalid typed relation key.');
                const ids = stringList(value, key, 0, 12, 36);
                ids.forEach(v => requireId(v, key));
                check(new Set(ids).size === ids.length, 'schema_invalid', 'Typed relation IDs must be unique.');
            }
    }
    if (fm.retired_at !== undefined || fm.retired_reason !== undefined)
        validateLifecycle(fm, 'history', d);
    else {
        const retiredOnly = ['superseded_by', 'retirement_note', ...(kind === 'assumption' ? ['evidence_refs', 'refutation_reason'] : []), ...(kind === 'term' ? ['deprecation_reason', 'replacement_term'] : [])];
        check(!retiredOnly.some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Current artifact contains retired-only fields.');
    }
    const removed = ['claim_fingerprint', 'source_claim_fingerprint'].filter(k => Object.hasOwn(fm, k));
    return removed.length ? [{ code: 'schema_removed_field', fields: removed }] : [];
}
export function validateLifecycle(fm: ObjectValue, state: string, descriptor?: ObjectValue): void {
    const d = descriptor ?? descriptorFor(schemaKind(fm.schema)), reason = fm.retired_reason;
    if (state === 'current') {
        check(!['retired_at', 'retired_reason', 'retirement_note', 'superseded_by'].some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Current artifact cannot carry lifecycle metadata.', {}, EXIT.integrity);
        return;
    }
    check(fm.retired_at && reason, 'lifecycle_invalid', 'History artifact lacks retirement metadata.', {}, EXIT.integrity);
    timestamp(fm.retired_at);
    if (d?.structural_profile) {
        const recipe = d.structural_profile.lifecycle.reasons[reason];
        check(recipe, 'lifecycle_invalid', 'Undeclared retirement reason.');
        check(recipe.required_fields.every((k: string) => Object.hasOwn(fm, k)) && recipe.forbidden_fields.every((k: string) => !Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Retirement fields differ from the lifecycle recipe.');
        check(recipe.successor === 'optional' || (recipe.successor === 'required') === Object.hasOwn(fm, 'superseded_by'), 'lifecycle_invalid', 'Successor cardinality differs.');
    }
    else {
        const allowed = fm.schema === 'context-decision/v1' ? ['withdrawn', 'superseded'] : fm.schema === 'context-observation/v1' ? ['invalidated', 'superseded'] : [];
        check(allowed.includes(reason), 'lifecycle_invalid', 'Invalid retirement reason.');
        if (reason !== 'superseded') {
            shortText(fm.retirement_note, 'retirement_note', 500);
            check(!fm.superseded_by, 'lifecycle_invalid', 'Terminal retirement cannot name a successor.');
        }
    }
    if (reason === 'superseded')
        requireId(fm.superseded_by);
    if (['confirmed', 'refuted'].includes(reason))
        stringList(fm.evidence_refs, 'evidence_refs', 1);
}
function sectionSpec(schema: string, descriptor?: ObjectValue): [
    string[],
    string[]
] {
    const profile = (descriptor ?? descriptorFor(schemaKind(schema)))?.structural_profile;
    const [allowed, required] = profile ? [profile.sections.ordered, profile.sections.required] : contracts.sections[schema] ?? [[], []];
    return [allowed.map((k: string) => sectionName(schema, k)), required.map((k: string) => sectionName(schema, k))];
}
export function parseDocument(text: string, descriptor?: ObjectValue): ContextDocument {
    const { frontmatter: fm, lines, closing } = parseFrontmatter(text), warnings = validateFrontmatter(fm, descriptor), [allowed, required] = sectionSpec(fm.schema, descriptor);
    const sections: Record<string, string> = {};
    let current: string | undefined, previous = -1, style: boolean | undefined, fence: string | undefined, buffer: string[] = [];
    const save = () => { if (current)
        sections[current] = buffer.join('\n').trim(); };
    if (fm.schema === 'context-snapshot/v1' && fm.section_delimiter) {
        check(lines.at(-1) === '', 'section_schema_error', 'Framed SNAP must end with a newline.');
        const begin = `<!-- ${fm.section_delimiter} begin -->`, end = `<!-- ${fm.section_delimiter} end -->`;
        for (let i = closing + 2; i < lines.length - 1;) {
            const name = /^## (.+)$/.exec(lines[i])?.[1], canonical = name && sectionName(fm.schema, name), index = canonical ? allowed.indexOf(canonical) : -1, legacy = name !== canonical;
            check(name && index > previous && (style === undefined || style === legacy) && lines[i + 1] === '' && lines[i + 2] === begin, 'section_schema_error', 'Invalid framed SNAP section.');
            const stop = lines.indexOf(end, i + 3);
            check(stop >= i + 3 && lines[stop + 1] === '', 'section_schema_error', 'SNAP section end is missing.');
            sections[name] = lines.slice(i + 3, stop).join('\n');
            previous = index;
            style = legacy;
            i = stop + 2;
        }
    }
    else for (const line of lines.slice(closing + 2)) {
        const f = /^\s*(```+|~~~+)/.exec(line)?.[1][0];
        if (f)
            fence = fence === f ? undefined : fence ?? f;
        const heading = !fence ? /^## (.+)$/.exec(line) : null;
        if (heading) {
            save();
            const name = heading[1], canonical = sectionName(fm.schema, name), index = allowed.indexOf(canonical), legacy = name !== canonical;
            check(index > previous && (style === undefined || style === legacy), 'section_schema_error', 'Unknown, duplicate, mixed-style, or out-of-order H2 section.', { section: name });
            current = name;
            previous = index;
            style = legacy;
            buffer = [];
        }
        else {
            check(current || !line.trim(), 'section_schema_error', 'Content before the first section is forbidden.');
            if (current)
                buffer.push(line);
        }
    }
    save();
    const result = { frontmatter: fm, sections, warnings };
    for (const key of required)
        check(substantive(sectionValue(result, key)), 'section_schema_error', 'Required section is missing or placeholder.', { section: key });
    if (fm.schema === 'context-archive/v1')
        check(codepoints(sectionValue(result, 'Content')) <= 65000, 'section_schema_error', 'Archive Content exceeds 65,000 codepoints.');
    return result;
}
export function renderDocument(frontmatter: ObjectValue, sections: Record<string, string>, descriptor?: ObjectValue): string {
    const fm = Object.fromEntries(Object.entries(frontmatter).filter(([k]) => !['claim_fingerprint', 'source_claim_fingerprint'].includes(k)));
    validateFrontmatter(fm, descriptor);
    const [allowed, required] = sectionSpec(fm.schema, descriptor), actual = new Map<string, string>();
    for (const key of Object.keys(sections)) {
        const canonical = sectionName(fm.schema, key);
        check(allowed.includes(canonical) && !actual.has(canonical), 'section_schema_error', 'Unknown or duplicate section.', { section: key });
        actual.set(canonical, key);
    }
    const snapshot = fm.schema === 'context-snapshot/v1';
    if (snapshot) {
        sections = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, snapshotText(value, key, required.includes(sectionName(fm.schema, key)))]));
        validateSnapshotSize(fm, Object.fromEntries(allowed.filter(key => actual.has(key)).map(key => [key, sections[actual.get(key)!]])));
    }
    const render = () => {
        const profile = (descriptor ?? descriptorFor(schemaKind(fm.schema)))?.structural_profile;
        const known = [...contracts.common_keys, ...(profile ? Object.keys(profile.fields) : contracts.additive_keys[fm.schema] ?? [])];
        const ordered = [...known.filter(k => Object.hasOwn(fm, k)), ...Object.keys(fm).filter(k => !known.includes(k)).sort(compareText)];
        const lines = ['---', ...ordered.map(key => { check(validFrontmatterValue(fm[key]), 'frontmatter_unsupported', 'Unsupported frontmatter value.', { key }); return `${key}: ${compactJson(fm[key])}`; }), '---', ''];
        for (const canonical of allowed) {
            const key = actual.get(canonical);
            if (key)
                lines.push(`## ${key}`, '', ...(snapshot && fm.section_delimiter ? [`<!-- ${fm.section_delimiter} begin -->`, sections[key], `<!-- ${fm.section_delimiter} end -->`] : [sections[key].trim()]), '');
        }
        return lines.join('\n').replace(/\n*$/, '') + '\n';
    };
    if (snapshot && !fm.section_delimiter) {
        try {
            const text = render(), parsed = parseDocument(text, descriptor);
            if (Object.entries(sections).every(([key, value]) => parsed.sections[key] === value))
                return text;
        }
        catch (error) {
            if (!(error instanceof WhyveError) || error.code !== 'section_schema_error')
                throw error;
        }
    }
    if (snapshot) {
        let suffix = 1, delimiter = fm.section_delimiter ?? `whyve-snap-${suffix}`;
        while (Object.values(sections).some(value => value.includes(delimiter)))
            delimiter = `whyve-snap-${++suffix}`;
        fm.section_delimiter = delimiter;
    }
    const text = render();
    parseDocument(text, descriptor);
    return text;
}
export function extractBlock(text: string, name: string): string[] {
    const start = `<!-- BEGIN CONTEXT GENERATED:${name} -->`, end = `<!-- END CONTEXT GENERATED:${name} -->`;
    check(text.split(start).length === 2 && text.split(end).length === 2 && text.indexOf(end) > text.indexOf(start), 'index_noncanonical', 'Generated block is missing or duplicated.', { block: name }, EXIT.integrity);
    return text.slice(text.indexOf(start) + start.length, text.indexOf(end)).trim().split('\n').filter(Boolean);
}
export function replaceBlock(text: string, name: string, lines: string[]): string {
    extractBlock(text, name);
    const start = `<!-- BEGIN CONTEXT GENERATED:${name} -->`, end = `<!-- END CONTEXT GENERATED:${name} -->`;
    return text.slice(0, text.indexOf(start) + start.length) + '\n' + (lines.length ? lines.join('\n') + '\n' : '') + text.slice(text.indexOf(end));
}
export function readProfile(text: string): ObjectValue | undefined {
    if (!text.includes('CONTEXT GENERATED:owner-profile -->'))
        return;
    const rows = extractBlock(text, 'owner-profile');
    check(rows.length === 1, 'owner_profile_invalid', 'Expected one owner descriptor.');
    const descriptor = strictJson(rows[0]);
    validateDescriptor(descriptor);
    check(descriptor.schema === 'context-owner-descriptor/v2', 'owner_profile_invalid', 'Expected a v2 descriptor.');
    return descriptor;
}
export const markdownEscape = (text: string) => text.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replaceAll('\n', ' ');
export const entryRow = (row: ObjectValue) => `- [[${row.path.replace(/\.md$/, '')}]] — ${markdownEscape(row.title)} — ${markdownEscape(row.summary)} <!-- context-entry ${compactJson(row)} -->`;
export function parseAreaIndex(text: string, tolerant = false): {
    frontmatter: ObjectValue;
    current: ObjectValue[];
    history: ObjectValue[];
    descriptor?: ObjectValue;
} {
    const fm = parseFrontmatter(text).frontmatter;
    check(fm.schema === 'context-area-index/v1' && fm.index === true && /^[a-z][a-z0-9_-]{0,79}$/.test(fm.area), 'index_noncanonical', 'Invalid area index metadata.', {}, EXIT.integrity);
    const descriptor = readProfile(text);
    if (descriptor)
        check(descriptor.kind === fm.area && descriptor.owner === fm.owner && descriptor.artifact_schema === fm.artifact_schema && descriptor.authority === fm.authority && compactJson(descriptor.structural_profile.index_projection) === compactJson(fm.projection_fields ?? []), 'owner_profile_invalid', 'Profile differs from area metadata.');
    const result = { frontmatter: fm, current: [] as ObjectValue[], history: [] as ObjectValue[], descriptor }, seen = new Set<string>();
    for (const state of ['current', ...(fm.area === 'snapshot' ? [] : ['history'])]) {
        let previous = '';
        for (const line of extractBlock(text, state)) {
            const match = /<!-- context-entry (\{.*\}) -->$/.exec(line);
            check(match, 'index_noncanonical', 'Malformed area row.');
            const row = strictJson(match[1]);
            requireId(row.id);
            check(row.state === state, 'index_wrong_state', 'Entry is in the wrong block.');
            const expected = `context/${fm.area}/${state === 'history' ? 'retired/' : ''}`;
            check(typeof row.path === 'string' && row.path.startsWith(expected) && row.path.endsWith('.md') && !row.path.endsWith('.index.md') && !row.path.split('/').some((p: string) => !p || p === '.' || p === '..') && row.path.split('/').length === (state === 'history' ? 4 : 3), 'path_escape', 'Area entry path escapes its area.');
            if (!tolerant) {
                check(!seen.has(row.id), 'index_duplicate_entry', 'Duplicate area entry.', { id: row.id }, EXIT.integrity);
                const base = ['id', 'path', 'title', 'summary', 'state', 'created_at', ...(row.updated_at ? ['updated_at'] : []), 'terms', ...(state === 'history' ? ['retired_at', 'retired_reason', ...(row.superseded_by ? ['superseded_by'] : [])] : []), ...(fm.projection_fields ?? []).filter((k: string) => Object.hasOwn(row, k))];
                check(compactJson(Object.keys(row)) === compactJson(base) && entryRow(row) === line && compareText(previous, row.created_at + row.id) <= 0, 'index_noncanonical', 'Area row is not canonical.', {}, EXIT.integrity);
            }
            previous = row.created_at + row.id;
            seen.add(row.id);
            (result as any)[state].push(row);
        }
    }
    return result;
}
