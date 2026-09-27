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
exports.migrateProject = migrateProject;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_child_process_1 = require("node:child_process");
const common_1 = require("./common");
const filesystem_1 = require("./filesystem");
// One-time conversion of a Bobbin 2.x project to Whyve. The legacy names below are
// the conversion input, so this file (and its test) is the only place they remain.
const LEGACY = { config: '.bobbin', runtime: '.bobbin-runtime', schema: 'bobbin-project/v1' };
const CURRENT = { config: '.whyve', runtime: '.whyve-runtime', schema: 'whyve-project/v1' };
const BEGIN = '<!-- BEGIN context-core-policy (managed by context-core) -->';
const END = '<!-- END context-core-policy (managed by context-core) -->';
function exists(p) { try {
    fs.lstatSync(p);
    return true;
}
catch {
    return false;
} }
function text(p) { return exists(p) ? fs.readFileSync(p, 'utf8') : null; }
function mode(p) { return fs.statSync(p).mode & 0o777; }
function tracked(project, relative) {
    const result = (0, node_child_process_1.spawnSync)('git', ['-C', project, 'ls-files', '--error-unmatch', relative], { stdio: 'ignore' });
    return result.status === 0;
}
function policyUpdate(original) {
    if (!original.includes(BEGIN) && !original.includes(END))
        return null;
    (0, common_1.check)(original.includes(BEGIN) && original.includes(END) && original.split(BEGIN).length === 2 && original.split(END).length === 2, 'policy_invalid', 'Managed guidance markers are malformed.');
    const updated = original.slice(0, original.indexOf(BEGIN)) + common_1.contracts.policy + original.slice(original.indexOf(END) + END.length);
    return updated === original ? null : updated;
}
function gitignoreUpdate(original) {
    const updated = original.split('\n').map(line => /^\/?\.bobbin-runtime\/?$/.test(line) ? line.replace(LEGACY.runtime, CURRENT.runtime) : line).join('\n');
    return updated === original ? null : updated;
}
/** Plan or apply `.bobbin` → `.whyve` for one project. Never reads or writes `context/`. */
function migrateProject(target, options = {}) {
    const project = (0, filesystem_1.realDirectory)(target);
    const legacyDir = path.join(project, LEGACY.config), currentDir = path.join(project, CURRENT.config);
    const hasLegacy = exists(legacyDir), hasCurrent = exists(currentDir);
    (0, common_1.check)(!(hasLegacy && hasCurrent), 'migration_conflict', `Both ${LEGACY.config} and ${CURRENT.config} exist; resolve one manually.`, { project }, common_1.EXIT.conflict);
    (0, common_1.check)(hasLegacy || hasCurrent, 'config_missing', `No ${LEGACY.config} or ${CURRENT.config} directory to migrate.`, { project }, common_1.EXIT.notFound);
    const configPath = path.join(hasLegacy ? legacyDir : currentDir, 'config.json');
    const raw = text(configPath);
    (0, common_1.check)(raw !== null, 'config_missing', 'Project configuration file is missing.', { path: configPath }, common_1.EXIT.notFound);
    const config = (0, common_1.strictJson)(raw, 'config_invalid');
    (0, common_1.check)(config.schema === LEGACY.schema || config.schema === CURRENT.schema, 'config_invalid', 'Unknown project configuration schema.', { schema: config.schema });
    (0, common_1.check)(typeof config.vault === 'string' && !!config.vault, 'config_invalid', 'Project configuration has no vault.');
    const vault = path.resolve(project, config.vault);
    for (const root of new Set([project, vault]))
        (0, common_1.check)(!exists(path.join(root, LEGACY.runtime, 'transaction.json')), 'transaction_pending', 'An interrupted transaction journal exists. Recover it with the previous runtime before migrating.', { root }, common_1.EXIT.conflict);
    const steps = [];
    const backup = hasLegacy && !tracked(project, `${LEGACY.config}/config.json`) ? `${LEGACY.config}.bak-${(options.now ?? new Date()).toISOString().replace(/[:.]/g, '-')}` : null;
    if (backup)
        steps.push({ action: 'backup', path: backup, detail: `copy of untracked ${LEGACY.config}` });
    if (hasLegacy)
        steps.push({ action: 'rename', path: CURRENT.config, detail: `${LEGACY.config} -> ${CURRENT.config}` });
    const newConfig = config.schema === LEGACY.schema ? JSON.stringify({ ...config, schema: CURRENT.schema }, null, 2) + '\n' : null;
    if (newConfig)
        steps.push({ action: 'rewrite', path: `${CURRENT.config}/config.json`, detail: `schema ${LEGACY.schema} -> ${CURRENT.schema}` });
    const runtimes = [...new Set([project, vault])].map(root => path.join(root, LEGACY.runtime)).filter(exists);
    for (const dir of runtimes) {
        (0, common_1.check)(fs.lstatSync(dir).isDirectory() && fs.readdirSync(dir).length === 0, 'runtime_not_empty', 'Legacy runtime directory is not empty. Stop every writer and inspect it before migrating.', { path: dir }, common_1.EXIT.conflict);
        steps.push({ action: 'remove', path: path.relative(project, dir) || '.', detail: 'empty legacy runtime directory' });
    }
    const edits = [];
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
        const original = text(path.join(project, name)), updated = original === null ? null : policyUpdate(original);
        if (updated !== null) {
            edits.push([name, updated]);
            steps.push({ action: 'rewrite', path: name, detail: 'context-core-policy block' });
        }
    }
    const ignore = text(path.join(project, '.gitignore')), ignoreUpdated = ignore === null ? null : gitignoreUpdate(ignore);
    if (ignoreUpdated !== null) {
        edits.push(['.gitignore', ignoreUpdated]);
        steps.push({ action: 'rewrite', path: '.gitignore', detail: `${LEGACY.runtime} -> ${CURRENT.runtime}` });
    }
    const status = steps.length === 0 ? 'already_migrated' : options.dryRun ? 'planned' : 'migrated';
    if (!options.dryRun) {
        if (backup)
            fs.cpSync(legacyDir, path.join(project, backup), { recursive: true, preserveTimestamps: true });
        if (hasLegacy)
            fs.renameSync(legacyDir, currentDir);
        if (newConfig)
            (0, filesystem_1.atomicWrite)(project, `${CURRENT.config}/config.json`, Buffer.from(newConfig), mode(path.join(currentDir, 'config.json')));
        for (const dir of runtimes)
            fs.rmdirSync(dir);
        for (const [name, content] of edits)
            (0, filesystem_1.atomicWrite)(project, name, Buffer.from(content), mode(path.join(project, name)));
    }
    return { schema: 'whyve-migrate-project-result/v1', project, vault, status, dry_run: !!options.dryRun, steps, context_touched: false };
}
