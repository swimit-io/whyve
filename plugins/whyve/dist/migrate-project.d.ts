import { ObjectValue } from './common';
/** Plan or apply `.bobbin` → `.whyve` for one project. Never reads or writes `context/`. */
export declare function migrateProject(target: string, options?: {
    dryRun?: boolean;
    now?: Date;
}): ObjectValue;
