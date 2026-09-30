import { add, div, equals, mapChildren, mul, neg, num, pow, sub, type Expr } from './ast';
import { toText } from './print';
import type { RuleInfo, Step } from './rules';

export type SimplifyRuleId =
  | 'fold'
  | 'zero-term'
  | 'zero-product'
  | 'unit-factor'
  | 'power-zero'
  | 'power-one'
  | 'power-of-power'
  | 'merge-powers'
  | 'collect'
  | 'signs'
  | 'coefficient-first'
  | 'cancel'
  | 'fractions'
  | 'known-value';

export const SIMPLIFY_RULES: Record<SimplifyRuleId, RuleInfo> = {
  fold: { name: 'constant folding', formula: '2 + 3 = 5' },
  'zero-term': { name: 'adding zero', formula: 'f + 0 = f' },
  'zero-product': { name: 'multiplying by zero', formula: '0 \\cdot f = 0' },
  'unit-factor': { name: 'multiplying by one', formula: '1 \\cdot f = f' },
  'power-zero': { name: 'zeroth power', formula: 'f^{0} = 1' },
  'power-one': { name: 'first power', formula: 'f^{1} = f' },
  'power-of-power': { name: 'power of a power', formula: '\\left(f^{m}\\right)^{n} = f^{mn}' },
  'merge-powers': { name: 'merging powers', formula: 'f^{m} f^{n} = f^{m+n}' },
  collect: { name: 'collecting like terms', formula: 'a f + b f = (a + b) f' },
  signs: { name: 'simplifying signs', formula: '-(-f) = f' },
  'coefficient-first': { name: 'reordering factors', formula: 'f \\cdot 3 = 3 f' },
  cancel: { name: 'cancelling', formula: '\\frac{a f}{b f} = \\frac{a}{b}' },
  fractions: { name: 'combining fractions', formula: 'a \\cdot \\frac{b}{c} = \\frac{a b}{c}' },
  'known-value': { name: 'known value', formula: '\\sin 0 = 0' },
};

export interface Simplification {
  input: Expr;
  steps: Step<SimplifyRuleId>[];
  result: Expr;
}

/**
 * Rewrite `input` into a simpler equivalent form, one recorded rule application at a time.
 * Children are simplified before their parents, and sums and products are treated as flat
 * chains so like terms and repeated factors are found in a single step.
 *
 * Division by zero is not checked: `x/x` becomes 1 and `0/x` becomes 0.
 */
export function simplify(input: Expr): Simplification {
  const steps: Step<SimplifyRuleId>[] = [];
  let current = input;
  for (let n = 0; n < 1000; n++) {
    const hit = rewriteFirst(current, null);
    if (!hit) return { input, steps, result: current };
    steps.push({ rule: hit.rule, detail: hit.detail, from: hit.from, to: hit.to, result: hit.expr });
    current = hit.expr;
  }
  throw new Error(`simplify did not settle: ${toText(input)}`);
}

interface Local {
  rule: SimplifyRuleId;
  detail?: string;
  to: Expr;
}

interface Hit extends Local {
  expr: Expr;
  from: Expr;
}

function rewriteFirst(e: Expr, parent: Expr | null): Hit | null {
  let hit: Hit | null = null;
  const expr = mapChildren(e, (c) => {
    if (hit) return c;
    hit = rewriteFirst(c, e);
    return hit ? hit.expr : c;
  });
  if (hit) return { ...(hit as Hit), expr };
  const r = local(e, parent);
  return r ? { ...r, expr: r.to, from: e } : null;
}

const isSum = (e: Expr | null) => e !== null && (e.kind === 'add' || e.kind === 'sub');

function local(e: Expr, parent: Expr | null): Local | null {
  switch (e.kind) {
    case 'neg':
      return negRule(e.arg);
    case 'add':
    case 'sub':
      return sumBinary(e) ?? (isSum(parent) ? null : collectTerms(e));
    case 'mul':
      return parent?.kind === 'mul' ? null : productRule(e);
    case 'div':
      return divRule(e.left, e.right);
    case 'pow':
      return powRule(e.left, e.right);
    case 'call':
      return knownValue(e.fn, e.arg);
    default:
      return null;
  }
}

// ---------------------------------------------------------------- numbers

