export const FUNCTIONS = ['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt'] as const;
export type FnName = (typeof FUNCTIONS)[number];
export type ConstName = 'pi' | 'e';
export type BinKind = 'add' | 'sub' | 'mul' | 'div' | 'pow';

export type Expr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'const'; readonly name: ConstName }
  | { readonly kind: 'neg'; readonly arg: Expr }
  | { readonly kind: BinKind; readonly left: Expr; readonly right: Expr }
  | { readonly kind: 'call'; readonly fn: FnName; readonly arg: Expr }
  // d/d<wrt>[arg], left unevaluated. Differentiation is a rewrite that eliminates these.
  | { readonly kind: 'deriv'; readonly arg: Expr; readonly wrt: string };

const node = <T extends Expr>(n: T): T => Object.freeze(n);

export const num = (value: number): Expr => node({ kind: 'num', value });
export const variable = (name: string): Expr => node({ kind: 'var', name });
export const constant = (name: ConstName): Expr => node({ kind: 'const', name });
export const neg = (arg: Expr): Expr => node({ kind: 'neg', arg });
export const add = (left: Expr, right: Expr): Expr => node({ kind: 'add', left, right });
export const sub = (left: Expr, right: Expr): Expr => node({ kind: 'sub', left, right });
export const mul = (left: Expr, right: Expr): Expr => node({ kind: 'mul', left, right });
export const div = (left: Expr, right: Expr): Expr => node({ kind: 'div', left, right });
export const pow = (left: Expr, right: Expr): Expr => node({ kind: 'pow', left, right });
export const call = (fn: FnName, arg: Expr): Expr => node({ kind: 'call', fn, arg });
export const deriv = (arg: Expr, wrt = 'x'): Expr => node({ kind: 'deriv', arg, wrt });

export function isFn(name: string): name is FnName {
  return (FUNCTIONS as readonly string[]).includes(name);
}

export function equals(a: Expr, b: Expr): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'num':
      return a.value === (b as typeof a).value;
    case 'var':
    case 'const':
      return a.name === (b as typeof a).name;
    case 'neg':
      return equals(a.arg, (b as typeof a).arg);
    case 'call':
      return a.fn === (b as typeof a).fn && equals(a.arg, (b as typeof a).arg);
    case 'deriv':
      return a.wrt === (b as typeof a).wrt && equals(a.arg, (b as typeof a).arg);
    default: {
      const o = b as typeof a;
      return equals(a.left, o.left) && equals(a.right, o.right);
    }
  }
}

/** Rebuild a node with `f` applied to each direct child; returns the same node if nothing changed. */
export function mapChildren(e: Expr, f: (child: Expr) => Expr): Expr {
  switch (e.kind) {
    case 'num':
    case 'var':
    case 'const':
      return e;
    case 'neg': {
      const arg = f(e.arg);
      return arg === e.arg ? e : neg(arg);
    }
    case 'call': {
      const arg = f(e.arg);
      return arg === e.arg ? e : call(e.fn, arg);
    }
    case 'deriv': {
      const arg = f(e.arg);
      return arg === e.arg ? e : deriv(arg, e.wrt);
    }
    default: {
      const left = f(e.left);
      const right = f(e.right);
      if (left === e.left && right === e.right) return e;
      return { add, sub, mul, div, pow }[e.kind](left, right);
    }
  }
}

export function children(e: Expr): Expr[] {
  switch (e.kind) {
    case 'num':
    case 'var':
    case 'const':
      return [];
    case 'neg':
    case 'call':
    case 'deriv':
      return [e.arg];
    default:
      return [e.left, e.right];
  }
}

/** True when `e` does not depend on variable `v`. */
export function isConstantIn(e: Expr, v: string): boolean {
  if (e.kind === 'var') return e.name !== v;
  return children(e).every((c) => isConstantIn(c, v));
}

export function hasDeriv(e: Expr): boolean {
  return e.kind === 'deriv' || children(e).some(hasDeriv);
}
