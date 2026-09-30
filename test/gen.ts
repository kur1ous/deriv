import {
  add, call, constant, div, FUNCTIONS, mul, neg, num, pow, sub, variable, type Expr,
} from '../src/ast';

/** Small deterministic PRNG so failures reproduce from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;

export interface GenOptions {
  /** Restrict the function set (defaults to all). */
  fns?: readonly (typeof FUNCTIONS)[number][];
  /** Allow exponents that depend on x, e.g. x^x. */
  variableExponents?: boolean;
}

/** Random expression over x, small integer constants and pi/e. No negative literals: they come from `neg`. */
export function randomExpr(rng: Rng, depth: number, opts: GenOptions = {}): Expr {
  const fns = opts.fns ?? FUNCTIONS;
  if (depth <= 0 || rng() < 0.15) {
    const r = rng();
    if (r < 0.55) return variable('x');
    if (r < 0.9) return num(Math.floor(rng() * 5) + 1);
    return constant(rng() < 0.5 ? 'pi' : 'e');
  }
  const r = rng();
  const sub1 = () => randomExpr(rng, depth - 1, opts);
  if (r < 0.14) return add(sub1(), sub1());
  if (r < 0.26) return sub(sub1(), sub1());
  if (r < 0.42) return mul(sub1(), sub1());
  if (r < 0.52) return div(sub1(), sub1());
  if (r < 0.62) return neg(sub1());
  if (r < 0.75) {
    if (opts.variableExponents && rng() < 0.3) return pow(sub1(), sub1());
    return pow(sub1(), num(pick(rng, [2, 3, 4, 0.5])));
  }
  if (r < 0.82) return pow(num(pick(rng, [2, 3])), sub1());
  return call(pick(rng, fns), sub1());
}
