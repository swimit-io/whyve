import * as fs from 'node:fs';
import * as path from 'node:path';
import { canonicalDigest, sha256 } from './common';
// Bind approval to the implementation loaded by this process, not a global installation.
export const runtimeDigest = canonicalDigest(fs.readdirSync(__dirname).filter(name => /\.(js|json)$/.test(name)).sort().map(name => ({ name, sha256: sha256(fs.readFileSync(path.join(__dirname, name))) })));
