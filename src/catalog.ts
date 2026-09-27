import * as fs from 'node:fs';
import { ObjectValue, canonicalDigest, strictJson, compareText, check, EXIT } from './common';
import { parseFrontmatter, ContextDocument, readProfile, descriptorFor, validateDescriptor, extractBlock } from './documents';
import { contained, bytes, readText, utf8 } from './filesystem';
/** Read-only v2 (context-common/v2) catalog access for compatibility reads and the explicit format migration. */
export interface Area {
    row: ObjectValue;
    metadata: ObjectValue;
    descriptor?: ObjectValue;
    text: string;
}
export interface RecordEntry {
    path: string;
    content: string;
    document: ContextDocument;
    row: ObjectValue;
    kind: string;
    area: Area;
}
export const ROOT_INDEX = 'context/context.index.md';
export function registeredAreas(root: string): Area[] {
    const raw = bytes(root, ROOT_INDEX);
    check(raw, 'context_root_missing', 'Context root index is missing.', { path: ROOT_INDEX }, EXIT.notFound);
    const rootText = utf8(raw), fm = parseFrontmatter(rootText).frontmatter;
    check(fm.schema === 'context-root-index/v1' && fm.index === true, 'index_noncanonical', 'Invalid root index metadata.', {}, EXIT.integrity);
    const seen = new Set<string>();
    return extractBlock(rootText, 'areas').map(line => {
        const match = /<!-- context-area (\{.*\}) -->$/.exec(line);
        check(match, 'index_noncanonical', 'Invalid root catalog row.', {}, EXIT.integrity);
        const row = strictJson(match[1]);
        check(typeof row.area === 'string' && /^[a-z][a-z0-9_-]{0,79}$/.test(row.area) && row.path === `context/${row.area}/${row.area}.index.md` && !seen.has(row.area), 'index_noncanonical', 'Invalid or duplicate root area.', {}, EXIT.integrity);
        seen.add(row.area);
        const text = readText(root, row.path), metadata = parseFrontmatter(text).frontmatter, descriptor = readProfile(text) ?? descriptorFor(row.area);
        check(metadata.area === row.area && metadata.owner === row.owner && metadata.artifact_schema === row.artifact_schema && metadata.authority === row.authority, 'index_stale', 'Area metadata differs from root catalog.', { area: row.area }, EXIT.integrity);
        if (descriptor) {
            validateDescriptor(descriptor);
            if (descriptor.schema === 'context-owner-descriptor/v2') {
                const profile = readProfile(text);
                check(profile, 'owner_profile_invalid', 'Profiled owner index has no descriptor.', {}, EXIT.integrity);
                const registry = extractBlock(rootText, 'owner-profiles').map(x => /<!-- context-owner-profile (\{.*\}) -->$/.exec(x)).map(m => m ? strictJson(m[1]) : null).find(x => x?.area === row.area);
                check(registry && registry.descriptor_digest === canonicalDigest(profile), 'owner_profile_invalid', 'Root registry and area descriptor differ.', {}, EXIT.integrity);
            }
        }
        return { row, metadata, descriptor, text };
    });
}
export function listArtifactPaths(root: string, area: string, includeHistory = true): string[] {
    const output: string[] = [];
    for (const directory of [`context/${area}`, ...(includeHistory ? [`context/${area}/retired`] : [])]) {
        const target = contained(root, directory);
        if (!fs.existsSync(target))
            continue;
        for (const item of fs.readdirSync(target, { withFileTypes: true })) {
            if (!item.name.endsWith('.md') || item.name.endsWith('.index.md'))
                continue;
            check(item.isFile() && !item.isSymbolicLink(), 'path_unsafe', 'Artifacts must be regular files.', { path: directory + '/' + item.name }, EXIT.integrity);
            output.push(directory + '/' + item.name);
        }
    }
    return output.sort(compareText);
}