/** Literal value of `2` or `-2`. Negative constants are always neg(num) so signs stay visible. */
function numVal(e: Expr): number | null {
  if (e.kind === 'num') return e.value;
  if (e.kind === 'neg' && e.arg.kind === 'num') return -e.arg.value;
  return null;
}

const clean = (n: number) => (n === 0 ? 0 : Number(n.toPrecision(12)));
const mkNum = (v: number): Expr => (v < 0 ? neg(num(-v)) : num(v === 0 ? 0 : v));
const isZero = (e: Expr) => numVal(e) === 0;
const isOne = (e: Expr) => numVal(e) === 1;
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const isInt = Number.isInteger;

// ---------------------------------------------------------------- unary minus

function negRule(a: Expr): Local | null {
  if (a.kind === 'neg') return { rule: 'signs', to: a.arg };
  if (a.kind === 'sub') return { rule: 'signs', detail: '-(a - b) = b - a', to: sub(a.right, a.left) };
  if (isZero(a)) return { rule: 'signs', to: num(0) };
  return null;
}

// ---------------------------------------------------------------- sums

function sumBinary(e: Extract<Expr, { left: Expr }>): Local | null {
  const { left: a, right: b } = e;
  const plus = e.kind === 'add';
  if (isZero(b)) return { rule: 'zero-term', to: a };
  if (isZero(a)) return { rule: 'zero-term', to: plus ? b : neg(b) };
  const va = numVal(a);
  const vb = numVal(b);
  if (va !== null && vb !== null) {
    return { rule: 'fold', to: mkNum(clean(plus ? va + vb : va - vb)) };
  }
  if (b.kind === 'neg') return { rule: 'signs', to: plus ? sub(a, b.arg) : add(a, b.arg) };
  if (plus && a.kind === 'neg') return { rule: 'signs', to: sub(b, a.arg) };
  return null;
}

interface Term {
  sign: 1 | -1;
  expr: Expr;
}

function flattenSum(e: Expr, sign: 1 | -1, out: Term[]): Term[] {
  if (e.kind === 'add') {
    flattenSum(e.left, sign, out);
    flattenSum(e.right, sign, out);
  } else if (e.kind === 'sub') {
    flattenSum(e.left, sign, out);
    flattenSum(e.right, sign === 1 ? -1 : 1, out);
  } else if (e.kind === 'neg') {
    flattenSum(e.arg, sign === 1 ? -1 : 1, out);
  } else {
    out.push({ sign, expr: e });
  }
  return out;
}

function buildSum(terms: Term[]): Expr {
  let acc: Expr | null = null;
  for (const t of terms) {
    if (acc === null) acc = t.sign < 0 ? neg(t.expr) : t.expr;
    else acc = t.sign < 0 ? sub(acc, t.expr) : add(acc, t.expr);
  }
  return acc ?? num(0);
}

const keyOf = (items: Factor[]) =>
  items.map((f) => `${toText(f.base)}^${f.exp}`).sort().join('*');

function collectTerms(e: Expr): Local | null {
  const terms = flattenSum(e, 1, []);
  const groups = new Map<string, { members: Term[]; items: Factor[]; coef: number }>();
  const order: string[] = [];
  for (const t of terms) {
    const p = decompose(t.expr);
    const key = keyOf(p.items);
    const g = groups.get(key);
    if (g) {
      g.members.push(t);
      g.coef = clean(g.coef + t.sign * p.coef);
    } else {
      groups.set(key, { members: [t], items: p.items, coef: t.sign * p.coef });
      order.push(key);
    }
  }
  if (order.every((k) => groups.get(k)!.members.length === 1)) return null;

  const out: Term[] = [];
  const notes: string[] = [];
  let onlyConstants = true;
  for (const key of order) {
    const g = groups.get(key)!;
    if (g.members.length === 1) {
      out.push(g.members[0]!);
      continue;
    }
    if (g.items.length > 0) onlyConstants = false;
    if (g.coef === 0) {
      notes.push(`${toText(buildSum(g.members))} = 0`);
      continue;
    }
    const merged: Term = { sign: g.coef < 0 ? -1 : 1, expr: compose({ coef: Math.abs(g.coef), items: g.items }).body };
    out.push(merged);
    notes.push(`${toText(buildSum(g.members))} = ${toText(buildSum([merged]))}`);
  }
  return { rule: onlyConstants ? 'fold' : 'collect', detail: notes.join('; '), to: buildSum(out) };
}

