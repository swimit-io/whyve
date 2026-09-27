import { createHash, randomUUID } from 'node:crypto';
import { normalize, casefold, nonAlnum, nonFilename } from './unicode';
import contractData from './contracts.json';
import release from './release.json';
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
/** Dynamic protocol documents are validated at the boundary before use. */
export type ObjectValue = Record<string, any>;
export const contracts: ObjectValue = contractData;
export const PROTOCOL = 'context-common/v3';
export const VERSION = release.version;
export const EXIT = { usage: 2, notFound: 3, conflict: 5, integrity: 6, internal: 1 } as const;
export class WhyveError extends Error {
    constructor(public readonly code: string, message: string, public readonly details: ObjectValue = {}, public readonly exitCode: number = EXIT.usage) {
        super(message);
        this.name = 'WhyveError';
    }
    envelope() { return { ok: false as const, error: { code: this.code, message: this.message, details: this.details } }; }
}
export function toWhyveError(error: unknown): WhyveError {
    if (error instanceof WhyveError)
        return error;
    const details = error instanceof Error && 'code' in error && typeof error.code === 'string' ? { system_code: error.code } : {};
    return new WhyveError('runtime_error', error instanceof Error ? error.message : String(error), details, EXIT.internal);
}
export function withErrors<T>(fn: () => T): T { try {
    return fn();
}
catch (error) {
    throw toWhyveError(error);
} }
export function fail(code: string, message: string, details: ObjectValue = {}, exitCode: number = EXIT.usage): never { throw new WhyveError(code, message, details, exitCode); }
export function check(condition: unknown, code: string, message: string, details: ObjectValue = {}, exitCode: number = EXIT.usage): asserts condition {
    if (!condition)
        fail(code, message, details, exitCode);
}
export function object(value: unknown): value is ObjectValue { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
export function exact(value: unknown, keys: string[], code = 'schema_invalid'): asserts value is ObjectValue {
    check(object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), code, 'Unexpected or missing object fields.');
}
export const nfc = (value: string) => normalize(value, 'NFC');
export const codepoints = (value: string) => [...value].length;
/** Python orders strings by Unicode scalar, not UTF-16 code units. */
export function compareText(a: string, b: string): number {
    const aa = [...a], bb = [...b];
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
        const delta = aa[i].codePointAt(0)! - bb[i].codePointAt(0)!;
        if (delta)
            return delta;
    }
    return aa.length - bb.length;
}
export const normalizedKey = (value: string): string => casefold(normalize(value, 'NFKC'));
export function canonicalJson(value: unknown): string {
    const seen = new Set<unknown>();
    function encode(v: unknown): string {
        if (v === null || typeof v === 'boolean')
            return JSON.stringify(v);
        if (typeof v === 'string') {
            check(!/[\uD800-\uDFFF]/u.test(v), 'canonical_json_invalid', 'Unpaired surrogate is not UTF-8.');
            return JSON.stringify(nfc(v));
        }
        if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0))
            return String(v);
        check(Array.isArray(v) || object(v), 'canonical_json_invalid', 'Unsupported canonical JSON scalar.');
        check(!seen.has(v), 'canonical_json_invalid', 'Cyclic JSON value.');
        seen.add(v);
        let result: string;
        if (Array.isArray(v)) {
            check(Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i)).every(Boolean), 'canonical_json_invalid', 'Sparse arrays are not JSON values.');
            result = '[' + v.map(encode).join(',') + ']';
        }
        else {
            const entries = new Map<string, unknown>();
            for (const [raw, item] of Object.entries(v)) {
                check(!/[\uD800-\uDFFF]/u.test(raw), 'canonical_json_invalid', 'Unpaired surrogate key is not UTF-8.');
                const key = nfc(raw);
                check(!entries.has(key), 'canonical_json_invalid', 'NFC-normalized object keys collide.', { key });
                entries.set(key, item);
            }
            result = '{' + [...entries.keys()].sort(compareText).map(k => JSON.stringify(k) + ':' + encode(entries.get(k))).join(',') + '}';
        }
        seen.delete(v);
        return result;
    }
    return encode(value);
}
export const sha256 = (value: string | Uint8Array) => 'sha256:' + createHash('sha256').update(value).digest('hex');
export const canonicalDigest = (value: unknown) => sha256(canonicalJson(value));
export const compactJson = (value: unknown) => JSON.stringify(value);
export const fileBytes = (text: string) => Buffer.from(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n*$/, '') + '\n', 'utf8');
export const newId = () => 'ctx_' + randomUUID().replaceAll('-', '');
export const newPlanId = () => 'plan_' + randomUUID().replaceAll('-', '');
export function requireId(value: unknown, field = 'id'): asserts value is string { check(typeof value === 'string' && /^ctx_[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(value), 'id_invalid', `${field} must be ctx_ plus lowercase UUIDv4 hex.`, { field }); }
export function strictJson(text: string, code = 'schema_invalid'): any {
    // A small JSON reader retains duplicate-key detection lost by JSON.parse's reviver.
    let p = 0;
    const white = () => {
        while (/[\t\r\n ]/.test(text[p] ?? '\0'))
            p++;
    };
    const invalid = (): never => fail(code, 'Input must be valid protocol JSON without duplicate keys or non-integer numbers.', {}, EXIT.usage);
    const string = () => {
        const start = p++;
        while (p < text.length) {
            if (text[p] === '\\')
                p += 2;
            else if (text[p++] === '"') {
                try {
                    return JSON.parse(text.slice(start, p));
                }
                catch {
                    invalid();
                }
            }
        }
        return invalid();
    };
    function value(): any {
        white();
        const char = text[p];
        if (char === '"')
            return string();
        if (char === '{' || char === '[') {
            p++;
            const isObject = char === '{', end = isObject ? '}' : ']';
            const out: any = isObject ? Object.create(null) : [];
            white();
            if (text[p] === end) {
                p++;
                return out;
            }
            while (p < text.length) {
                white();
                if (isObject) {
                    if (text[p] !== '"')
                        invalid();
                    const key = string();
                    white();
                    if (text[p++] !== ':')
                        invalid();
                    if (Object.hasOwn(out, key))
                        fail(code, 'JSON object contains a duplicate key.', { key }, EXIT.conflict);
                    out[key] = value();
                }
                else
                    out.push(value());
                white();
                if (text[p] === end) {
                    p++;
                    return out;
                }
                if (text[p++] !== ',')
                    invalid();
            }
            invalid();
        }
        const match = /^(?:null|true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(p));
        if (!match)
            invalid();
        const token = match![0];
        if (/^[\d-]/.test(token) && /[.eE]/.test(token))
            invalid();
        p += token.length;
        const parsed = JSON.parse(token);
        return Object.is(parsed, -0) ? 0 : parsed;
    }
    const result = value();
    white();
    if (p !== text.length)
        invalid();
    return result;
}
export function substantive(value: unknown): value is string { return typeof value === 'string' && !!value.trim() && !['...', 'TODO', 'TBD', 'N/A', '해당 없음'].includes(value.trim()); }
export function shortText(value: unknown, field: string, maximum: number, multiline = false): string {
    check(substantive(value) && (multiline || !value.includes('\n')) && codepoints(value) <= maximum, 'schema_invalid', `${field} must be non-empty and at most ${maximum} codepoints.`, { field });
    return value.trim();
}
export function stringList(value: unknown, field: string, minimum = 0, maximum = 12, itemMaximum = 500): string[] {
    check(Array.isArray(value) && value.length >= minimum && value.length <= maximum, 'schema_invalid', `${field} has an invalid item count.`);
    return value.map(item => shortText(item, field, itemMaximum));
}
export function timestamp(value?: string): string {
    const result = value ?? new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
    check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(result) && Number.isFinite(Date.parse(result)), 'schema_invalid', 'Timestamp must include an offset and seconds precision.');
    date(result.slice(0, 10));
    check(Number(result.slice(11, 13)) < 24 && Number(result.slice(14, 16)) < 60 && Number(result.slice(17, 19)) < 60 && Number(result.slice(20, 22)) < 24 && Number(result.slice(23, 25)) < 60, 'schema_invalid', 'Invalid timestamp.');
    return result;
}
export function date(value: string): string { check(/^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value + 'T'), 'schema_invalid', 'Date must be a canonical ISO date.'); return value; }
function slotPart(value: string, maximum: number) { const result = normalizedKey(value.trim()).replace(nonAlnum, '-').replace(/^-+|-+$/g, ''); return result && codepoints(result) <= maximum ? result : ''; }
export function canonicalScope(value: string): string {
    check(typeof value === 'string', 'scope_invalid', 'Scope must be a string.');
    const raw = normalizedKey(value.trim()).replace(/^\/+|\/+$/g, ''), parts = raw.split('/'), canonical = parts.map(p => slotPart(p, 40)), result = canonical.join('/');
    check(parts.length <= 8 && canonical.every(Boolean) && codepoints(result) <= 160, 'scope_invalid', 'Invalid scope.');
    return result;
}
export function canonicalKey(value: string): string { check(typeof value === 'string' && !value.includes('/'), 'key_invalid', 'Invalid slot key.'); const result = slotPart(value, 80); check(result, 'key_invalid', 'Invalid slot key.'); return result; }
export const scopesOverlap = (a: string, b: string) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
export function filename(value: string): string {
    check(typeof value === 'string', 'filename_invalid', 'Filename must be a string.');
    value = nfc(value);
    const basename = value.endsWith('.md') ? value : !value.includes('.') ? value + '.md' : fail('filename_invalid', 'Filename extension must be .md.');
    const stem = basename.slice(0, -3), folded = normalizedKey(basename);
    check(stem && !['.', '..'].includes(stem) && !/[\/\\<>:"|?*\[\]#^\x00-\x1f\x7f]/.test(basename), 'filename_invalid', 'Filename contains a forbidden character.');
    check(!folded.endsWith('.index.md') && !folded.includes('<!--') && !folded.includes('-->'), 'reserved_path', 'Artifact filename is reserved.', {}, EXIT.conflict);
    check(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalizedKey(stem)), 'filename_invalid', 'Filename is reserved by supported filesystems.');
    check(codepoints(basename) <= 120 && Buffer.byteLength(basename) <= 240, 'filename_required', 'Filename exceeds the v1 limit.');
    return basename;
}
export function naturalFilename(title: string): string { const stem = nfc(title.trim()).replace(nonFilename, '-').replace(/^[-._]+|[-._]+$/g, ''); check(stem, 'filename_required', 'Title cannot produce a safe filename.'); return filename(stem + '.md'); }
