import { FUNCTIONS } from './ast';
import { ParseError } from './errors';

export type Token =
  | { type: 'num'; value: number; pos: number; end: number }
  | { type: 'var'; name: string; pos: number; end: number }
  | { type: 'const'; name: 'pi' | 'e'; pos: number; end: number }
  | { type: 'fn'; name: (typeof FUNCTIONS)[number]; pos: number; end: number }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '^'; pos: number; end: number }
  | { type: 'lparen' | 'rparen' | 'eof'; pos: number; end: number };

const WORDS = [...FUNCTIONS, 'pi'] as const;
const isDigit = (c: string) => c >= '0' && c <= '9';
const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
    } else if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      const start = i;
      while (isDigit(src[i] ?? '')) i++;
      if (src[i] === '.') {
        i++;
        while (isDigit(src[i] ?? '')) i++;
      }
      out.push({ type: 'num', value: Number(src.slice(start, i)), pos: start, end: i });
    } else if (isLetter(c)) {
      // A run of letters is split greedily into known names (sin, pi, ...) and single-letter
      // variables, so `3xy` is 3*x*y and `2pix` is 2*pi*x. Longest name wins: `sinx` is sin then x.
      const word = WORDS.filter((w) => src.startsWith(w, i)).sort((a, b) => b.length - a.length)[0];
      if (word === 'pi') {
        out.push({ type: 'const', name: 'pi', pos: i, end: i + 2 });
        i += 2;
      } else if (word) {
        out.push({ type: 'fn', name: word, pos: i, end: i + word.length });
        i += word.length;
      } else if (c === 'e') {
        out.push({ type: 'const', name: 'e', pos: i, end: i + 1 });
        i++;
      } else {
        out.push({ type: 'var', name: c, pos: i, end: i + 1 });
        i++;
      }
    } else if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      out.push({ type: 'op', op: c, pos: i, end: i + 1 });
      i++;
    } else if (c === '(') {
      out.push({ type: 'lparen', pos: i, end: i + 1 });
      i++;
    } else if (c === ')') {
      out.push({ type: 'rparen', pos: i, end: i + 1 });
      i++;
    } else {
      throw new ParseError(`unexpected character '${c}'`, src, i);
    }
  }
  out.push({ type: 'eof', pos: src.length, end: src.length });
  return out;
}
