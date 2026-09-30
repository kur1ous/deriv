import type { Expr } from './ast';

type Mode = 'latex' | 'text';

// Text mode mirrors the parser's binding powers so the output re-parses to the same tree.
// LaTeX mode is allowed to be looser: fractions group themselves and multiplication is
// associative, so fewer parentheses are needed.
const P = { add: 10, mul: 20, neg: 25, pow: 30, atom: 40 } as const;

export const toLatex = (e: Expr): string => print(e, 'latex');
export const toText = (e: Expr): string => print(e, 'text');

const isNegLevel = (e: Expr) => e.kind === 'neg' || (e.kind === 'num' && e.value < 0);

function prec(e: Expr, mode: Mode): number {
  switch (e.kind) {
    case 'add':
    case 'sub':
      return P.add;
    case 'mul':
      return P.mul;
    case 'div':
      return mode === 'latex' ? P.atom : P.mul;
    case 'neg':
      return P.neg;
    case 'pow':
      return P.pow;
    case 'num':
      return e.value < 0 ? P.neg : P.atom;
    default:
      return P.atom;
  }
}

function print(e: Expr, mode: Mode): string {
  const tex = mode === 'latex';
  const paren = (s: string) => (tex ? `\\left(${s}\\right)` : `(${s})`);
  const sub = (c: Expr, wrap: boolean) => {
    const s = print(c, mode);
    return wrap ? paren(s) : s;
  };
  const pr = (c: Expr) => prec(c, mode);

  switch (e.kind) {
    case 'num':
      return formatNumber(e.value);
    case 'var':
      return e.name;
    case 'const':
      return e.name === 'pi' && tex ? '\\pi' : e.name;

    case 'neg': {
      const wrap = tex
        ? e.arg.kind === 'add' || e.arg.kind === 'sub' || isNegLevel(e.arg)
        : pr(e.arg) <= P.neg;
      return `-${sub(e.arg, wrap)}`;
    }

    case 'add':
      return `${sub(e.left, false)} + ${sub(e.right, isNegLevel(e.right) || (!tex && pr(e.right) <= P.add))}`;

    case 'sub':
      return `${sub(e.left, false)} - ${sub(e.right, isNegLevel(e.right) || pr(e.right) <= P.add)}`;

    case 'mul': {
      const left = sub(e.left, pr(e.left) < P.mul);
      const right = sub(e.right, isNegLevel(e.right) || pr(e.right) < P.mul || (!tex && pr(e.right) === P.mul));
      return left + mulSeparator(e.left, e.right, left, right, tex) + right;
    }

    case 'div':
      if (tex) return `\\frac{${print(e.left, mode)}}{${print(e.right, mode)}}`;
      return `${sub(e.left, pr(e.left) < P.mul)}/${sub(e.right, isNegLevel(e.right) || pr(e.right) <= P.mul)}`;

    case 'pow': {
      if (tex) {
        const b = e.left;
        if (b.kind === 'call' && ['sin', 'cos', 'tan', 'ln'].includes(b.fn) && isSmallCount(e.right)) {
          return `${fnLatex(b.fn)}^{${print(e.right, mode)}}${paren(print(b.arg, mode))}`;
        }
        const wrap = b.kind === 'deriv' || b.kind === 'div' || pr(b) <= P.pow || (b.kind === 'call' && b.fn !== 'sqrt' && b.fn !== 'exp');
        return `${sub(b, wrap)}^{${print(e.right, mode)}}`;
      }
      return `${sub(e.left, pr(e.left) <= P.pow)}^${sub(e.right, pr(e.right) < P.pow)}`;
    }

    case 'call':
      if (!tex) return `${e.fn}(${print(e.arg, mode)})`;
      if (e.fn === 'sqrt') return `\\sqrt{${print(e.arg, mode)}}`;
      return `${fnLatex(e.fn)}${paren(print(e.arg, mode))}`;

    case 'deriv':
      return tex
        ? `\\frac{d}{d${e.wrt}}\\left[${print(e.arg, mode)}\\right]`
        : `d/d${e.wrt}[${print(e.arg, mode)}]`;
  }
}

const fnLatex = (fn: string) => `\\${fn}`;

/** sin^2(x) reads as a power of the value; anything fancier keeps explicit parentheses. */
const isSmallCount = (e: Expr) => e.kind === 'num' && Number.isInteger(e.value) && e.value > 0;

function mulSeparator(l: Expr, r: Expr, left: string, right: string, tex: boolean): string {
  const startsWithDigit = /^[0-9.]/.test(right);
  if (!tex) {
    // `2x` and `3sin(x)` read like the textbook; everything else gets an explicit sign.
    const implicit = l.kind === 'num' && l.value >= 0 && /^[A-Za-z(]/.test(right);
    return implicit ? '' : '*';
  }
  const dot = '\\cdot ';
  if (l.kind === 'deriv' || r.kind === 'deriv') return dot;
  if (l.kind === 'num' && l.value >= 0) return startsWithDigit ? dot : '';
  if (startsWithDigit || right.startsWith('\\left(')) return dot;
  // a bare control word such as \pi would swallow a following letter
  return /\\[a-zA-Z]+$/.test(left) && /^[a-zA-Z]/.test(right) ? ' ' : '';
}

function formatNumber(v: number): string {
  const s = String(v);
  if (!s.includes('e')) return s;
  if (Math.abs(v) < 1) return v.toFixed(20).replace(/0+$/, '');
  return BigInt(v).toString();
}
