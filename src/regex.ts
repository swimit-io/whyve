import { check } from './common';
/**
 * Linear-time search for header values: a small RE2-style subset compiled to an NFA and simulated
 * with state sets, so no pattern can backtrack exponentially. Supported: literals, `.`, classes
 * `[...]`/`[^...]` with ranges, `\d \w \s \D \W \S`, escapes, `^ $`, groups `( )`/`(?: )`,
 * alternation, `* + ?` and `{m}`, `{m,}`, `{m,n}` (lazy forms match the same set). Flag `i` only.
 * Lookaround, backreferences and named groups are rejected as input errors.
 */
type Pred = (c: string) => boolean;
type Node =
    | { t: 'char'; p: Pred } | { t: 'bol' } | { t: 'eol' } | { t: 'empty' }
    | { t: 'cat'; a: Node[] } | { t: 'alt'; a: Node[] } | { t: 'rep'; n: Node; min: number; max: number };
type State = { t: 'char'; p: Pred; next: number } | { t: 'split'; next: number; alt: number } | { t: 'bol' | 'eol' | 'jump'; next: number } | { t: 'match' };

export const REGEX_UNSUPPORTED = ['lookahead (?=', 'negative lookahead (?!', 'lookbehind (?<=', 'named group (?<name>', 'backreference \\1'];
const MAX_REPEAT = 100, MAX_STATES = 20000;
const invalid = (message: string): never => { throw Object.assign(new Error(message), { regexInvalid: true }); };
const WORD = (c: string) => /[A-Za-z0-9_]/.test(c), DIGIT = (c: string) => c >= '0' && c <= '9', SPACE = (c: string) => /\s/.test(c);

