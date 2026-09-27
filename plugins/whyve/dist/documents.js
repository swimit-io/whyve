"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entryRow = exports.markdownEscape = exports.schemaKind = exports.kinds = void 0;
exports.descriptorFor = descriptorFor;
exports.sectionName = sectionName;
exports.sectionValue = sectionValue;
exports.existingStyle = existingStyle;
exports.validFrontmatterValue = validFrontmatterValue;
exports.parseFrontmatter = parseFrontmatter;
exports.validateDescriptor = validateDescriptor;
exports.validateFrontmatter = validateFrontmatter;
exports.validateLifecycle = validateLifecycle;
exports.parseDocument = parseDocument;
exports.renderDocument = renderDocument;
exports.extractBlock = extractBlock;
exports.replaceBlock = replaceBlock;
exports.readProfile = readProfile;
exports.parseAreaIndex = parseAreaIndex;
const common_1 = require("./common");
const snapshot_1 = require("./snapshot");
exports.kinds = Object.keys(common_1.contracts.capabilities);
const schemaKind = (schema) => /^context-(.+)\/v1$/.exec(schema)?.[1] ?? '';
exports.schemaKind = schemaKind;
function descriptorFor(kind) { return common_1.contracts.owners[kind]?.descriptor; }
function sectionName(schema, name) { return common_1.contracts.aliases[schema]?.[name] ?? name; }
function sectionValue(doc, name) { return Object.entries(doc.sections).find(([k]) => sectionName(doc.frontmatter.schema, k) === name)?.[1] ?? ''; }
function existingStyle(schema, sections, existing) {
    const aliases = common_1.contracts.aliases[schema] ?? {}, legacy = Object.keys(existing).some(k => Object.hasOwn(aliases, k));
    return Object.fromEntries(Object.entries(sections).map(([k, v]) => [legacy ? Object.keys(aliases).find(a => aliases[a] === sectionName(schema, k)) ?? k : sectionName(schema, k), v]));
}
function validFrontmatterValue(value, nested = false) {
    return value === null || typeof value === 'string' || typeof value === 'boolean' || (Array.isArray(value) && value.every(v => typeof v === 'string')) || (!nested && (0, common_1.object)(value) && Object.values(value).every(v => validFrontmatterValue(v, true)));
}
function parseFrontmatter(text) {
    (0, common_1.check)(!text.startsWith('\ufeff'), 'frontmatter_unsupported', 'UTF-8 BOM is not supported.');
    const withoutCRLF = text.replace(/\r\n/g, '');
    (0, common_1.check)(!withoutCRLF.includes('\r') && !(text.includes('\r\n') && withoutCRLF.includes('\n')), 'frontmatter_unsupported', 'Mixed or bare-CR newlines are not supported.');
    const lines = text.replace(/\r\n/g, '\n').split('\n'), closing = lines.indexOf('---', 1);
    (0, common_1.check)(lines[0] === '---' && closing > 0 && lines[closing + 1] === '', 'frontmatter_unsupported', 'Frontmatter delimiters and following blank line are required.');
    const frontmatter = {};
    for (const line of lines.slice(1, closing)) {
        const split = line.indexOf(': '), key = line.slice(0, split), raw = line.slice(split + 2);
        (0, common_1.check)(split > 0 && /^[a-z][a-z0-9_]*$/.test(key) && !Object.hasOwn(frontmatter, key), 'frontmatter_unsupported', 'Invalid or duplicate frontmatter key.', { key });
        const value = (0, common_1.strictJson)(raw, 'frontmatter_unsupported');
        (0, common_1.check)((0, common_1.compactJson)(value) === raw && validFrontmatterValue(value), 'frontmatter_unsupported', 'Frontmatter value is outside the JSON-compatible subset.', { key });
        Object.defineProperty(frontmatter, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return { frontmatter, lines, closing };
}
function validateDescriptor(d) {
    (0, common_1.check)((0, common_1.object)(d), 'owner_profile_invalid', 'Owner descriptor must be an object.');
    const v2 = d.schema === 'context-owner-descriptor/v2';
    (0, common_1.exact)(d, ['schema', 'owner', 'kind', 'artifact_schema', 'authority', ...(v2 ? ['structural_profile'] : [])], 'owner_profile_invalid');
    (0, common_1.check)(v2 || d.schema === 'context-owner-descriptor/v1', 'owner_profile_invalid', 'Unsupported owner descriptor.');
    (0, common_1.check)(/^[a-z][a-z0-9_-]{0,79}$/.test(d.kind) && /^context-[a-z][a-z0-9_-]*$/.test(d.owner) && /^context-[a-z][a-z0-9_-]*\/v[1-9]\d*$/.test(d.artifact_schema), 'owner_profile_invalid', 'Invalid owner coordinates.');
    (0, common_1.check)(['authoritative', 'evidence', 'staging', 'provisional', 'definitional', 'directional', 'descriptive'].includes(d.authority), 'owner_profile_invalid', 'Invalid authority.');
    (0, common_1.check)(Buffer.byteLength((0, common_1.compactJson)(d)) <= 8192, 'owner_profile_invalid', 'Owner descriptor is too large.');
    if (!v2)
        return;
    const p = d.structural_profile;
    (0, common_1.exact)(p, ['schema', 'fields', 'sections', 'index_projection', 'lifecycle'], 'owner_profile_invalid');
    (0, common_1.check)(p.schema === 'context-structural-profile/v1' && (0, common_1.object)(p.fields) && Object.keys(p.fields).length <= 24, 'owner_profile_invalid', 'Invalid structural profile.');
    for (const [key, spec] of Object.entries(p.fields)) {
        (0, common_1.check)(/^[a-z][a-z0-9_]*$/.test(key) && !common_1.contracts.common_keys.includes(key), 'owner_profile_invalid', 'Profile field collides with a common field.');
        (0, common_1.check)((0, common_1.object)(spec) && ['string', 'string_list', 'date', 'timestamp', 'enum', 'context_id', 'context_id_list', 'relation_map'].includes(spec.type) && typeof spec.required === 'boolean', 'owner_profile_invalid', 'Invalid profile field specification.');
        const bounds = spec.type === 'string' ? ['min_chars', 'max_chars'] : ['string_list', 'context_id_list'].includes(spec.type) ? ['min_items', 'max_items', ...(spec.type === 'string_list' ? ['max_item_chars'] : [])] : [];
        for (const key of bounds)
            (0, common_1.check)(Number.isSafeInteger(spec[key]) && spec[key] >= 0, 'owner_profile_invalid', 'Invalid field bound.');
        const keys = ['type', 'required', ...bounds, ...(spec.type === 'enum' ? ['values'] : spec.type === 'relation_map' ? ['keys', 'max_items'] : [])];
        (0, common_1.exact)(spec, keys, 'owner_profile_invalid');
        if (spec.type === 'string')
            (0, common_1.check)(spec.min_chars <= spec.max_chars && spec.max_chars <= 4000 && (!spec.required || spec.min_chars >= 1), 'owner_profile_invalid', 'Invalid string bounds.');
        if (['string_list', 'context_id_list'].includes(spec.type))
            (0, common_1.check)(spec.min_items <= spec.max_items && spec.max_items <= 12 && (!spec.required || spec.min_items >= 1), 'owner_profile_invalid', 'Invalid list bounds.');
        if (spec.type === 'string_list')
            (0, common_1.check)(spec.max_item_chars >= 1 && spec.max_item_chars <= 2000, 'owner_profile_invalid', 'Invalid list item bounds.');
        if (spec.type === 'relation_map') {
            (0, common_1.stringList)(spec.keys, 'keys', 1, 12, 80);
            (0, common_1.check)(Number.isSafeInteger(spec.max_items) && spec.max_items >= 1 && spec.max_items <= 12, 'owner_profile_invalid', 'Invalid relation cardinality.');
        }
        if (spec.type === 'enum')
            (0, common_1.stringList)(spec.values, 'values', 1, 12, 80);
    }
    (0, common_1.exact)(p.sections, ['ordered', 'required', 'primary'], 'owner_profile_invalid');
    const ordered = (0, common_1.stringList)(p.sections.ordered, 'ordered', 1, 12, 80), required = (0, common_1.stringList)(p.sections.required, 'required', 1, 12, 80);
    (0, common_1.check)(new Set(ordered).size === ordered.length && ordered.every(k => !k.startsWith('#')) && (0, common_1.compactJson)(ordered.filter(k => required.includes(k))) === (0, common_1.compactJson)(required) && required.includes(p.sections.primary), 'owner_profile_invalid', 'Invalid section profile.');
    const projection = (0, common_1.stringList)(p.index_projection, 'index_projection', 0, 4, 80);
    (0, common_1.check)(projection.every(k => Object.hasOwn(p.fields, k) && ['string', 'date', 'timestamp', 'enum', 'context_id'].includes(p.fields[k].type)), 'owner_profile_invalid', 'Projection references an undeclared scalar field.');
    (0, common_1.exact)(p.lifecycle, ['allowed_topologies', 'reasons'], 'owner_profile_invalid');
    (0, common_1.check)(Array.isArray(p.lifecycle.allowed_topologies) && p.lifecycle.allowed_topologies.every((x) => ['create_current', 'replace_same_state', 'retire_current', 'supersede_current', 'delete_one'].includes(x)) && (0, common_1.object)(p.lifecycle.reasons), 'owner_profile_invalid', 'Invalid lifecycle topology.');
    for (const recipe of Object.values(p.lifecycle.reasons)) {
        (0, common_1.exact)(recipe, ['topology', 'required_fields', 'forbidden_fields', 'successor', 'references'], 'owner_profile_invalid');
        (0, common_1.check)(p.lifecycle.allowed_topologies.includes(recipe.topology) && ['required', 'forbidden', 'optional'].includes(recipe.successor), 'owner_profile_invalid', 'Invalid lifecycle recipe.');
        for (const field of [...recipe.required_fields, ...recipe.forbidden_fields])
            (0, common_1.check)(Object.hasOwn(p.fields, field), 'owner_profile_invalid', 'Undeclared lifecycle field.');
        (0, common_1.check)(['retire_current', 'supersede_current'].includes(recipe.topology) && ['retired_at', 'retired_reason'].every(f => recipe.required_fields.includes(f)) && !recipe.required_fields.some((f) => recipe.forbidden_fields.includes(f)), 'owner_profile_invalid', 'Invalid retirement fields.');
        (0, common_1.check)(Array.isArray(recipe.references) && recipe.references.length <= 8, 'owner_profile_invalid', 'Invalid lifecycle references.');
        for (const r of recipe.references) {
            (0, common_1.exact)(r, ['location', 'field', 'target', 'match'], 'owner_profile_invalid');
            (0, common_1.check)(['predecessor', 'successor'].includes(r.location) && ['predecessor', 'successor'].includes(r.target) && ['equals', 'contains'].includes(r.match) && p.fields[r.field]?.type === (r.match === 'equals' ? 'context_id' : 'context_id_list'), 'owner_profile_invalid', 'Invalid reference recipe.');
        }
        if (recipe.topology === 'supersede_current')
            (0, common_1.check)(recipe.successor === 'required' && recipe.required_fields.includes('superseded_by') && recipe.references.some((r) => r.location === 'predecessor' && r.target === 'successor') && recipe.references.some((r) => r.location === 'successor' && r.target === 'predecessor'), 'owner_profile_invalid', 'Supersession requires reciprocal edges.');
    }
}
function validateProfileValue(key, value, spec) {
    switch (spec.type) {
        case 'string':
            (0, common_1.check)(typeof value === 'string' && !value.includes('\n') && (0, common_1.codepoints)(value) >= spec.min_chars && (0, common_1.codepoints)(value) <= spec.max_chars && (spec.min_chars === 0 || !!value.trim()), 'schema_invalid', 'Profiled string violates its bounds.', { field: key });
            break;
        case 'string_list': {
            const list = (0, common_1.stringList)(value, key, spec.min_items, spec.max_items, spec.max_item_chars);
            (0, common_1.check)(new Set(list).size === list.length, 'schema_invalid', 'Duplicate list item.', { field: key });
            break;
        }
        case 'context_id':
            (0, common_1.requireId)(value, key);
            break;
        case 'context_id_list': {
            const list = (0, common_1.stringList)(value, key, spec.min_items, spec.max_items, 36);
            list.forEach(v => (0, common_1.requireId)(v, key));
            (0, common_1.check)(new Set(list).size === list.length, 'schema_invalid', 'Duplicate context ID.');
            break;
        }
        case 'timestamp':
            (0, common_1.timestamp)(value);
            break;
        case 'date':
            (0, common_1.date)(value);
            break;
        case 'enum':
            (0, common_1.check)(spec.values.includes(value), 'schema_invalid', 'Undeclared enum value.', { field: key });
            break;
        case 'relation_map':
            (0, common_1.check)((0, common_1.object)(value) && Object.keys(value).every(k => spec.keys.includes(k)), 'schema_invalid', 'Relations must use declared predicates.');
            for (const [predicate, ids] of Object.entries(value)) {
                const list = (0, common_1.stringList)(ids, predicate, 1, spec.max_items, 36);
                list.forEach(id => (0, common_1.requireId)(id));
                (0, common_1.check)(new Set(list).size === list.length, 'schema_invalid', 'Duplicate relation ID.');
            }
            break;
    }
}
function validateFrontmatter(fm, descriptor) {
    for (const key of ['schema', 'id', 'title', 'summary', 'created_at', 'captured_from'])
        (0, common_1.check)(Object.hasOwn(fm, key), 'schema_invalid', 'Required frontmatter field is missing.', { missing: [key] });
    const d = descriptor ?? descriptorFor((0, exports.schemaKind)(fm.schema));
    if (d) {
        validateDescriptor(d);
        (0, common_1.check)(d.artifact_schema === fm.schema, 'schema_invalid', 'Artifact schema differs from its descriptor.');
    }
    const profile = d?.structural_profile;
    (0, common_1.check)(profile || common_1.contracts.sections[fm.schema], 'schema_invalid', 'Unsupported artifact schema.', { schema: fm.schema });
    (0, common_1.requireId)(fm.id);
    (0, common_1.shortText)(fm.title, 'title', 120);
    (0, common_1.shortText)(fm.summary, 'summary', 280);
    (0, common_1.check)(['conversation', 'workspace', 'manual', 'import'].includes(fm.captured_from), 'schema_invalid', 'Invalid captured_from.');
    const created = Date.parse((0, common_1.timestamp)(fm.created_at));
    for (const key of ['updated_at', 'verified_at', 'retired_at'])
        if (Object.hasOwn(fm, key))
            (0, common_1.check)(Date.parse((0, common_1.timestamp)(fm[key])) >= created, 'clock_invalid', `${key} cannot precede created_at.`, {}, common_1.EXIT.conflict);
    for (const [key, max] of [['tags', 40], ['search_terms', 40], ['source_refs', 500]])
        if (Object.hasOwn(fm, key))
            (0, common_1.stringList)(fm[key], key, 0, 12, max);
    if (profile) {
        const allowed = new Set([...common_1.contracts.common_keys, ...Object.keys(profile.fields), 'claim_fingerprint', 'source_claim_fingerprint']);
        (0, common_1.check)(Object.keys(fm).every(k => allowed.has(k)), 'schema_invalid', 'Artifact contains undeclared profiled fields.');
        for (const [key, spec] of Object.entries(profile.fields)) {
            (0, common_1.check)(!spec.required || Object.hasOwn(fm, key), 'schema_invalid', 'Required profiled field is missing.', { field: key });
            if (Object.hasOwn(fm, key))
                validateProfileValue(key, fm[key], spec);
        }
    }
    const kind = (0, exports.schemaKind)(fm.schema);
    if (kind === 'snapshot') {
        (0, common_1.check)(fm.section_delimiter === undefined || (typeof fm.section_delimiter === 'string' && /^[a-z][a-z0-9]*-snap-[1-9][0-9]{0,5}$/.test(fm.section_delimiter)), 'schema_invalid', 'Invalid SNAP section delimiter.');
        (0, common_1.stringList)(fm.anchors ?? [], 'anchors', 0, 12, 36).forEach(x => (0, common_1.requireId)(x, 'anchors'));
        (0, common_1.check)(!['verified_at', 'retired_at', 'retired_reason', 'retirement_note', 'supersedes', 'superseded_by'].some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Snapshot cannot carry history or verification fields.');
    }
    if (kind === 'archive') {
        (0, common_1.stringList)(fm.source_refs, 'source_refs', 1);
        (0, common_1.check)(!['updated_at', 'verified_at', 'retired_at', 'retired_reason', 'retirement_note', 'supersedes', 'superseded_by', 'relations'].some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Archive is immutable.');
    }
    if (kind === 'observation')
        (0, common_1.check)(fm.kind_hint === undefined || fm.kind_hint === 'decision', 'schema_invalid', 'Invalid observation kind_hint.');
    if (['decision', 'term', 'intent', 'document', 'assumption'].includes(kind)) {
        (0, common_1.check)(fm.scope === (0, common_1.canonicalScope)(fm.scope), 'slot_invalid', 'Stored scope must be canonical.');
        if (['intent', 'document'].includes(kind))
            (0, common_1.check)(fm[kind + '_key'] === (0, common_1.canonicalKey)(fm[kind + '_key']), 'slot_invalid', 'Stored key must be canonical.');
        if (kind === 'decision') {
            (0, common_1.check)(fm.decision_key === (0, common_1.canonicalKey)(fm.decision_key), 'slot_invalid', 'Stored decision_key must be canonical.');
            (0, common_1.check)(!Object.hasOwn(fm, 'verified_at') && !Object.hasOwn(fm, 'status'), 'schema_invalid', 'DEC forbids verified_at and status.');
        }
        if (kind === 'term') {
            (0, common_1.check)(fm.term_key === (0, common_1.canonicalKey)(fm.term), 'slot_invalid', 'term_key must be derived from term.');
            const all = [fm.term, ...(fm.aliases ?? []), ...(fm.deprecated_terms ?? [])].map(common_1.canonicalKey);
            (0, common_1.check)(new Set(all).size === all.length, 'term_overlap', 'Term vocabulary must have disjoint canonical keys.', {}, common_1.EXIT.conflict);
        }
    }
    if (fm.revisit_on !== undefined)
        (0, common_1.date)(fm.revisit_on);
    if (fm.supersedes !== undefined)
        (0, common_1.stringList)(fm.supersedes, 'supersedes', 0, 12, 36).forEach(v => (0, common_1.requireId)(v, 'supersedes'));
    if (fm.superseded_by !== undefined)
        (0, common_1.requireId)(fm.superseded_by, 'superseded_by');
    if (fm.relations !== undefined) {
        (0, common_1.check)((0, common_1.object)(fm.relations), 'schema_invalid', 'Relations must be an object.');
        for (const [key, value] of Object.entries(fm.relations))
            if (key.includes(':')) {
                (0, common_1.check)(/^[a-z][a-z0-9_]{0,79}:[a-z][a-z0-9_-]{0,79}$/.test(key), 'typed_relation_invalid', 'Invalid typed relation key.');
                const ids = (0, common_1.stringList)(value, key, 0, 12, 36);
                ids.forEach(v => (0, common_1.requireId)(v, key));
                (0, common_1.check)(new Set(ids).size === ids.length, 'schema_invalid', 'Typed relation IDs must be unique.');
            }
    }
    if (fm.retired_at !== undefined || fm.retired_reason !== undefined)
        validateLifecycle(fm, 'history', d);
    else {
        const retiredOnly = ['superseded_by', 'retirement_note', ...(kind === 'assumption' ? ['evidence_refs', 'refutation_reason'] : []), ...(kind === 'term' ? ['deprecation_reason', 'replacement_term'] : [])];
        (0, common_1.check)(!retiredOnly.some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Current artifact contains retired-only fields.');
    }
    const removed = ['claim_fingerprint', 'source_claim_fingerprint'].filter(k => Object.hasOwn(fm, k));
    return removed.length ? [{ code: 'schema_removed_field', fields: removed }] : [];
}
function validateLifecycle(fm, state, descriptor) {
    const d = descriptor ?? descriptorFor((0, exports.schemaKind)(fm.schema)), reason = fm.retired_reason;
    if (state === 'current') {
        (0, common_1.check)(!['retired_at', 'retired_reason', 'retirement_note', 'superseded_by'].some(k => Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Current artifact cannot carry lifecycle metadata.', {}, common_1.EXIT.integrity);
        return;
    }
    (0, common_1.check)(fm.retired_at && reason, 'lifecycle_invalid', 'History artifact lacks retirement metadata.', {}, common_1.EXIT.integrity);
    (0, common_1.timestamp)(fm.retired_at);
    if (d?.structural_profile) {
        const recipe = d.structural_profile.lifecycle.reasons[reason];
        (0, common_1.check)(recipe, 'lifecycle_invalid', 'Undeclared retirement reason.');
        (0, common_1.check)(recipe.required_fields.every((k) => Object.hasOwn(fm, k)) && recipe.forbidden_fields.every((k) => !Object.hasOwn(fm, k)), 'lifecycle_invalid', 'Retirement fields differ from the lifecycle recipe.');
        (0, common_1.check)(recipe.successor === 'optional' || (recipe.successor === 'required') === Object.hasOwn(fm, 'superseded_by'), 'lifecycle_invalid', 'Successor cardinality differs.');
    }
    else {
        const allowed = fm.schema === 'context-decision/v1' ? ['withdrawn', 'superseded'] : fm.schema === 'context-observation/v1' ? ['invalidated', 'superseded'] : [];
        (0, common_1.check)(allowed.includes(reason), 'lifecycle_invalid', 'Invalid retirement reason.');
        if (reason !== 'superseded') {
            (0, common_1.shortText)(fm.retirement_note, 'retirement_note', 500);
            (0, common_1.check)(!fm.superseded_by, 'lifecycle_invalid', 'Terminal retirement cannot name a successor.');
        }
    }
    if (reason === 'superseded')
        (0, common_1.requireId)(fm.superseded_by);
    if (['confirmed', 'refuted'].includes(reason))
        (0, common_1.stringList)(fm.evidence_refs, 'evidence_refs', 1);
}
function sectionSpec(schema, descriptor) {
    const profile = (descriptor ?? descriptorFor((0, exports.schemaKind)(schema)))?.structural_profile;
    const [allowed, required] = profile ? [profile.sections.ordered, profile.sections.required] : common_1.contracts.sections[schema] ?? [[], []];
    return [allowed.map((k) => sectionName(schema, k)), required.map((k) => sectionName(schema, k))];
}
function parseDocument(text, descriptor) {
    const { frontmatter: fm, lines, closing } = parseFrontmatter(text), warnings = validateFrontmatter(fm, descriptor), [allowed, required] = sectionSpec(fm.schema, descriptor);
    const sections = {};
    let current, previous = -1, style, fence, buffer = [];
    const save = () => {
        if (current)
            sections[current] = buffer.join('\n').trim();
    };
    if (fm.schema === 'context-snapshot/v1' && fm.section_delimiter) {
        (0, common_1.check)(lines.at(-1) === '', 'section_schema_error', 'Framed SNAP must end with a newline.');
        const begin = `<!-- ${fm.section_delimiter} begin -->`, end = `<!-- ${fm.section_delimiter} end -->`;
        for (let i = closing + 2; i < lines.length - 1;) {
            const name = /^## (.+)$/.exec(lines[i])?.[1], canonical = name && sectionName(fm.schema, name), index = canonical ? allowed.indexOf(canonical) : -1, legacy = name !== canonical;
            (0, common_1.check)(name && index > previous && (style === undefined || style === legacy) && lines[i + 1] === '' && lines[i + 2] === begin, 'section_schema_error', 'Invalid framed SNAP section.');
            const stop = lines.indexOf(end, i + 3);
            (0, common_1.check)(stop >= i + 3 && lines[stop + 1] === '', 'section_schema_error', 'SNAP section end is missing.');
            sections[name] = lines.slice(i + 3, stop).join('\n');
            previous = index;
            style = legacy;
            i = stop + 2;
        }
    }
    else
        for (const line of lines.slice(closing + 2)) {
            const f = /^\s*(```+|~~~+)/.exec(line)?.[1][0];
            if (f)
                fence = fence === f ? undefined : fence ?? f;
            const heading = !fence ? /^## (.+)$/.exec(line) : null;
            if (heading) {
                save();
                const name = heading[1], canonical = sectionName(fm.schema, name), index = allowed.indexOf(canonical), legacy = name !== canonical;
                (0, common_1.check)(index > previous && (style === undefined || style === legacy), 'section_schema_error', 'Unknown, duplicate, mixed-style, or out-of-order H2 section.', { section: name });
                current = name;
                previous = index;
                style = legacy;
                buffer = [];
            }
            else {
                (0, common_1.check)(current || !line.trim(), 'section_schema_error', 'Content before the first section is forbidden.');
                if (current)
                    buffer.push(line);
            }
        }
    save();
    const result = { frontmatter: fm, sections, warnings };
    for (const key of required)
        (0, common_1.check)((0, common_1.substantive)(sectionValue(result, key)), 'section_schema_error', 'Required section is missing or placeholder.', { section: key });
    if (fm.schema === 'context-archive/v1')
        (0, common_1.check)((0, common_1.codepoints)(sectionValue(result, 'Content')) <= 65000, 'section_schema_error', 'Archive Content exceeds 65,000 codepoints.');
    return result;
}
function renderDocument(frontmatter, sections, descriptor) {
    const fm = Object.fromEntries(Object.entries(frontmatter).filter(([k]) => !['claim_fingerprint', 'source_claim_fingerprint'].includes(k)));
    validateFrontmatter(fm, descriptor);
    const [allowed, required] = sectionSpec(fm.schema, descriptor), actual = new Map();
    for (const key of Object.keys(sections)) {
        const canonical = sectionName(fm.schema, key);
        (0, common_1.check)(allowed.includes(canonical) && !actual.has(canonical), 'section_schema_error', 'Unknown or duplicate section.', { section: key });
        actual.set(canonical, key);
    }
    const snapshot = fm.schema === 'context-snapshot/v1';
    if (snapshot) {
        sections = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, (0, snapshot_1.snapshotText)(value, key, required.includes(sectionName(fm.schema, key)))]));
        (0, snapshot_1.validateSnapshotSize)(fm, Object.fromEntries(allowed.filter(key => actual.has(key)).map(key => [key, sections[actual.get(key)]])));
    }
    const render = () => {
        const profile = (descriptor ?? descriptorFor((0, exports.schemaKind)(fm.schema)))?.structural_profile;
        const known = [...common_1.contracts.common_keys, ...(profile ? Object.keys(profile.fields) : common_1.contracts.additive_keys[fm.schema] ?? [])];
        const ordered = [...known.filter(k => Object.hasOwn(fm, k)), ...Object.keys(fm).filter(k => !known.includes(k)).sort(common_1.compareText)];
        const lines = ['---', ...ordered.map(key => { (0, common_1.check)(validFrontmatterValue(fm[key]), 'frontmatter_unsupported', 'Unsupported frontmatter value.', { key }); return `${key}: ${(0, common_1.compactJson)(fm[key])}`; }), '---', ''];
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
            if (!(error instanceof common_1.WhyveError) || error.code !== 'section_schema_error')
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
function extractBlock(text, name) {
    const start = `<!-- BEGIN CONTEXT GENERATED:${name} -->`, end = `<!-- END CONTEXT GENERATED:${name} -->`;
    (0, common_1.check)(text.split(start).length === 2 && text.split(end).length === 2 && text.indexOf(end) > text.indexOf(start), 'index_noncanonical', 'Generated block is missing or duplicated.', { block: name }, common_1.EXIT.integrity);
    return text.slice(text.indexOf(start) + start.length, text.indexOf(end)).trim().split('\n').filter(Boolean);
}
function replaceBlock(text, name, lines) {
    extractBlock(text, name);
    const start = `<!-- BEGIN CONTEXT GENERATED:${name} -->`, end = `<!-- END CONTEXT GENERATED:${name} -->`;
    return text.slice(0, text.indexOf(start) + start.length) + '\n' + (lines.length ? lines.join('\n') + '\n' : '') + text.slice(text.indexOf(end));
}
function readProfile(text) {
    if (!text.includes('CONTEXT GENERATED:owner-profile -->'))
        return;
    const rows = extractBlock(text, 'owner-profile');
    (0, common_1.check)(rows.length === 1, 'owner_profile_invalid', 'Expected one owner descriptor.');
    const descriptor = (0, common_1.strictJson)(rows[0]);
    validateDescriptor(descriptor);
    (0, common_1.check)(descriptor.schema === 'context-owner-descriptor/v2', 'owner_profile_invalid', 'Expected a v2 descriptor.');
    return descriptor;
}
const markdownEscape = (text) => text.replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replaceAll('\n', ' ');
exports.markdownEscape = markdownEscape;
const entryRow = (row) => `- [[${row.path.replace(/\.md$/, '')}]] — ${(0, exports.markdownEscape)(row.title)} — ${(0, exports.markdownEscape)(row.summary)} <!-- context-entry ${(0, common_1.compactJson)(row)} -->`;
exports.entryRow = entryRow;
function parseAreaIndex(text, tolerant = false) {
    const fm = parseFrontmatter(text).frontmatter;
    (0, common_1.check)(fm.schema === 'context-area-index/v1' && fm.index === true && /^[a-z][a-z0-9_-]{0,79}$/.test(fm.area), 'index_noncanonical', 'Invalid area index metadata.', {}, common_1.EXIT.integrity);
    const descriptor = readProfile(text);
    if (descriptor)
        (0, common_1.check)(descriptor.kind === fm.area && descriptor.owner === fm.owner && descriptor.artifact_schema === fm.artifact_schema && descriptor.authority === fm.authority && (0, common_1.compactJson)(descriptor.structural_profile.index_projection) === (0, common_1.compactJson)(fm.projection_fields ?? []), 'owner_profile_invalid', 'Profile differs from area metadata.');
    const result = { frontmatter: fm, current: [], history: [], descriptor }, seen = new Set();
    for (const state of ['current', ...(fm.area === 'snapshot' ? [] : ['history'])]) {
        let previous = '';
        for (const line of extractBlock(text, state)) {
            const match = /<!-- context-entry (\{.*\}) -->$/.exec(line);
            (0, common_1.check)(match, 'index_noncanonical', 'Malformed area row.');
            const row = (0, common_1.strictJson)(match[1]);
            (0, common_1.requireId)(row.id);
            (0, common_1.check)(row.state === state, 'index_wrong_state', 'Entry is in the wrong block.');
            const expected = `context/${fm.area}/${state === 'history' ? 'retired/' : ''}`;
            (0, common_1.check)(typeof row.path === 'string' && row.path.startsWith(expected) && row.path.endsWith('.md') && !row.path.endsWith('.index.md') && !row.path.split('/').some((p) => !p || p === '.' || p === '..') && row.path.split('/').length === (state === 'history' ? 4 : 3), 'path_escape', 'Area entry path escapes its area.');
            if (!tolerant) {
                (0, common_1.check)(!seen.has(row.id), 'index_duplicate_entry', 'Duplicate area entry.', { id: row.id }, common_1.EXIT.integrity);
                const base = ['id', 'path', 'title', 'summary', 'state', 'created_at', ...(row.updated_at ? ['updated_at'] : []), 'terms', ...(state === 'history' ? ['retired_at', 'retired_reason', ...(row.superseded_by ? ['superseded_by'] : [])] : []), ...(fm.projection_fields ?? []).filter((k) => Object.hasOwn(row, k))];
                (0, common_1.check)((0, common_1.compactJson)(Object.keys(row)) === (0, common_1.compactJson)(base) && (0, exports.entryRow)(row) === line && (0, common_1.compareText)(previous, row.created_at + row.id) <= 0, 'index_noncanonical', 'Area row is not canonical.', {}, common_1.EXIT.integrity);
            }
            previous = row.created_at + row.id;
            seen.add(row.id);
            result[state].push(row);
        }
    }
    return result;
}
