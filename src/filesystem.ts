import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ObjectValue, check, fail, sha256, strictJson, EXIT, WhyveError, canonicalDigest } from './common';
export interface FileChange {
    path: string;
    content: Buffer | null;
    expected: string | null;
    mode?: number;
}
export interface FilesystemOptions {
    lockTimeoutMs?: number;
}
export function realDirectory(value: string): string {
    try {
        const real = fs.realpathSync(path.resolve(value));
        check(fs.statSync(real).isDirectory(), 'vault_not_found', 'Vault must be a directory.');
        return real;
    }
    catch (e) {
        if (e instanceof WhyveError)
            throw e;
        return fail('vault_not_found', 'Create or select an existing vault directory.', {}, EXIT.notFound);
    }
}
export function identity(root: string): ObjectValue {
    const real = realDirectory(root), s = fs.statSync(real);
    return { schema: 'context-vault-identity/v1', root: { path: real, device: String(s.dev), inode: String(s.ino) } };
}
export function contained(root: string, relative: string): string {
    check(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !relative.includes('\0') && !path.isAbsolute(relative) && !relative.split('/').some(p => !p || p === '.' || p === '..'), 'path_escape', 'Path must be a canonical vault-relative POSIX path.', { path: relative }, EXIT.conflict);
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        try {
            const s = fs.lstatSync(current);
            check(!s.isSymbolicLink(), 'symlink_path', 'Symlink path segments are not writable.', { path: relative }, EXIT.conflict);
        }
        catch (e: any) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    return current;
}
export function bytes(root: string, relative: string, maximum = 16 * 1024 * 1024): Buffer | null {
    const target = contained(root, relative);
    let fd: number;
    try {
        fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    }
    catch (e: any) {
        if (e.code === 'ENOENT')
            return null;
        throw e;
    }
    try {
        const s = fs.fstatSync(fd);
        check(s.isFile() && s.nlink === 1 && s.size <= maximum, 'path_unsafe', 'Expected a regular file (not a link or hard-linked file) within the size limit.', { path: relative }, EXIT.integrity);
        const content = fs.readFileSync(fd);
        check(content.length <= maximum, 'input_too_large', 'File exceeded its size limit.', { path: relative });
        return content;
    }
    finally {
        fs.closeSync(fd);
    }
}
export function utf8(raw: Buffer): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    }
    catch {
        return fail('encoding_invalid', 'Input is not valid UTF-8.', {}, EXIT.integrity);
    }
}
export function readText(root: string, relative: string): string { const raw = bytes(root, relative); check(raw, 'not_found', 'File does not exist.', { path: relative }, EXIT.notFound); return utf8(raw); }
export function syncDirectory(directory: string): void {
    let fd: number | undefined;
    try {
        fd = fs.openSync(directory, fs.constants.O_RDONLY);
        fs.fsyncSync(fd);
    }
    catch (e: any) {
        if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EBADF'].includes(e.code))
            throw e;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
}
function unlinkDurable(root: string, relative: string): void { const target = contained(root, relative); fs.unlinkSync(target); syncDirectory(path.dirname(target)); }
export function atomicWrite(root: string, relative: string, content: Buffer, mode = 0o600): void {
    const target = contained(root, relative), directory = path.dirname(target);
    fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    contained(root, relative);
    const temp = path.join(directory, '.context-' + randomUUID());
    let fd: number | undefined;
    try {
        fd = fs.openSync(temp, 'wx', mode);
        fs.writeFileSync(fd, content);
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = undefined;
        // Recheck the leaf and ancestors after preparing the temporary file.
        contained(root, relative);
        fs.renameSync(temp, target);
        syncDirectory(directory);
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
        try {
            fs.unlinkSync(temp);
        }
        catch (e: any) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
}
export function digestOrNull(root: string, relative: string): string | null { const value = bytes(root, relative); return value === null ? null : sha256(value); }
const JOURNAL = '.whyve-runtime/transaction.json';
/** Recovery reads at most this journal; transaction() refuses anything larger so a crash never locks the vault. */
export const JOURNAL_MAX_ENTRIES = 8192;
export const JOURNAL_MAX_BYTES = 64 * 1024 * 1024;
const JOURNAL_SCHEMA = 'whyve-transaction/v1';
type JournalEntry = {
    path: string;
    before: string | null;
    after: string | null;
    mode: number;
};
type Journal = {
    schema: string;
    identity: ObjectValue;
    entries: JournalEntry[];
    digest: string;
};
// Windows has no POSIX owner/group/other bits: Node reports every writable entry as 0o666/0o777 and uid 0.
// There the per-user %TEMP% and the vault's own ACL carry the privacy, so only the type/symlink checks apply.
const WINDOWS = process.platform === 'win32';
function ownerOnly(s: fs.Stats): boolean {
    return WINDOWS || ((s.mode & 0o077) === 0 && (process.getuid === undefined || s.uid === process.getuid()));
}
/** All readers and writers in this runtime share the same lease. No process.env/cwd mutation. */
export class Filesystem {
    readonly root: string;
    private readonly timeout: number;
    constructor(root: string, options: FilesystemOptions = {}) { this.root = realDirectory(root); this.timeout = options.lockTimeoutMs ?? 10000; check(Number.isSafeInteger(this.timeout) && this.timeout >= 0 && this.timeout <= 60000, 'usage_invalid', 'Lock timeout must be an integer from 0 to 60000 milliseconds.'); }
    private guard(): string {
        const lockRoot = path.join(os.tmpdir(), 'context-core-locks');
        fs.mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
        const s = fs.lstatSync(lockRoot);
        check(s.isDirectory() && !s.isSymbolicLink() && ownerOnly(s), 'lock_unsafe', 'Legacy lock root must be a private directory.', {}, EXIT.conflict);
        const guard = path.join(lockRoot, sha256(this.root).slice(7));
        try {
            fs.mkdirSync(guard, { mode: 0o700 });
        }
        catch (e: any) {
            if (e.code !== 'EEXIST')
                throw e;
            const s = fs.lstatSync(guard);
            check(s.isDirectory() && !s.isSymbolicLink(), 'legacy_runtime_conflict', 'A Python lock file exists. Stop all Python writers, then run runtime adopt --confirm-legacy-stopped (whyve runtime adopt, or context_cli.mjs runtime adopt in the plugin).', { vault: this.root }, EXIT.conflict);
            check(ownerOnly(s), 'lock_unsafe', 'Runtime guard must be private.', {}, EXIT.conflict);
        }
        // At the old fcntl path, a directory makes unmodified Python os.open(O_RDWR) fail.
        const shared = contained(this.root, '.whyve-runtime');
        fs.mkdirSync(shared, { recursive: true, mode: 0o700 });
        const sharedStat = fs.lstatSync(shared);
        check(sharedStat.isDirectory() && !sharedStat.isSymbolicLink() && ownerOnly(sharedStat), 'lock_unsafe', 'Vault runtime directory must be private.', {}, EXIT.conflict);
        return shared;
    }
    adoptLegacy(confirmLegacyStopped: boolean): ObjectValue {
        check(confirmLegacyStopped === true, 'approval_required', 'Stop all Python writers, then rerun runtime adopt with --confirm-legacy-stopped.', {}, EXIT.conflict);
        const lockRoot = path.join(os.tmpdir(), 'context-core-locks');
        fs.mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
        const s = fs.lstatSync(lockRoot);
        check(s.isDirectory() && !s.isSymbolicLink() && ownerOnly(s), 'lock_unsafe', 'Lock root must be private.');
        const guard = path.join(lockRoot, sha256(this.root).slice(7));
        if (fs.existsSync(guard) && !fs.lstatSync(guard).isDirectory()) {
            const s = fs.lstatSync(guard);
            check(s.isFile() && s.nlink === 1 && (WINDOWS || (s.mode & 0o022) === 0), 'lock_unsafe', 'Legacy lock must be a safe regular file.');
            fs.renameSync(guard, guard + '.python-stopped-' + randomUUID());
        }
        this.guard();
        return { adopted: true, vault: this.root, protocol: 'exclusive-node-writer/v1', records_changed: false };
    }
    async recoverAbandoned(): Promise<ObjectValue> {
        const guard = this.guard(), gate = path.join(guard, 'recovery'), lock = path.join(guard, 'writer');
        try {
            fs.mkdirSync(gate, { mode: 0o700 });
        }
        catch (e: any) {
            if (e.code === 'EEXIST')
                fail('recovery_busy', 'Another recovery is in progress.', {}, EXIT.conflict);
            throw e;
        }
        try {
            if (fs.existsSync(lock)) {
                const owner = strictJson(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
                check(owner.host === os.hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0, 'lock_unsafe', 'Cannot prove the abandoned owner is a local process.', {}, EXIT.conflict);
                let dead = false;
                try {
                    process.kill(owner.pid, 0);
                }
                catch (e: any) {
                    dead = e.code === 'ESRCH';
                }
                check(dead, 'lock_busy', 'The recorded writer process is still alive; recovery is refused.', {}, EXIT.conflict);
                fs.unlinkSync(path.join(lock, 'owner.json'));
                fs.rmdirSync(lock);
            }
        }
        finally {
            fs.rmdirSync(gate);
        }
        return this.locked(() => ({ recovered: true, vault: this.root }));
    }
    async locked<T>(fn: () => T | Promise<T>): Promise<T> {
        const guard = this.guard(), lock = path.join(guard, 'writer'), token = randomUUID(), start = Date.now();
        while (true) {
            if (fs.existsSync(path.join(guard, 'recovery'))) {
                check(Date.now() - start < this.timeout, 'lock_timeout', 'Timed out waiting for runtime recovery to finish.', {}, EXIT.conflict);
                await delay(15);
                continue;
            }
            try {
                fs.mkdirSync(lock, { mode: 0o700 });
                try {
                    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, host: os.hostname(), token }), { flag: 'wx', mode: 0o600 });
                }
                catch (e) {
                    fs.rmdirSync(lock);
                    throw e;
                }
                break;
            }
            catch (e: any) {
                if (e.code !== 'EEXIST')
                    throw e;
                // No elapsed-time lease stealing: a paused or busy live process keeps ownership.
                let stat: fs.Stats;
                try {
                    stat = fs.lstatSync(lock);
                }
                catch (error: any) {
                    if (error.code === 'ENOENT')
                        continue;
                    throw error;
                }
                check(stat.isDirectory() && !stat.isSymbolicLink(), 'lock_unsafe', 'Writer lease is not a directory.');
                let owner: ObjectValue | undefined;
                try {
                    owner = strictJson(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
                }
                catch { /* An owner may still be initializing. */ }
                if (owner && owner.host === os.hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
                    let dead = false;
                    try {
                        process.kill(owner.pid, 0);
                    }
                    catch (error: any) {
                        dead = error.code === 'ESRCH';
                    }
                    if (dead)
                        fail('lock_owner_dead', 'A writer exited without releasing its lease. Run runtime recover (whyve runtime recover, or context_cli.mjs runtime recover in the plugin) to confirm the writer is gone and roll back its journal.', { vault: this.root, pid: owner.pid }, EXIT.conflict);
                }
                check(Date.now() - start < this.timeout, 'lock_timeout', 'Timed out waiting for another Whyve writer to release the vault lock.', { vault: this.root }, EXIT.conflict);
                await delay(15);
            }
        }
        try {
            this.recover();
            return await fn();
        }
        finally {
            const owner = strictJson(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
            check(owner.token === token, 'lock_lost', 'Writer lease ownership changed.', {}, EXIT.integrity);
            fs.unlinkSync(path.join(lock, 'owner.json'));
            fs.rmdirSync(lock);
        }
    }
    private restore(entries: JournalEntry[]): void {
        for (const item of [...entries].reverse()) {
            const actual = bytes(this.root, item.path), current = actual === null ? null : actual.toString('base64');
            check(current === item.before || current === item.after, 'recovery_conflict', 'A file changed outside the interrupted transaction.', { path: item.path }, EXIT.integrity);
            if (item.before === null) {
                if (actual !== null)
                    unlinkDurable(this.root, item.path);
            }
            else
                atomicWrite(this.root, item.path, Buffer.from(item.before, 'base64'), item.mode);
        }
    }
    private cleanupTemps(entries: JournalEntry[]): void {
        for (const directory of new Set(entries.map(item => path.posix.dirname(item.path)))) {
            const absolute = directory === '.' ? this.root : contained(this.root, directory);
            if (!fs.existsSync(absolute))
                continue;
            const known = new Set(entries.filter(item => path.posix.dirname(item.path) === directory).flatMap(item => [item.before, item.after]).filter(x => x !== null));
            for (const name of fs.readdirSync(absolute))
                if (/^\.context-[0-9a-f-]{36}$/.test(name)) {
                    const relative = directory === '.' ? name : directory + '/' + name, raw = bytes(this.root, relative);
                    if (raw && known.has(raw.toString('base64')))
                        unlinkDurable(this.root, relative);
                }
        }
    }
    recover(): void {
        const raw = bytes(this.root, JOURNAL, JOURNAL_MAX_BYTES);
        if (!raw)
            return;
        const journal = strictJson(utf8(raw)) as Journal;
        check(journal.schema === JOURNAL_SCHEMA && canonicalDigest(journal.identity) === canonicalDigest(identity(this.root)) && Array.isArray(journal.entries) && journal.entries.length <= JOURNAL_MAX_ENTRIES, 'journal_invalid', 'Transaction journal identity or structure is invalid.', {}, EXIT.integrity);
        check(journal.digest === canonicalDigest({ schema: journal.schema, identity: journal.identity, entries: journal.entries }), 'journal_invalid', 'Transaction journal digest differs.', {}, EXIT.integrity);
        check(new Set(journal.entries.map(i => i.path)).size === journal.entries.length, 'journal_invalid', 'Journal contains duplicate paths.');
        for (const item of journal.entries) {
            check(typeof item.path === 'string' && item.path !== JOURNAL && !item.path.startsWith('.whyve-runtime/'), 'journal_invalid', 'Journal cannot mutate runtime state.');
            contained(this.root, item.path);
            check(Number.isSafeInteger(item.mode) && item.mode >= 0 && item.mode <= 0o777 && [item.before, item.after].every(v => v === null || (typeof v === 'string' && Buffer.from(v, 'base64').toString('base64') === v)), 'journal_invalid', 'Journal bytes or permissions are invalid.');
        }
        this.restore(journal.entries);
        this.cleanupTemps(journal.entries);
        fs.unlinkSync(contained(this.root, JOURNAL));
        syncDirectory(path.join(this.root, '.whyve-runtime'));
    }
    /** Caller must hold locked(). The disk journal survives process termination. */
    transaction(changes: FileChange[]): string[] {
        check(!fs.existsSync(contained(this.root, JOURNAL)), 'recovery_required', 'Pending transaction must be recovered.', {}, EXIT.integrity);
        check(new Set(changes.map(x => x.path)).size === changes.length, 'plan_invalid', 'A transaction cannot write a path twice.');
        const entries: JournalEntry[] = [];
        for (const change of changes) {
            check(change.path !== JOURNAL && !change.path.startsWith('.whyve-runtime/'), 'path_escape', 'Runtime files cannot be operation targets.');
            const before = bytes(this.root, change.path);
            check((before === null ? null : sha256(before)) === change.expected, 'stale_input', 'Target content changed after preview.', { path: change.path }, EXIT.conflict);
            if (before?.equals(change.content ?? Buffer.alloc(0)) && change.content !== null)
                continue;
            entries.push({ path: change.path, before: before === null ? null : before.toString('base64'), after: change.content === null ? null : change.content.toString('base64'), mode: before === null ? change.mode ?? 0o600 : fs.statSync(contained(this.root, change.path)).mode & 0o777 });
        }
        if (!entries.length)
            return [];
        const base = { schema: JOURNAL_SCHEMA, identity: identity(this.root), entries };
        const journal = Buffer.from(JSON.stringify({ ...base, digest: canonicalDigest(base) }) + '\n');
        check(entries.length <= JOURNAL_MAX_ENTRIES && journal.length <= JOURNAL_MAX_BYTES, 'transaction_too_large', 'The transaction exceeds what crash recovery can read back; split it.', { entries: entries.length, bytes: journal.length }, EXIT.conflict);
        atomicWrite(this.root, JOURNAL, journal);
        let committed = false;
        try {
            for (const item of entries) {
                if (item.after === null) {
                    if (item.before !== null)
                        unlinkDurable(this.root, item.path);
                }
                else
                    atomicWrite(this.root, item.path, Buffer.from(item.after, 'base64'), item.mode);
            }
            fs.unlinkSync(contained(this.root, JOURNAL));
            committed = true;
            syncDirectory(path.join(this.root, '.whyve-runtime'));
        }
        catch (e) {
            // Once the journal is removed, all record and index writes have completed.
            // Rolling back now would destroy the only crash-recovery evidence.
            if (committed)
                fail('commit_sync_failed', 'All changes were applied, but the final directory flush failed. Verify the stored result before retrying.', { applied: true, changed_paths: entries.map(x => x.path).sort(), cause: String(e) }, EXIT.integrity);
            try {
                this.restore(entries);
                fs.unlinkSync(contained(this.root, JOURNAL));
            }
            catch (recovery) {
                fail('recovery_required', 'Write failed and rollback could not finish; preserve the journal and retry after resolving the filesystem error.', { cause: String(e), recovery: String(recovery) }, EXIT.integrity);
            }
            try {
                syncDirectory(path.join(this.root, '.whyve-runtime'));
            }
            catch (flush) {
                fail('rollback_sync_failed', 'Previous bytes were restored, but the final directory flush failed. Verify the stored result before retrying.', { applied: false, rollback_applied: true, cause: String(e), flush: String(flush) }, EXIT.integrity);
            }
            throw e;
        }
        return entries.map(x => x.path).sort();
    }
}