function parse(pattern: string, fold: boolean): Node {
    const chars = [...pattern];
    let i = 0;
    const peek = () => chars[i], eat = () => chars[i++];
    const lit = (c: string): Pred => fold ? (x => x.toLowerCase() === c.toLowerCase()) : (x => x === c);
    function escape(inClass: boolean): Pred | string {
        const c = eat();
        if (c === undefined) invalid('Pattern ends with a backslash.');
        if (/[1-9]/.test(c)) invalid('Backreferences are not supported.');
        switch (c) {
            case 'd': return DIGIT; case 'D': return x => !DIGIT(x);
            case 'w': return WORD; case 'W': return x => !WORD(x);
            case 's': return SPACE; case 'S': return x => !SPACE(x);
            case 't': return '\t'; case 'n': return '\n'; case 'r': return '\r';
            case 'b': case 'B': if (!inClass) invalid('Word boundaries are not supported.'); return '\b';
        }
        if (/[A-Za-z0-9]/.test(c)) invalid(`Unsupported escape \\${c}.`);
        return c;
    }
    function klass(): Pred {
        const negate = peek() === '^' && !!eat();
        const parts: Pred[] = [];
        let first = true;
        while (peek() !== ']' || first) {
            first = false;
            let c = eat();
            if (c === undefined) invalid('Unterminated character class.');
            let item: Pred | string = c === '\\' ? escape(true) : c;
            if (typeof item === 'string' && peek() === '-' && chars[i + 1] !== undefined && chars[i + 1] !== ']') {
                eat();
                let end: Pred | string = eat() === '\\' ? escape(true) : chars[i - 1];
                if (typeof end !== 'string') invalid('Invalid class range.');
                const lo = item.codePointAt(0)!, hi = (end as string).codePointAt(0)!;
                if (lo > hi) invalid('Class range is out of order.');
                parts.push(x => { const cps = fold ? [x.toLowerCase(), x.toUpperCase()] : [x]; return cps.some(y => y.codePointAt(0)! >= lo && y.codePointAt(0)! <= hi); });
                continue;
            }
            parts.push(typeof item === 'string' ? lit(item) : item);
        }
        eat();
        return x => parts.some(p => p(x)) !== negate;
    }
    function atom(): Node {
        const c = eat();
        if (c === '(') {
            if (peek() === '?') {
                eat();
                const kind = eat();
                if (kind !== ':') invalid(kind === '=' || kind === '!' ? 'Lookahead is not supported.' : kind === '<' ? 'Lookbehind and named groups are not supported.' : 'Unsupported group.');
            }
            const inner = alternation();
            if (eat() !== ')') invalid('Unbalanced parenthesis.');
            return inner;
        }
        if (c === '[') return { t: 'char', p: klass() };
        if (c === '.') return { t: 'char', p: x => x !== '\n' };
        if (c === '^') return { t: 'bol' };
        if (c === '$') return { t: 'eol' };
        if (c === '\\') { const e = escape(false); return { t: 'char', p: typeof e === 'string' ? lit(e) : e }; }
        if (c === ')' || c === '*' || c === '+' || c === '?' || c === '{') invalid(`Unexpected ${c}.`);
        return { t: 'char', p: lit(c) };
    }
    function repeat(n: Node): Node {
        for (;;) {
            let min: number, max: number;
            const c = peek();
            if (c === '*') { eat(); min = 0; max = Infinity; }
            else if (c === '+') { eat(); min = 1; max = Infinity; }
            else if (c === '?') { eat(); min = 0; max = 1; }
            else if (c === '{') {
                const m = /^\{(\d+)(?:(,)(\d*))?\}/.exec(chars.slice(i).join(''));
                if (!m) invalid('Invalid counted repetition.');
                i += [...m![0]].length;
                min = Number(m![1]); max = m![2] ? (m![3] ? Number(m![3]) : Infinity) : min;
                if (min > MAX_REPEAT || (max !== Infinity && (max > MAX_REPEAT || max < min))) invalid(`Counted repetition is limited to ${MAX_REPEAT}.`);
            }
            else return n;
            if (peek() === '?') eat();
            if (n.t === 'bol' || n.t === 'eol') invalid('Anchors cannot repeat.');
            n = { t: 'rep', n, min, max };
        }
    }
    function sequence(): Node {
        const items: Node[] = [];
        while (i < chars.length && peek() !== '|' && peek() !== ')') items.push(repeat(atom()));
        return items.length === 1 ? items[0] : items.length ? { t: 'cat', a: items } : { t: 'empty' };
    }
    function alternation(): Node {
        const items = [sequence()];
        while (peek() === '|') { eat(); items.push(sequence()); }
        return items.length === 1 ? items[0] : { t: 'alt', a: items };
    }
    const node = alternation();
    if (i < chars.length) invalid('Unbalanced parenthesis.');
    return node;
}
function compile(root: Node): { prog: State[]; entry: number } {
    const prog: State[] = [];
    const push = (s: State) => { if (prog.length >= MAX_STATES) invalid('Pattern is too large.'); prog.push(s); return prog.length - 1; };
    // Continuation-passing construction: each node is emitted with its successor already known.
    function emit(n: Node, next: number): number {
        switch (n.t) {
            case 'char': return push({ t: 'char', p: n.p, next });
            case 'bol': case 'eol': return push({ t: n.t, next });
            case 'empty': return next;
            case 'cat': { let s = next; for (let k = n.a.length - 1; k >= 0; k--) s = emit(n.a[k], s); return s; }
            case 'alt': {
                const starts = n.a.map(a => emit(a, next));
                let s = starts.at(-1)!;
                for (let k = starts.length - 2; k >= 0; k--) s = push({ t: 'split', next: starts[k], alt: s });
                return s;
            }
            case 'rep': {
                let tail = next;
                if (n.max === Infinity) {
                    const loop = push({ t: 'split', next: -1, alt: next });
                    (prog[loop] as { next: number }).next = emit(n.n, loop);
                    tail = loop;
                }
                else for (let k = n.min; k < n.max; k++) tail = push({ t: 'split', next: emit(n.n, tail), alt: next });
                for (let k = 0; k < n.min; k++) tail = emit(n.n, tail);
                return tail;
            }
        }
    }
    const match = push({ t: 'match' });
    return { prog, entry: emit(root, match) };
}
export interface CompiledRegex { test(value: string): boolean }
export function compileRegex(pattern: string, flags = ''): CompiledRegex {
    check(typeof pattern === 'string' && Buffer.byteLength(pattern) <= 256 && pattern.length > 0, 'regex_invalid', 'Patterns are non-empty and at most 256 bytes.');
    check(flags === '' || flags === 'i', 'regex_invalid', 'Only the i flag is supported.');
    let compiled: { prog: State[]; entry: number };
    try { compiled = compile(parse(pattern, flags === 'i')); }
    catch (error: any) { if (error?.regexInvalid) return check(false, 'regex_invalid', error.message, { unsupported: REGEX_UNSUPPORTED }) as never; throw error; }
    const { prog, entry } = compiled;
    return {
        test(value: string): boolean {
            const input = [...value];
            let current = new Set<number>();
            const add = (set: Set<number>, s: number, pos: number) => {
                const stack = [s];
                while (stack.length) {
                    const k = stack.pop()!;
                    if (set.has(k)) continue;
                    set.add(k);
                    const st = prog[k];
                    if (st.t === 'split') stack.push(st.alt, st.next);
                    else if (st.t === 'jump') stack.push(st.next);
                    else if (st.t === 'bol' && pos === 0) stack.push(st.next);
                    else if (st.t === 'eol' && pos === input.length) stack.push(st.next);
                }
            };
            for (let pos = 0; pos <= input.length; pos++) {
                add(current, entry, pos); // unanchored search: a thread may start at every position
                if ([...current].some(k => prog[k].t === 'match')) return true;
                if (pos === input.length) break;
                const next = new Set<number>();
                for (const k of current) { const st = prog[k]; if (st.t === 'char' && st.p(input[pos])) add(next, st.next, pos + 1); }
                current = next;
            }
            return false;
        },
    };
}