// ---------------------------------------------------------------- products

interface Factor {
  base: Expr;
  exp: number;
  /** How many times this base appeared before merging. */
  n: number;
}

interface Product {
  coef: number;
  items: Factor[];
  /** Non-numeric factors seen before repeated bases were merged. */
  raw: number;
  /** A negation was found somewhere in the chain. */
  signed: boolean;
}

/** Split a product into a numeric coefficient and distinct bases with numeric exponents. */
function decompose(e: Expr): Product {
  const p: Product = { coef: 1, items: [], raw: 0, signed: false };
  const put = (base: Expr, exp: number) => {
    p.raw++;
    const hit = p.items.find((f) => equals(f.base, base));
    if (hit) {
      hit.exp = clean(hit.exp + exp);
      hit.n++;
    } else {
      p.items.push({ base, exp, n: 1 });
    }
  };
  const walk = (x: Expr): void => {
    if (x.kind === 'mul') {
      walk(x.left);
      walk(x.right);
    } else if (x.kind === 'neg') {
      p.coef = -p.coef;
      p.signed = true;
      walk(x.arg);
    } else if (x.kind === 'num') {
      p.coef = clean(p.coef * x.value);
    } else if (x.kind === 'pow' && numVal(x.right) !== null && x.left.kind !== 'num') {
      put(x.left, numVal(x.right)!);
    } else {
      put(x, 1);
    }
  };
  walk(e);
  return p;
}

/** Canonical product: sign outermost, then the coefficient, then the factors in first-seen order. */
function compose(p: { coef: number; items: Factor[] }): { expr: Expr; body: Expr; parts: Expr[]; negated: boolean } {
  if (p.coef === 0) return { expr: num(0), body: num(0), parts: [num(0)], negated: false };
  const parts = p.items
    .filter((f) => f.exp !== 0)
    .map((f) => (f.exp === 1 ? f.base : pow(f.base, mkNum(f.exp))));
  const mag = Math.abs(p.coef);
  if (mag !== 1 || parts.length === 0) parts.unshift(num(mag));
  const body = parts.reduce((l, r) => mul(l, r));
  const negated = p.coef < 0;
  return { expr: negated ? neg(body) : body, body, parts, negated };
}

function flattenMul(e: Expr, out: Expr[] = []): Expr[] {
  if (e.kind === 'mul') {
    flattenMul(e.left, out);
    flattenMul(e.right, out);
  } else {
    out.push(e);
  }
  return out;
}

function productRule(e: Expr): Local | null {
  const before = flattenMul(e);
  if (before.some((f) => f.kind === 'div')) {
    // a * (b / c) = (a * b) / c, so the cancelling in divRule can see everything at once
    const top = before.map((f) => (f.kind === 'div' ? f.left : f)).reduce((l, r) => mul(l, r));
    const bottom = before.flatMap((f) => (f.kind === 'div' ? [f.right] : [])).reduce((l, r) => mul(l, r));
    return { rule: 'fractions', to: div(top, bottom) };
  }
  const p = decompose(e);
  const c = compose(p);
  const same = !c.negated && c.parts.length === before.length && c.parts.every((x, i) => equals(x, before[i]!));
  if (same) return null;

  const nums = before.filter((f) => numVal(f) !== null);
  let rule: SimplifyRuleId;
  let detail: string | undefined;
  if (p.coef === 0) {
    rule = 'zero-product';
  } else if (p.items.length < p.raw) {
    rule = 'merge-powers';
    detail = p.items.filter((f) => f.n > 1).map((f) => `combine powers of ${toText(f.base)}`).join('; ');
  } else if (nums.length >= 2) {
    rule = 'fold';
  } else if (nums.some(isOne)) {
    rule = 'unit-factor';
  } else if (p.signed) {
    rule = 'signs';
  } else {
    rule = 'coefficient-first';
  }
  return { rule, detail: detail || undefined, to: c.expr };
}

// ---------------------------------------------------------------- quotients

