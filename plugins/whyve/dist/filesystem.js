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
exports.Filesystem = exports.JOURNAL_MAX_BYTES = exports.JOURNAL_MAX_ENTRIES = void 0;
exports.realDirectory = realDirectory;
exports.identity = identity;
exports.contained = contained;
exports.bytes = bytes;
exports.utf8 = utf8;
exports.readText = readText;
exports.syncDirectory = syncDirectory;
exports.atomicWrite = atomicWrite;
exports.digestOrNull = digestOrNull;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const os = __importStar(require("node:os"));
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:timers/promises");
const common_1 = require("./common");
function realDirectory(value) {
    try {
        const real = fs.realpathSync(path.resolve(value));
        (0, common_1.check)(fs.statSync(real).isDirectory(), 'vault_not_found', 'Vault must be a directory.');
        return real;
    }
    catch (e) {
        if (e instanceof common_1.WhyveError)
            throw e;
        return (0, common_1.fail)('vault_not_found', 'Create or select an existing vault directory.', {}, common_1.EXIT.notFound);
    }
}
function identity(root) {
    const real = realDirectory(root), s = fs.statSync(real);
    return { schema: 'context-vault-identity/v1', root: { path: real, device: String(s.dev), inode: String(s.ino) } };
}
function contained(root, relative) {
    (0, common_1.check)(typeof relative === 'string' && relative.length > 0 && !relative.includes('\\') && !relative.includes('\0') && !path.isAbsolute(relative) && !relative.split('/').some(p => !p || p === '.' || p === '..'), 'path_escape', 'Path must be a canonical vault-relative POSIX path.', { path: relative }, common_1.EXIT.conflict);
    let current = root;
    for (const part of relative.split('/')) {
        current = path.join(current, part);
        try {
            const s = fs.lstatSync(current);
            (0, common_1.check)(!s.isSymbolicLink(), 'symlink_path', 'Symlink path segments are not writable.', { path: relative }, common_1.EXIT.conflict);
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    return current;
}
function bytes(root, relative, maximum = 16 * 1024 * 1024) {
    const target = contained(root, relative);
    let fd;
    try {
        fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return null;
        throw e;
    }
    try {
        const s = fs.fstatSync(fd);
        (0, common_1.check)(s.isFile() && s.nlink === 1 && s.size <= maximum, 'path_unsafe', 'Expected a regular file (not a link or hard-linked file) within the size limit.', { path: relative }, common_1.EXIT.integrity);
        const content = fs.readFileSync(fd);
        (0, common_1.check)(content.length <= maximum, 'input_too_large', 'File exceeded its size limit.', { path: relative });
        return content;
    }
    finally {
        fs.closeSync(fd);
    }
}
function utf8(raw) {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(raw);
    }
    catch {
        return (0, common_1.fail)('encoding_invalid', 'Input is not valid UTF-8.', {}, common_1.EXIT.integrity);
    }
}
function readText(root, relative) { const raw = bytes(root, relative); (0, common_1.check)(raw, 'not_found', 'File does not exist.', { path: relative }, common_1.EXIT.notFound); return utf8(raw); }
function syncDirectory(directory) {
    let fd;
    try {
        fd = fs.openSync(directory, fs.constants.O_RDONLY);
        fs.fsyncSync(fd);
    }
    catch (e) {
        if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EBADF'].includes(e.code))
            throw e;
    }
    finally {
        if (fd !== undefined)
            fs.closeSync(fd);
    }
}
function unlinkDurable(root, relative) { const target = contained(root, relative); fs.unlinkSync(target); syncDirectory(path.dirname(target)); }
function atomicWrite(root, relative, content, mode = 0o600) {
    const target = contained(root, relative), directory = path.dirname(target);
    fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
    contained(root, relative);
    const temp = path.join(directory, '.context-' + (0, node_crypto_1.randomUUID)());
    let fd;
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
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
}
function digestOrNull(root, relative) { const value = bytes(root, relative); return value === null ? null : (0, common_1.sha256)(value); }
const JOURNAL = '.whyve-runtime/transaction.json';
/** Recovery reads at most this journal; transaction() refuses anything larger so a crash never locks the vault. */
exports.JOURNAL_MAX_ENTRIES = 8192;
exports.JOURNAL_MAX_BYTES = 64 * 1024 * 1024;
const JOURNAL_SCHEMA = 'whyve-transaction/v1';
// Windows has no POSIX owner/group/other bits: Node reports every writable entry as 0o666/0o777 and uid 0.
// There the per-user %TEMP% and the vault's own ACL carry the privacy, so only the type/symlink checks apply.
const WINDOWS = process.platform === 'win32';
function ownerOnly(s) {
    return WINDOWS || ((s.mode & 0o077) === 0 && (process.getuid === undefined || s.uid === process.getuid()));
}
/** All readers and writers in this runtime share the same lease. No process.env/cwd mutation. */
class Filesystem {
    root;
    timeout;
    constructor(root, options = {}) { this.root = realDirectory(root); this.timeout = options.lockTimeoutMs ?? 10000; (0, common_1.check)(Number.isSafeInteger(this.timeout) && this.timeout >= 0 && this.timeout <= 60000, 'usage_invalid', 'Lock timeout must be an integer from 0 to 60000 milliseconds.'); }
    guard() {
        const lockRoot = path.join(os.tmpdir(), 'context-core-locks');
        fs.mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
        const s = fs.lstatSync(lockRoot);
        (0, common_1.check)(s.isDirectory() && !s.isSymbolicLink() && ownerOnly(s), 'lock_unsafe', 'Legacy lock root must be a private directory.', {}, common_1.EXIT.conflict);
        const guard = path.join(lockRoot, (0, common_1.sha256)(this.root).slice(7));
        try {
            fs.mkdirSync(guard, { mode: 0o700 });
        }
        catch (e) {
            if (e.code !== 'EEXIST')
                throw e;
            const s = fs.lstatSync(guard);
            (0, common_1.check)(s.isDirectory() && !s.isSymbolicLink(), 'legacy_runtime_conflict', 'A Python lock file exists. Stop all Python writers, then run runtime adopt --confirm-legacy-stopped (whyve runtime adopt, or context_cli.mjs runtime adopt in the plugin).', { vault: this.root }, common_1.EXIT.conflict);
            (0, common_1.check)(ownerOnly(s), 'lock_unsafe', 'Runtime guard must be private.', {}, common_1.EXIT.conflict);
        }
        // At the old fcntl path, a directory makes unmodified Python os.open(O_RDWR) fail.
        const shared = contained(this.root, '.whyve-runtime');
        fs.mkdirSync(shared, { recursive: true, mode: 0o700 });
        const sharedStat = fs.lstatSync(shared);
        (0, common_1.check)(sharedStat.isDirectory() && !sharedStat.isSymbolicLink() && ownerOnly(sharedStat), 'lock_unsafe', 'Vault runtime directory must be private.', {}, common_1.EXIT.conflict);
        return shared;
    }
    adoptLegacy(confirmLegacyStopped) {
        (0, common_1.check)(confirmLegacyStopped === true, 'approval_required', 'Stop all Python writers, then rerun runtime adopt with --confirm-legacy-stopped.', {}, common_1.EXIT.conflict);
        const lockRoot = path.join(os.tmpdir(), 'context-core-locks');
        fs.mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
        const s = fs.lstatSync(lockRoot);
        (0, common_1.check)(s.isDirectory() && !s.isSymbolicLink() && ownerOnly(s), 'lock_unsafe', 'Lock root must be private.');
        const guard = path.join(lockRoot, (0, common_1.sha256)(this.root).slice(7));
        if (fs.existsSync(guard) && !fs.lstatSync(guard).isDirectory()) {
            const s = fs.lstatSync(guard);
            (0, common_1.check)(s.isFile() && s.nlink === 1 && (WINDOWS || (s.mode & 0o022) === 0), 'lock_unsafe', 'Legacy lock must be a safe regular file.');
            fs.renameSync(guard, guard + '.python-stopped-' + (0, node_crypto_1.randomUUID)());
        }
        this.guard();
        return { adopted: true, vault: this.root, protocol: 'exclusive-node-writer/v1', records_changed: false };
    }
    async recoverAbandoned() {
        const guard = this.guard(), gate = path.join(guard, 'recovery'), lock = path.join(guard, 'writer');
        try {
            fs.mkdirSync(gate, { mode: 0o700 });
        }
        catch (e) {
            if (e.code === 'EEXIST')
                (0, common_1.fail)('recovery_busy', 'Another recovery is in progress.', {}, common_1.EXIT.conflict);
            throw e;
        }
        try {
            if (fs.existsSync(lock)) {
                const owner = (0, common_1.strictJson)(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
                (0, common_1.check)(owner.host === os.hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0, 'lock_unsafe', 'Cannot prove the abandoned owner is a local process.', {}, common_1.EXIT.conflict);
                let dead = false;
                try {
                    process.kill(owner.pid, 0);
                }
                catch (e) {
                    dead = e.code === 'ESRCH';
                }
                (0, common_1.check)(dead, 'lock_busy', 'The recorded writer process is still alive; recovery is refused.', {}, common_1.EXIT.conflict);
                fs.unlinkSync(path.join(lock, 'owner.json'));
                fs.rmdirSync(lock);
            }
        }
        finally {
            fs.rmdirSync(gate);
        }
        return this.locked(() => ({ recovered: true, vault: this.root }));
    }
    async locked(fn) {
        const guard = this.guard(), lock = path.join(guard, 'writer'), token = (0, node_crypto_1.randomUUID)(), start = Date.now();
        while (true) {
            if (fs.existsSync(path.join(guard, 'recovery'))) {
                (0, common_1.check)(Date.now() - start < this.timeout, 'lock_timeout', 'Timed out waiting for runtime recovery to finish.', {}, common_1.EXIT.conflict);
                await (0, promises_1.setTimeout)(15);
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
            catch (e) {
                if (e.code !== 'EEXIST')
                    throw e;
                // No elapsed-time lease stealing: a paused or busy live process keeps ownership.
                let stat;
                try {
                    stat = fs.lstatSync(lock);
                }
                catch (error) {
                    if (error.code === 'ENOENT')
                        continue;
                    throw error;
                }
                (0, common_1.check)(stat.isDirectory() && !stat.isSymbolicLink(), 'lock_unsafe', 'Writer lease is not a directory.');
                let owner;
                try {
                    owner = (0, common_1.strictJson)(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
                }
                catch { /* An owner may still be initializing. */ }
                if (owner && owner.host === os.hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
                    let dead = false;
                    try {
                        process.kill(owner.pid, 0);
                    }
                    catch (error) {
                        dead = error.code === 'ESRCH';
                    }
                    if (dead)
                        (0, common_1.fail)('lock_owner_dead', 'A writer exited without releasing its lease. Run runtime recover (whyve runtime recover, or context_cli.mjs runtime recover in the plugin) to confirm the writer is gone and roll back its journal.', { vault: this.root, pid: owner.pid }, common_1.EXIT.conflict);
                }
                (0, common_1.check)(Date.now() - start < this.timeout, 'lock_timeout', 'Timed out waiting for another Whyve writer to release the vault lock.', { vault: this.root }, common_1.EXIT.conflict);
                await (0, promises_1.setTimeout)(15);
            }
        }
        try {
            this.recover();
            return await fn();
        }
        finally {
            const owner = (0, common_1.strictJson)(fs.readFileSync(path.join(lock, 'owner.json'), 'utf8'));
            (0, common_1.check)(owner.token === token, 'lock_lost', 'Writer lease ownership changed.', {}, common_1.EXIT.integrity);
            fs.unlinkSync(path.join(lock, 'owner.json'));
            fs.rmdirSync(lock);
        }
    }
    restore(entries) {
        for (const item of [...entries].reverse()) {
            const actual = bytes(this.root, item.path), current = actual === null ? null : actual.toString('base64');
            (0, common_1.check)(current === item.before || current === item.after, 'recovery_conflict', 'A file changed outside the interrupted transaction.', { path: item.path }, common_1.EXIT.integrity);
            if (item.before === null) {
                if (actual !== null)
                    unlinkDurable(this.root, item.path);
            }
            else
                atomicWrite(this.root, item.path, Buffer.from(item.before, 'base64'), item.mode);
        }
    }
    cleanupTemps(entries) {
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
    recover() {
        const raw = bytes(this.root, JOURNAL, exports.JOURNAL_MAX_BYTES);
        if (!raw)
            return;
        const journal = (0, common_1.strictJson)(utf8(raw));
        (0, common_1.check)(journal.schema === JOURNAL_SCHEMA && (0, common_1.canonicalDigest)(journal.identity) === (0, common_1.canonicalDigest)(identity(this.root)) && Array.isArray(journal.entries) && journal.entries.length <= exports.JOURNAL_MAX_ENTRIES, 'journal_invalid', 'Transaction journal identity or structure is invalid.', {}, common_1.EXIT.integrity);
        (0, common_1.check)(journal.digest === (0, common_1.canonicalDigest)({ schema: journal.schema, identity: journal.identity, entries: journal.entries }), 'journal_invalid', 'Transaction journal digest differs.', {}, common_1.EXIT.integrity);
        (0, common_1.check)(new Set(journal.entries.map(i => i.path)).size === journal.entries.length, 'journal_invalid', 'Journal contains duplicate paths.');
        for (const item of journal.entries) {
            (0, common_1.check)(typeof item.path === 'string' && item.path !== JOURNAL && !item.path.startsWith('.whyve-runtime/'), 'journal_invalid', 'Journal cannot mutate runtime state.');
            contained(this.root, item.path);
            (0, common_1.check)(Number.isSafeInteger(item.mode) && item.mode >= 0 && item.mode <= 0o777 && [item.before, item.after].every(v => v === null || (typeof v === 'string' && Buffer.from(v, 'base64').toString('base64') === v)), 'journal_invalid', 'Journal bytes or permissions are invalid.');
        }
        this.restore(journal.entries);
        this.cleanupTemps(journal.entries);
        fs.unlinkSync(contained(this.root, JOURNAL));
        syncDirectory(path.join(this.root, '.whyve-runtime'));
    }
    /** Caller must hold locked(). The disk journal survives process termination. */
    transaction(changes) {
        (0, common_1.check)(!fs.existsSync(contained(this.root, JOURNAL)), 'recovery_required', 'Pending transaction must be recovered.', {}, common_1.EXIT.integrity);
        (0, common_1.check)(new Set(changes.map(x => x.path)).size === changes.length, 'plan_invalid', 'A transaction cannot write a path twice.');
        const entries = [];
        for (const change of changes) {
            (0, common_1.check)(change.path !== JOURNAL && !change.path.startsWith('.whyve-runtime/'), 'path_escape', 'Runtime files cannot be operation targets.');
            const before = bytes(this.root, change.path);
            (0, common_1.check)((before === null ? null : (0, common_1.sha256)(before)) === change.expected, 'stale_input', 'Target content changed after preview.', { path: change.path }, common_1.EXIT.conflict);
            if (before?.equals(change.content ?? Buffer.alloc(0)) && change.content !== null)
                continue;
            entries.push({ path: change.path, before: before === null ? null : before.toString('base64'), after: change.content === null ? null : change.content.toString('base64'), mode: before === null ? change.mode ?? 0o600 : fs.statSync(contained(this.root, change.path)).mode & 0o777 });
        }
        if (!entries.length)
            return [];
        const base = { schema: JOURNAL_SCHEMA, identity: identity(this.root), entries };
        const journal = Buffer.from(JSON.stringify({ ...base, digest: (0, common_1.canonicalDigest)(base) }) + '\n');
        (0, common_1.check)(entries.length <= exports.JOURNAL_MAX_ENTRIES && journal.length <= exports.JOURNAL_MAX_BYTES, 'transaction_too_large', 'The transaction exceeds what crash recovery can read back; split it.', { entries: entries.length, bytes: journal.length }, common_1.EXIT.conflict);
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
                (0, common_1.fail)('commit_sync_failed', 'All changes were applied, but the final directory flush failed. Verify the stored result before retrying.', { applied: true, changed_paths: entries.map(x => x.path).sort(), cause: String(e) }, common_1.EXIT.integrity);
            try {
                this.restore(entries);
                fs.unlinkSync(contained(this.root, JOURNAL));
            }
            catch (recovery) {
                (0, common_1.fail)('recovery_required', 'Write failed and rollback could not finish; preserve the journal and retry after resolving the filesystem error.', { cause: String(e), recovery: String(recovery) }, common_1.EXIT.integrity);
            }
            try {
                syncDirectory(path.join(this.root, '.whyve-runtime'));
            }
            catch (flush) {
                (0, common_1.fail)('rollback_sync_failed', 'Previous bytes were restored, but the final directory flush failed. Verify the stored result before retrying.', { applied: false, rollback_applied: true, cause: String(e), flush: String(flush) }, common_1.EXIT.integrity);
            }
            throw e;
        }
        return entries.map(x => x.path).sort();
    }
}
exports.Filesystem = Filesystem;
