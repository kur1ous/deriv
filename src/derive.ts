import type { Expr } from './ast';
import { differentiate, type Derivation } from './diff';
import { parse } from './parser';
import { toText } from './print';
import { DIFF_RULES, type Step } from './rules';
import { SIMPLIFY_RULES, simplify, type Simplification } from './simplify';

export interface Solution {
  input: Expr;
  wrt: string;
  differentiation: Derivation;
  simplification: Simplification;
  /** The simplified derivative. */
  result: Expr;
}

/** Parse (if given text), differentiate, then simplify; both phases keep their step traces. */
export function derive(input: string | Expr, wrt = 'x'): Solution {
  const expr = typeof input === 'string' ? parse(input) : input;
  const differentiation = differentiate(expr, wrt);
  const simplification = simplify(differentiation.result);
  return { input: expr, wrt, differentiation, simplification, result: simplification.result };
}

const RULE_INFO: Record<string, { name: string }> = { ...DIFF_RULES, ...SIMPLIFY_RULES };

/** Display name of a step's rule, whichever phase it came from. */
export const ruleName = (step: Step): string => RULE_INFO[step.rule]?.name ?? step.rule;

/** The whole solution as a plain-text proof, one rewrite per line with the rule in the margin. */
export function formatSteps(s: Solution, opts: { details?: boolean } = {}): string {
  const steps: Step[] = [...s.differentiation.steps, ...s.simplification.steps];
  const rows = steps.map((st) => ({ expr: `= ${toText(st.result)}`, label: ruleName(st), detail: st.detail }));
  const width = Math.max(0, ...rows.map((r) => r.expr.length));
  const lines = [toText(s.differentiation.start)];
  for (const r of rows) {
    lines.push(`  ${r.expr.padEnd(width)}   [${r.label}]`);
    if (opts.details && r.detail) lines.push(`  ${' '.repeat(width)}     ${r.detail}`);
  }
  lines.push('', `d/d${s.wrt}[${toText(s.input)}] = ${toText(s.result)}`);
  return lines.join('\n');
}