function divRule(a: Expr, b: Expr): Local | null {
  if (isZero(a)) return { rule: 'cancel', detail: 'zero divided by anything is zero', to: num(0) };
  if (isOne(b)) return { rule: 'unit-factor', to: a };
  if (equals(a, b)) return { rule: 'cancel', detail: `${toText(a)}/${toText(a)} = 1`, to: num(1) };
  if (a.kind === 'div') return { rule: 'fractions', to: div(a.left, mul(a.right, b)) };
  if (b.kind === 'div') return { rule: 'fractions', to: div(mul(a, b.right), b.left) };
  if (a.kind === 'neg') return { rule: 'signs', to: neg(div(a.arg, b)) };
  if (b.kind === 'neg') return { rule: 'signs', to: neg(div(a, b.arg)) };
  return cancelCommon(a, b);
}

function cancelCommon(a: Expr, b: Expr): Local | null {
  const pa = decompose(a);
  const pb = decompose(b);
  const noted: string[] = [];
  let changed = false;

  if (isInt(pa.coef) && isInt(pb.coef) && pb.coef !== 0) {
    const g = gcd(Math.abs(pa.coef), Math.abs(pb.coef));
    if (g > 1) {
      pa.coef /= g;
      pb.coef /= g;
      noted.push(`${g}`);
      changed = true;
    }
  }
  for (const fb of pb.items) {
    const fa = pa.items.find((f) => equals(f.base, fb.base));
    if (!fa) continue;
    const net = clean(fa.exp - fb.exp);
    fa.exp = Math.max(net, 0);
    fb.exp = Math.max(-net, 0);
    noted.push(toText(fb.base));
    changed = true;
  }
  if (!changed) return null;

  const top = compose(pa).expr;
  const bottom = compose(pb).expr;
  // a negative denominator coefficient moves to the numerator's sign
  const to = isOne(bottom) ? top : div(top, bottom);
  return { rule: 'cancel', detail: `cancel common factor ${noted.join(', ')}`, to };
}

// ---------------------------------------------------------------- powers and functions

function powRule(a: Expr, b: Expr): Local | null {
  const vb = numVal(b);
  const va = numVal(a);
  if (vb === 0) return { rule: 'power-zero', to: num(1) };
  if (vb === 1) return { rule: 'power-one', to: a };
  if (va === 1) return { rule: 'power-one', detail: '1 to any power is 1', to: num(1) };
  if (va === 0 && vb !== null && vb > 0) return { rule: 'fold', to: num(0) };
  if (a.kind === 'num' && vb !== null && isInt(a.value) && isInt(vb) && vb > 0) {
    const r = a.value ** vb;
    if (Number.isSafeInteger(r)) return { rule: 'fold', to: num(r) };
  }
  if (a.kind === 'pow' && vb !== null && isInt(vb)) {
    const m = numVal(a.right);
    if (m !== null) return { rule: 'power-of-power', to: pow(a.left, mkNum(clean(m * vb))) };
  }
  if (a.kind === 'neg' && vb !== null && isInt(vb) && vb > 0) {
    const p = pow(a.arg, b);
    return { rule: 'signs', detail: vb % 2 === 0 ? 'even power drops the sign' : 'odd power keeps the sign', to: vb % 2 === 0 ? p : neg(p) };
  }
  return null;
}

function knownValue(fn: string, a: Expr): Local | null {
  const v = numVal(a);
  const is = (r: Expr): Local => ({ rule: 'known-value', detail: `${fn}(${toText(a)}) = ${toText(r)}`, to: r });
  if (fn === 'ln' && a.kind === 'call' && a.fn === 'exp') return { rule: 'known-value', detail: 'ln(exp(u)) = u', to: a.arg };
  if (fn === 'ln' && a.kind === 'const' && a.name === 'e') return is(num(1));
  if (fn === 'sin' && a.kind === 'const' && a.name === 'pi') return is(num(0));
  if (fn === 'cos' && a.kind === 'const' && a.name === 'pi') return is(neg(num(1)));
  if (v === null) return null;
  if (v === 0 && (fn === 'sin' || fn === 'tan' || fn === 'sqrt')) return is(num(0));
  if (v === 0 && (fn === 'cos' || fn === 'exp')) return is(num(1));
  if (v === 1 && (fn === 'ln')) return is(num(0));
  if (v === 1 && fn === 'sqrt') return is(num(1));
  if (fn === 'sqrt' && v > 1 && isInt(v) && isInt(Math.sqrt(v))) return is(num(Math.sqrt(v)));
  return null;
}
