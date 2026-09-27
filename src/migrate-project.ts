import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ObjectValue, check, contracts, strictJson, EXIT } from './common';
import { atomicWrite, realDirectory } from './filesystem';

// One-time conversion of a Bobbin 2.x project to Whyve. The legacy names below are
// the conversion input, so this file (and its test) is the only place they remain.
const LEGACY = { config: '.bobbin', runtime: '.bobbin-runtime', schema: 'bobbin-project/v1' };
const CURRENT = { config: '.whyve', runtime: '.whyve-runtime', schema: 'whyve-project/v1' };
const BEGIN = '<!-- BEGIN context-core-policy (managed by context-core) -->';
const END = '<!-- END context-core-policy (managed by context-core) -->';

type Step = { action: string; path: string; detail?: string };

function exists(p: string): boolean { try { fs.lstatSync(p); return true; } catch { return false; } }
function text(p: string): string | null { return exists(p) ? fs.readFileSync(p, 'utf8') : null; }
function mode(p: string): number { return fs.statSync(p).mode & 0o777; }

function tracked(project: string, relative: string): boolean {
    const result = spawnSync('git', ['-C', project, 'ls-files', '--error-unmatch', relative], { stdio: 'ignore' });
    return result.status === 0;
}

function policyUpdate(original: string): string | null {
    if (!original.includes(BEGIN) && !original.includes(END))
        return null;
    check(original.includes(BEGIN) && original.includes(END) && original.split(BEGIN).length === 2 && original.split(END).length === 2, 'policy_invalid', 'Managed guidance markers are malformed.');
    const updated = original.slice(0, original.indexOf(BEGIN)) + contracts.policy + original.slice(original.indexOf(END) + END.length);
    return updated === original ? null : updated;
}

function gitignoreUpdate(original: string): string | null {
    const updated = original.split('\n').map(line => /^\/?\.bobbin-runtime\/?$/.test(line) ? line.replace(LEGACY.runtime, CURRENT.runtime) : line).join('\n');
    return updated === original ? null : updated;
}

/** Plan or apply `.bobbin` → `.whyve` for one project. Never reads or writes `context/`. */
export function migrateProject(target: string, options: { dryRun?: boolean; now?: Date } = {}): ObjectValue {
    const project = realDirectory(target);
    const legacyDir = path.join(project, LEGACY.config), currentDir = path.join(project, CURRENT.config);
    const hasLegacy = exists(legacyDir), hasCurrent = exists(currentDir);
    check(!(hasLegacy && hasCurrent), 'migration_conflict', `Both ${LEGACY.config} and ${CURRENT.config} exist; resolve one manually.`, { project }, EXIT.conflict);
    check(hasLegacy || hasCurrent, 'config_missing', `No ${LEGACY.config} or ${CURRENT.config} directory to migrate.`, { project }, EXIT.notFound);
    const configPath = path.join(hasLegacy ? legacyDir : currentDir, 'config.json');
    const raw = text(configPath);
    check(raw !== null, 'config_missing', 'Project configuration file is missing.', { path: configPath }, EXIT.notFound);
    const config = strictJson(raw!, 'config_invalid');
    check(config.schema === LEGACY.schema || config.schema === CURRENT.schema, 'config_invalid', 'Unknown project configuration schema.', { schema: config.schema });
    check(typeof config.vault === 'string' && !!config.vault, 'config_invalid', 'Project configuration has no vault.');
    const vault = path.resolve(project, config.vault);
    for (const root of new Set([project, vault]))
        check(!exists(path.join(root, LEGACY.runtime, 'transaction.json')), 'transaction_pending', 'An interrupted transaction journal exists. Recover it with the previous runtime before migrating.', { root }, EXIT.conflict);

    const steps: Step[] = [];
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
        check(fs.lstatSync(dir).isDirectory() && fs.readdirSync(dir).length === 0, 'runtime_not_empty', 'Legacy runtime directory is not empty. Stop every writer and inspect it before migrating.', { path: dir }, EXIT.conflict);
        steps.push({ action: 'remove', path: path.relative(project, dir) || '.', detail: 'empty legacy runtime directory' });
    }
    const edits: [string, string][] = [];
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
            atomicWrite(project, `${CURRENT.config}/config.json`, Buffer.from(newConfig), mode(path.join(currentDir, 'config.json')));
        for (const dir of runtimes)
            fs.rmdirSync(dir);
        for (const [name, content] of edits)
            atomicWrite(project, name, Buffer.from(content), mode(path.join(project, name)));
    }
    return { schema: 'whyve-migrate-project-result/v1', project, vault, status, dry_run: !!options.dryRun, steps, context_touched: false };
}

