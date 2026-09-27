export declare const REGEX_UNSUPPORTED: string[];
export interface CompiledRegex {
    test(value: string): boolean;
}
export declare function compileRegex(pattern: string, flags?: string): CompiledRegex;
