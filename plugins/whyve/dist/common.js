"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopesOverlap = exports.newPlanId = exports.newId = exports.fileBytes = exports.compactJson = exports.canonicalDigest = exports.sha256 = exports.normalizedKey = exports.codepoints = exports.nfc = exports.WhyveError = exports.EXIT = exports.VERSION = exports.PROTOCOL = exports.contracts = void 0;
exports.toWhyveError = toWhyveError;
exports.withErrors = withErrors;
exports.fail = fail;
exports.check = check;
exports.object = object;
exports.exact = exact;
exports.compareText = compareText;
exports.canonicalJson = canonicalJson;
exports.requireId = requireId;
exports.strictJson = strictJson;
exports.substantive = substantive;
exports.shortText = shortText;
exports.stringList = stringList;
exports.timestamp = timestamp;
exports.date = date;
exports.canonicalScope = canonicalScope;
exports.canonicalKey = canonicalKey;
exports.filename = filename;
exports.naturalFilename = naturalFilename;
const node_crypto_1 = require("node:crypto");
const unicode_1 = require("./unicode");
const contracts_json_1 = __importDefault(require("./contracts.json"));
const release_json_1 = __importDefault(require("./release.json"));
exports.contracts = contracts_json_1.default;
exports.PROTOCOL = 'context-common/v3';
exports.VERSION = release_json_1.default.version;
exports.EXIT = { usage: 2, notFound: 3, conflict: 5, integrity: 6, internal: 1 };
class WhyveError extends Error {
    code;
    details;
    exitCode;
    constructor(code, message, details = {}, exitCode = exports.EXIT.usage) {
        super(message);
        this.code = code;
        this.details = details;
        this.exitCode = exitCode;
        this.name = 'WhyveError';
    }
    envelope() { return { ok: false, error: { code: this.code, message: this.message, details: this.details } }; }
}
exports.WhyveError = WhyveError;
function toWhyveError(error) {
    if (error instanceof WhyveError)
        return error;
    const details = error instanceof Error && 'code' in error && typeof error.code === 'string' ? { system_code: error.code } : {};
    return new WhyveError('runtime_error', error instanceof Error ? error.message : String(error), details, exports.EXIT.internal);
}
function withErrors(fn) {
    try {
        return fn();
    }
    catch (error) {
        throw toWhyveError(error);
    }
}
function fail(code, message, details = {}, exitCode = exports.EXIT.usage) { throw new WhyveError(code, message, details, exitCode); }
function check(condition, code, message, details = {}, exitCode = exports.EXIT.usage) {
    if (!condition)
        fail(code, message, details, exitCode);
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function exact(value, keys, code = 'schema_invalid') {
    check(object(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), code, 'Unexpected or missing object fields.');
}
const nfc = (value) => (0, unicode_1.normalize)(value, 'NFC');
exports.nfc = nfc;
const codepoints = (value) => [...value].length;
exports.codepoints = codepoints;
/** Python orders strings by Unicode scalar, not UTF-16 code units. */
function compareText(a, b) {
    const aa = [...a], bb = [...b];
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
        const delta = aa[i].codePointAt(0) - bb[i].codePointAt(0);
        if (delta)
            return delta;
    }
    return aa.length - bb.length;
}
const normalizedKey = (value) => (0, unicode_1.casefold)((0, unicode_1.normalize)(value, 'NFKC'));
exports.normalizedKey = normalizedKey;
function canonicalJson(value) {
    const seen = new Set();
    function encode(v) {
        if (v === null || typeof v === 'boolean')
            return JSON.stringify(v);
        if (typeof v === 'string') {
            check(!/[\uD800-\uDFFF]/u.test(v), 'canonical_json_invalid', 'Unpaired surrogate is not UTF-8.');
            return JSON.stringify((0, exports.nfc)(v));
        }
        if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0))
            return String(v);
        check(Array.isArray(v) || object(v), 'canonical_json_invalid', 'Unsupported canonical JSON scalar.');
        check(!seen.has(v), 'canonical_json_invalid', 'Cyclic JSON value.');
        seen.add(v);
        let result;
        if (Array.isArray(v)) {
            check(Array.from({ length: v.length }, (_, i) => Object.hasOwn(v, i)).every(Boolean), 'canonical_json_invalid', 'Sparse arrays are not JSON values.');
            result = '[' + v.map(encode).join(',') + ']';
        }
        else {
            const entries = new Map();
            for (const [raw, item] of Object.entries(v)) {
                check(!/[\uD800-\uDFFF]/u.test(raw), 'canonical_json_invalid', 'Unpaired surrogate key is not UTF-8.');
                const key = (0, exports.nfc)(raw);
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
const sha256 = (value) => 'sha256:' + (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
exports.sha256 = sha256;
const canonicalDigest = (value) => (0, exports.sha256)(canonicalJson(value));
exports.canonicalDigest = canonicalDigest;
const compactJson = (value) => JSON.stringify(value);
exports.compactJson = compactJson;
const fileBytes = (text) => Buffer.from(text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n*$/, '') + '\n', 'utf8');
exports.fileBytes = fileBytes;
const newId = () => 'ctx_' + (0, node_crypto_1.randomUUID)().replaceAll('-', '');
exports.newId = newId;
const newPlanId = () => 'plan_' + (0, node_crypto_1.randomUUID)().replaceAll('-', '');
exports.newPlanId = newPlanId;
function requireId(value, field = 'id') { check(typeof value === 'string' && /^ctx_[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(value), 'id_invalid', `${field} must be "ctx_" followed by a lowercase UUIDv4 in hex.`, { field }); }
function strictJson(text, code = 'schema_invalid') {
    // A small JSON reader retains duplicate-key detection lost by JSON.parse's reviver.
    let p = 0;
    const white = () => {
        while (/[\t\r\n ]/.test(text[p] ?? '\0'))
            p++;
    };
    const invalid = () => fail(code, 'Input must be valid protocol JSON without duplicate keys or non-integer numbers.', {}, exports.EXIT.usage);
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
    function value() {
        white();
        const char = text[p];
        if (char === '"')
            return string();
        if (char === '{' || char === '[') {
            p++;
            const isObject = char === '{', end = isObject ? '}' : ']';
            const out = isObject ? Object.create(null) : [];
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
                        fail(code, 'JSON object contains a duplicate key.', { key }, exports.EXIT.conflict);
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
        const token = match[0];
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
function substantive(value) { return typeof value === 'string' && !!value.trim() && !['...', 'TODO', 'TBD', 'N/A', '해당 없음'].includes(value.trim()); }
function shortText(value, field, maximum, multiline = false) {
    check(substantive(value) && (multiline || !value.includes('\n')) && (0, exports.codepoints)(value) <= maximum, 'schema_invalid', `${field} must be non-empty and at most ${maximum} codepoints.`, { field });
    return value.trim();
}
function stringList(value, field, minimum = 0, maximum = 12, itemMaximum = 500) {
    check(Array.isArray(value) && value.length >= minimum && value.length <= maximum, 'schema_invalid', `${field} has an invalid item count.`);
    return value.map(item => shortText(item, field, itemMaximum));
}
function timestamp(value) {
    const result = value ?? new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00');
    check(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/.test(result) && Number.isFinite(Date.parse(result)), 'schema_invalid', 'Timestamp must include an offset and seconds precision.');
    date(result.slice(0, 10));
    check(Number(result.slice(11, 13)) < 24 && Number(result.slice(14, 16)) < 60 && Number(result.slice(17, 19)) < 60 && Number(result.slice(20, 22)) < 24 && Number(result.slice(23, 25)) < 60, 'schema_invalid', 'Invalid timestamp.');
    return result;
}
function date(value) { check(/^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value + 'T'), 'schema_invalid', 'Date must be a canonical ISO date.'); return value; }
function slotPart(value, maximum) { const result = (0, exports.normalizedKey)(value.trim()).replace(unicode_1.nonAlnum, '-').replace(/^-+|-+$/g, ''); return result && (0, exports.codepoints)(result) <= maximum ? result : ''; }
function canonicalScope(value) {
    check(typeof value === 'string', 'scope_invalid', 'Scope must be a string.');
    const raw = (0, exports.normalizedKey)(value.trim()).replace(/^\/+|\/+$/g, ''), parts = raw.split('/'), canonical = parts.map(p => slotPart(p, 40)), result = canonical.join('/');
    check(parts.length <= 8 && canonical.every(Boolean) && (0, exports.codepoints)(result) <= 160, 'scope_invalid', 'Invalid scope.');
    return result;
}
function canonicalKey(value) { check(typeof value === 'string' && !value.includes('/'), 'key_invalid', 'Invalid slot key.'); const result = slotPart(value, 80); check(result, 'key_invalid', 'Invalid slot key.'); return result; }
const scopesOverlap = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
exports.scopesOverlap = scopesOverlap;
function filename(value) {
    check(typeof value === 'string', 'filename_invalid', 'Filename must be a string.');
    value = (0, exports.nfc)(value);
    const basename = value.endsWith('.md') ? value : !value.includes('.') ? value + '.md' : fail('filename_invalid', 'Filename extension must be .md.');
    const stem = basename.slice(0, -3), folded = (0, exports.normalizedKey)(basename);
    check(stem && !['.', '..'].includes(stem) && !/[\/\\<>:"|?*\[\]#^\x00-\x1f\x7f]/.test(basename), 'filename_invalid', 'Filename contains a forbidden character.');
    check(!folded.endsWith('.index.md') && !folded.includes('<!--') && !folded.includes('-->'), 'reserved_path', 'Artifact filename is reserved.', {}, exports.EXIT.conflict);
    check(!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test((0, exports.normalizedKey)(stem)), 'filename_invalid', 'Filename is reserved by supported filesystems.');
    check((0, exports.codepoints)(basename) <= 120 && Buffer.byteLength(basename) <= 240, 'filename_required', 'Filename is too long (maximum 120 characters and 240 bytes).');
    return basename;
}
function naturalFilename(title) { const stem = (0, exports.nfc)(title.trim()).replace(unicode_1.nonFilename, '-').replace(/^[-._]+|[-._]+$/g, ''); check(stem, 'filename_required', 'Title cannot produce a safe filename.'); return filename(stem + '.md'); }
