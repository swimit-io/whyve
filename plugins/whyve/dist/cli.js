#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCli = runCli;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const store_1 = require("./store");
const common_1 = require("./common");
const model_1 = require("./model");
const migrate_project_1 = require("./migrate-project");
const migrate_format_1 = require("./migrate-format");
const BOOLEAN = new Set(['json', 'help', 'approved', 'apply', 'fix', 'dry-run', 'raw', 'include-history', 'confirm-legacy-stopped', 'strict-index']);
const REPEATED = new Set(['kind', 'keyword', 'id', 'section', 'header', 'header-contains', 'header-regex', 'reference', 'select']);
const VALUES = new Set(['vault', 'project', 'input', 'state', 'scope', 'scope-match', 'key', 'keyword-match', 'text', 'order', 'limit', 'cursor', 'max-bytes', 'features', 'approval-mode', 'host', 'policy-decision', 'policy-reason', 'meaning', 'lock-timeout-ms', 'to-format', 'plan-dir', 'apply-plan', 'rollback-plan', 'ref-headers', 'created-from', 'created-to', 'updated-from', 'updated-to', ...REPEATED]);
const USAGE = `whyve ${common_1.VERSION} (${common_1.PROTOCOL})
  status | capabilities | settings | schema [KIND]
  init [--features decision,intent] [--approval-mode explicit|auto|adaptive] [--host codex|claude-code]
  list [--input FILE|-] [--kind K]... [--state current|history|all] [--scope S [--scope-match exact|ancestor|descendant|overlap]]
       [--key K] [--keyword W]... [--keyword-match all|any] [--id ID]... [--text T] [--header KEY=VALUE]...
       [--header-contains KEY=VALUE]... [--header-regex KEY=PATTERN]... [--order recent] [--limit N] [--cursor C]
  search-headers [same filters] --header... [--select KEY|NS.*]...
  read ID [--section NAME]... [--max-bytes N] [--cursor C] [--raw]
  check-slot --input FILE          ({record, options?})
  compare --input FILE [--cursor C]
  prepare --input FILE [--approved [--reference MSG]... [--meaning TEXT]] | [--policy-decision record|ask --policy-reason TEXT] [--apply]
  apply HANDLE
  refresh [--fix] | doctor
  migrate-project PATH [--dry-run]                       (migrate legacy .bobbin settings to .whyve)
  migrate-project PATH --to-format context-common/v3 --plan-dir DIR (--dry-run | --apply-plan FILE | --rollback-plan FILE) [--ref-headers howse|none]
  runtime recover | runtime adopt --confirm-legacy-stopped
Common: --vault DIR --project DIR --json. Output is one JSON envelope {ok, result|error}.`;
function defaultProject() {
    const current = process.env.WHYVE_PROJECT_ROOT ? path.resolve(process.env.WHYVE_PROJECT_ROOT) : process.cwd();
    for (let candidate = current;; candidate = path.dirname(candidate)) {
        if (fs.existsSync(path.join(candidate, '.whyve')) || fs.existsSync(path.join(candidate, 'context/context.index.md')))
            return candidate;
        if (path.dirname(candidate) === candidate)
            break;
    }
    return current;
}
function loadJson(source) {
    (0, common_1.check)(typeof source === 'string' && source.length > 0, 'usage_invalid', 'Provide --input FILE or --input - for stdin.');
    const text = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
    (0, common_1.check)(Buffer.byteLength(text) <= 8 * 1024 * 1024, 'input_too_large', 'Input exceeds 8 MiB.');
    return (0, common_1.strictJson)(text);
}
function parse(argv) {
    const flags = {}, positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--') || arg === '--') {
            positional.push(arg);
            continue;
        }
        const key = arg.slice(2);
        (0, common_1.check)(BOOLEAN.has(key) || VALUES.has(key), 'usage_invalid', `Unknown option --${key}.`);
        if (BOOLEAN.has(key)) {
            flags[key] = true;
            continue;
        }
        (0, common_1.check)(i + 1 < argv.length && !(argv[i + 1].startsWith('--') && argv[i + 1] !== '-'), 'usage_invalid', `Missing value for ${arg}.`);
        const value = argv[++i];
        if (REPEATED.has(key))
            (flags[key] ??= []).push(value);
        else {
            (0, common_1.check)(flags[key] === undefined, 'usage_invalid', `--${key} can be given only once.`);
            flags[key] = value;
        }
    }
    return { flags, positional };
}
const int = (value, name) => { if (value === undefined)
    return undefined; const n = Number(value); (0, common_1.check)(Number.isSafeInteger(n), 'usage_invalid', `--${name} must be an integer.`); return n; };
