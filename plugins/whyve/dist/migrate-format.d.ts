import { ObjectValue } from './common';
import { RefHeaderPreset } from './legacy';
/**
 * Explicit context-common/v2 → v3 conversion of one vault (design section 10).
 * Dry-run freezes a plan (every before/after byte); apply re-checks it under the vault lock, backs up
 * the originals outside the vault, writes one journaled transaction and verifies the result.
 */
export interface MigrateFormatOptions {
    vault?: string;
    planDir: string;
    dryRun?: boolean;
    applyPlan?: string;
    rollbackPlan?: string;
    refHeaders?: RefHeaderPreset;
    lockTimeoutMs?: number;
}
export declare function migrateFormat(project: string, options: MigrateFormatOptions): Promise<ObjectValue>;
