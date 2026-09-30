import type { Expr } from '../src/ast';

/** Compact prefix form used to assert tree shape: (* 2 (^ x 3)). */
export function sexp(e: Expr): string {
  switch (e.kind) {
    case 'num': return String(e.value);
    case 'var':
    case 'const': return e.name;
    case 'neg': return `(neg ${sexp(e.arg)})`;
    case 'call': return `(${e.fn} ${sexp(e.arg)})`;
    case 'deriv': return `(d/d${e.wrt} ${sexp(e.arg)})`;
    default: {
      const op = { add: '+', sub: '-', mul: '*', div: '/', pow: '^' }[e.kind];
      return `(${op} ${sexp(e.left)} ${sexp(e.right)})`;
    }
  }
}