function headerConditions(flags) {
    const conditions = [];
    for (const [flag, op] of [['header', 'eq'], ['header-contains', 'contains'], ['header-regex', 'regex']])
        for (const raw of flags[flag] ?? []) {
            const at = raw.indexOf('=');
            (0, common_1.check)(at > 0, 'usage_invalid', `--${flag} expects KEY=VALUE.`);
            let value = raw.slice(at + 1), extra = {};
            const slash = op === 'regex' ? /^\/(.*)\/(i?)$/s.exec(value) : null;
            if (slash) {
                value = slash[1];
                if (slash[2])
                    extra = { flags: 'i' };
            }
            conditions.push({ key: raw.slice(0, at), op, value, ...extra });
        }
    return conditions.length ? { conditions } : undefined;
}
function listOptions(flags, defaultKind) {
    const base = flags.input !== undefined ? loadJson(flags.input) : {};
    const kinds = flags.kind ?? (defaultKind && !base.kinds ? [defaultKind] : undefined);
    const range = (from, to) => flags[from] || flags[to] ? { ...(flags[from] ? { from: flags[from] } : {}), ...(flags[to] ? { to: flags[to] } : {}) } : undefined;
    const extra = {
        kinds, state: flags.state ?? (flags['include-history'] ? 'all' : undefined), scope: flags.scope ? { value: flags.scope, ...(flags['scope-match'] ? { match: flags['scope-match'] } : {}) } : undefined,
        key: flags.key, keywords: flags.keyword ? { values: flags.keyword, ...(flags['keyword-match'] ? { match: flags['keyword-match'] } : {}) } : undefined, ids: flags.id, textContains: flags.text,
        headers: headerConditions(flags), created: range('created-from', 'created-to'), updated: range('updated-from', 'updated-to'), order: flags.order, limit: int(flags.limit, 'limit'), cursor: flags.cursor,
        strictIndex: flags['strict-index'] ? true : undefined, select: flags.select,
    };
    for (const [k, v] of Object.entries(extra))
        if (v !== undefined)
            base[k] = v;
    return base;
}
function authorization(flags, fallback) {
    if (flags['policy-decision'] || flags['policy-reason'])
        return { source: 'policy', decision: flags['policy-decision'], reason: flags['policy-reason'] };
    if (flags.approved)
        return { source: 'user', ...(flags.reference ? { references: flags.reference } : {}), ...(flags.meaning ? { meaning: flags.meaning } : {}) };
    return fallback ?? (0, common_1.fail)('approval_required', 'Use --approved only after the user has approved this exact content, or supply --policy-decision and --policy-reason for the configured policy.', {}, common_1.EXIT.conflict);
}
async function runCli(argv) {
    try {
        const { flags, positional } = parse(argv);
        let command = positional.shift() ?? 'help', defaultKind;
        // `whyve decision list ...` narrows discovery to one kind (skill wrappers use this form).
        if ((0, model_1.isKind)(command)) {
            defaultKind = command;
            command = positional.shift() ?? 'help';
        }
        if (command === 'help' || flags.help) {
            process.stdout.write(JSON.stringify({ ok: true, result: { usage: USAGE } }) + '\n');
            return 0;
        }
        if (command === 'migrate-project') {
            (0, common_1.check)(positional.length === 1, 'usage_invalid', 'Usage: whyve migrate-project PATH ...');
            let result;
            if (flags['to-format'] !== undefined) {
                (0, common_1.check)(flags['to-format'] === model_1.MODEL.protocol, 'usage_invalid', `--to-format supports only ${model_1.MODEL.protocol}.`);
                (0, common_1.check)(['howse', 'none', undefined].includes(flags['ref-headers']), 'usage_invalid', '--ref-headers must be howse or none.');
                result = await (0, migrate_format_1.migrateFormat)(positional[0], { vault: flags.vault, planDir: flags['plan-dir'], dryRun: !!flags['dry-run'], applyPlan: flags['apply-plan'], rollbackPlan: flags['rollback-plan'], refHeaders: flags['ref-headers'] === 'none' ? null : 'howse', lockTimeoutMs: int(flags['lock-timeout-ms'], 'lock-timeout-ms') });
            }
            else
                result = (0, migrate_project_1.migrateProject)(positional[0], { dryRun: !!flags['dry-run'] });
            process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
            return result.status === 'blocked' ? common_1.EXIT.conflict : 0;
        }
        const whyve = (0, store_1.createWhyve)({ vault: flags.vault, project: flags.project ?? (flags.vault ? undefined : defaultProject()), lockTimeoutMs: int(flags['lock-timeout-ms'], 'lock-timeout-ms') });
        let result;
        switch (command) {
            case 'status':
                result = await whyve.status();
                break;
            case 'capabilities':
                result = whyve.capabilities();
                break;
            case 'settings':
                result = whyve.settings();
                break;
            case 'schema': {
                const kind = positional[0] ?? defaultKind;
                result = kind ? ((0, common_1.check)((0, model_1.isKind)(kind), 'usage_invalid', 'Unknown kind.'), { kind, ...model_1.MODEL.kinds[kind], common: model_1.MODEL.common, limits: model_1.MODEL.limits }) : model_1.MODEL;
                break;
            }
            case 'init': {
                // `whyve decision init` adds that feature to the existing selection.
                const existing = whyve.settings(), selected = flags.features !== undefined ? String(flags.features).split(',').filter(Boolean)
                    : defaultKind ? [...new Set([...(existing.config?.features ?? existing.registered_features), ...(['decision', 'assumption', 'term', 'intent', 'document'].includes(defaultKind) ? [defaultKind] : [])])] : undefined;
                result = await whyve.initialize({ features: selected, approvalMode: flags['approval-mode'], host: flags.host });
                break;
            }
            case 'list':
                result = await whyve.list(listOptions(flags, defaultKind));
                break;
            case 'search-headers':
                result = await whyve.searchHeaders(listOptions(flags, defaultKind));
                break;
            case 'read':
                result = await whyve.read(positional[0], { ...(flags.section ? { sections: flags.section } : {}), maxBytes: int(flags['max-bytes'], 'max-bytes'), cursor: flags.cursor, raw: flags.raw });
                break;
            case 'check-slot': {
                const input = loadJson(flags.input);
                result = await whyve.checkSlot(input.record, input.options);
                break;
            }
            case 'compare': {
                const input = loadJson(flags.input);
                result = await whyve.compare({ ...input, ...(flags.cursor ? { cursor: flags.cursor } : {}) });
                break;
            }
            case 'prepare': {
                const input = loadJson(flags.input);
                const request = input.preparedHandle ? { preparedHandle: input.preparedHandle, authorization: authorization(flags, input.authorization) } : { ...input, authorization: authorization(flags, input.authorization) };
                result = await whyve.prepare(request);
                if (flags.apply && result.status === 'prepared')
                    result = { prepared: result, receipt: await whyve.apply(result.handle) };
                break;
            }
            case 'apply':
                result = await whyve.apply(positional[0]);
                break;
            case 'refresh':
                result = await whyve.refresh(!!flags.fix);
                break;
            case 'doctor':
                result = { version: common_1.VERSION, protocol: common_1.PROTOCOL, runtime: { node: process.versions.node, electron: process.versions.electron ?? null }, vault: whyve.vault, project: whyve.project, ...await whyve.refresh(false) };
                break;
            case 'runtime':
                if (positional[0] === 'adopt')
                    result = whyve.adoptLegacy(!!flags['confirm-legacy-stopped']);
                else if (positional[0] === 'recover')
                    result = await whyve.recoverRuntime();
                else
                    (0, common_1.fail)('usage_invalid', 'Expected "runtime adopt" or "runtime recover".');
                break;
            default: (0, common_1.fail)('usage_invalid', `Unknown command: ${command}. Run help to list the commands.`);
        }
        if ((command === 'refresh' || command === 'doctor') && result.ok === false) {
            process.stdout.write(JSON.stringify({ ok: false, error: { code: 'integrity_error', message: 'Record or index validation found issues.', details: result } }) + '\n');
            return common_1.EXIT.integrity;
        }
        process.stdout.write(JSON.stringify({ ok: true, result }) + '\n');
        return 0;
    }
    catch (error) {
        const e = (0, common_1.toWhyveError)(error);
        process.stdout.write(JSON.stringify(e.envelope()) + '\n');
        return e.exitCode;
    }
}
if (require.main === module)
    runCli(process.argv.slice(2)).then(code => { process.exitCode = code; });
