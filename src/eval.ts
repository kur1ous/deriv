import type { Expr, FnName } from './ast';

const FN: Record<FnName, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  ln: Math.log,
  sqrt: Math.sqrt,
};

/** Numeric value of `e`. Domain errors (ln of a negative, ...) come back as NaN, as with Math.*. */
export function evaluate(e: Expr, env: Readonly<Record<string, number>> = {}): number {
  switch (e.kind) {
    case 'num':
      return e.value;
    case 'var': {
      const v = env[e.name];
      if (v === undefined) throw new Error(`no value for variable ${e.name}`);
      return v;
    }
    case 'const':
      return e.name === 'pi' ? Math.PI : Math.E;
    case 'neg':
      return -evaluate(e.arg, env);
    case 'call':
      return FN[e.fn](evaluate(e.arg, env));
    case 'deriv':
      throw new Error('cannot evaluate an unresolved derivative');
    case 'add':
      return evaluate(e.left, env) + evaluate(e.right, env);
    case 'sub':
      return evaluate(e.left, env) - evaluate(e.right, env);
    case 'mul':
      return evaluate(e.left, env) * evaluate(e.right, env);
    case 'div':
      return evaluate(e.left, env) / evaluate(e.right, env);
    case 'pow':
      return Math.pow(evaluate(e.left, env), evaluate(e.right, env));
  }
}
