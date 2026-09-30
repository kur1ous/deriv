import {
  add, call, deriv, div, hasDeriv, isConstantIn, mapChildren, mul, neg, num, pow, sub,
  type Expr, type FnName,
} from './ast';
import { toText } from './print';
import type { DiffRuleId, Step } from './rules';

export interface Derivation {
  input: Expr;
  wrt: string;
  /** `d/dx[input]`, before any rule has been applied. */
  start: Expr;
  steps: Step<DiffRuleId>[];
  /** Fully differentiated but unsimplified, e.g. `2x^1 * sin(3x) + ...`. */
  result: Expr;
}

/**
 * Differentiate `input` with respect to `wrt`, recording one step per rule application.
 *
 * The derivative operator is itself a node in the tree. Each step rewrites the leftmost
 * pending `d/dx[...]` using one rule, so every intermediate result is a valid statement and
 * the trace reads top to bottom like a worked solution.
 */
export function differentiate(input: Expr, wrt = 'x'): Derivation {
  const start = deriv(input, wrt);
  const steps: Step<DiffRuleId>[] = [];
  let current = start;
  while (hasDeriv(current)) {
    const hit = rewriteFirst(current);
    if (!hit) throw new Error('no rule applies');
    steps.push({ rule: hit.rule, detail: hit.detail, from: hit.from, to: hit.to, result: hit.expr });
    current = hit.expr;
  }
  return { input, wrt, start, steps, result: current };
}

interface Hit {
  /** The subtree this call was given, after the rewrite. */
  expr: Expr;
  rule: DiffRuleId;
  detail?: string;
  from: Expr;
  to: Expr;
}

function rewriteFirst(e: Expr): Hit | null {
  if (e.kind === 'deriv') {
    const r = applyRule(e.arg, e.wrt);
    return { expr: r.to, rule: r.rule, detail: r.detail, from: e, to: r.to };
  }
  let hit: Hit | null = null;
  const expr = mapChildren(e, (c) => {
    if (hit) return c;
    hit = rewriteFirst(c);
    return hit ? hit.expr : c;
  });
  return hit ? { ...(hit as Hit), expr } : null;
}

interface Applied {
  rule: DiffRuleId;
  detail?: string;
  to: Expr;
}

const one = num(1);
const two = num(2);
const text = toText;

function applyRule(u: Expr, v: string): Applied {
  const D = (a: Expr) => deriv(a, v);

  if (isConstantIn(u, v)) {
    const detail = u.kind === 'num' ? undefined : `${text(u)} does not depend on ${v}`;
    return { rule: 'constant', detail, to: num(0) };
  }

  switch (u.kind) {
    case 'var':
      return { rule: 'variable', to: one };

    case 'neg':
      return { rule: 'constant-multiple', detail: 'c = -1', to: neg(D(u.arg)) };

    case 'add':
      return { rule: 'sum', to: add(D(u.left), D(u.right)) };

    case 'sub':
      return { rule: 'difference', to: sub(D(u.left), D(u.right)) };

    case 'mul':
      if (isConstantIn(u.left, v)) {
        return { rule: 'constant-multiple', detail: `c = ${text(u.left)}`, to: mul(u.left, D(u.right)) };
      }
      if (isConstantIn(u.right, v)) {
        return { rule: 'constant-multiple', detail: `c = ${text(u.right)}`, to: mul(D(u.left), u.right) };
      }
      return {
        rule: 'product',
        detail: `f = ${text(u.left)}, g = ${text(u.right)}`,
        to: add(mul(D(u.left), u.right), mul(u.left, D(u.right))),
      };

    case 'div':
      if (isConstantIn(u.right, v)) {
        return { rule: 'constant-multiple', detail: `divisor ${text(u.right)} is constant`, to: div(D(u.left), u.right) };
      }
      return {
        rule: 'quotient',
        detail: `f = ${text(u.left)}, g = ${text(u.right)}`,
        to: div(sub(mul(D(u.left), u.right), mul(u.left, D(u.right))), pow(u.right, two)),
      };

    case 'pow':
      return powerRule(u.left, u.right, v);

    case 'call':
      return functionRule(u.fn, u.arg, v);

    default:
      throw new Error(`cannot differentiate a ${u.kind} node`);
  }
}

function powerRule(b: Expr, ex: Expr, v: string): Applied {
  const D = (a: Expr) => deriv(a, v);

  if (isConstantIn(ex, v)) {
    const lowered = ex.kind === 'num' ? num(ex.value - 1) : sub(ex, one);
    const core = mul(ex, pow(b, lowered));
    if (b.kind === 'var') return { rule: 'power', to: core };
    return { rule: 'chain', detail: `outer: u^${text(ex)}, inner: u = ${text(b)}`, to: mul(core, D(b)) };
  }

  if (isConstantIn(b, v)) {
    const isE = b.kind === 'const' && b.name === 'e';
    const core = isE ? pow(b, ex) : mul(pow(b, ex), call('ln', b));
    if (ex.kind === 'var') return { rule: isE ? 'exp' : 'exponential', to: core };
    return { rule: 'chain', detail: `outer: ${text(b)}^u, inner: u = ${text(ex)}`, to: mul(core, D(ex)) };
  }

  // both parts vary: d[f^g] = f^g * (g' ln f + g f'/f), which is logarithmic differentiation done once
  return {
    rule: 'general-power',
    detail: `f = ${text(b)}, g = ${text(ex)}`,
    to: mul(pow(b, ex), add(mul(D(ex), call('ln', b)), div(mul(ex, D(b)), b))),
  };
}

function functionRule(fn: FnName, a: Expr, v: string): Applied {
  const bare = a.kind === 'var';
  const da = deriv(a, v);
  const chain = (to: Expr): Applied => ({ rule: 'chain', detail: `outer: ${fn}(u), inner: u = ${text(a)}`, to });

  switch (fn) {
    case 'sin':
      return bare ? { rule: 'sin', to: call('cos', a) } : chain(mul(call('cos', a), da));
    case 'cos':
      return bare ? { rule: 'cos', to: neg(call('sin', a)) } : chain(mul(neg(call('sin', a)), da));
    case 'tan': {
      const sec2 = pow(call('cos', a), two);
      return bare ? { rule: 'tan', to: div(one, sec2) } : chain(div(da, sec2));
    }
    case 'exp':
      return bare ? { rule: 'exp', to: call('exp', a) } : chain(mul(call('exp', a), da));
    case 'ln':
      return bare ? { rule: 'ln', to: div(one, a) } : chain(div(da, a));
    case 'sqrt': {
      const denom = mul(two, call('sqrt', a));
      return bare ? { rule: 'sqrt', to: div(one, denom) } : chain(div(da, denom));
    }
  }
}
