import type { Expr } from './ast';

/**
 * One rewrite in a derivation. `from` is the sub-expression that was replaced by `to`;
 * `result` is the whole expression afterwards, so each step can be shown on its own line.
 */
export interface Step<R extends string = string> {
  rule: R;
  /** Plain-text remark about how the rule matched, e.g. which part is the inner function. */
  detail?: string;
  from: Expr;
  to: Expr;
  result: Expr;
}

export type DiffRuleId =
  | 'constant'
  | 'variable'
  | 'constant-multiple'
  | 'sum'
  | 'difference'
  | 'product'
  | 'quotient'
  | 'power'
  | 'general-power'
  | 'chain'
  | 'sin'
  | 'cos'
  | 'tan'
  | 'exp'
  | 'exponential'
  | 'ln'
  | 'sqrt';

export interface RuleInfo {
  name: string;
  /** The rule as stated in a textbook, in LaTeX. */
  formula: string;
}

export const DIFF_RULES: Record<DiffRuleId, RuleInfo> = {
  constant: { name: 'constant rule', formula: "c' = 0" },
  variable: { name: 'variable rule', formula: "x' = 1" },
  'constant-multiple': { name: 'constant multiple rule', formula: "(c f)' = c f'" },
  sum: { name: 'sum rule', formula: "(f + g)' = f' + g'" },
  difference: { name: 'difference rule', formula: "(f - g)' = f' - g'" },
  product: { name: 'product rule', formula: "(f g)' = f' g + f g'" },
  quotient: { name: 'quotient rule', formula: "\\left(\\frac{f}{g}\\right)' = \\frac{f' g - f g'}{g^{2}}" },
  power: { name: 'power rule', formula: "(x^{n})' = n x^{n-1}" },
  'general-power': {
    name: 'general power rule',
    formula: "(f^{g})' = f^{g}\\left(g' \\ln f + \\frac{g f'}{f}\\right)",
  },
  chain: { name: 'chain rule', formula: "\\left(f(u)\\right)' = f'(u)\\, u'" },
  sin: { name: 'sine rule', formula: "(\\sin x)' = \\cos x" },
  cos: { name: 'cosine rule', formula: "(\\cos x)' = -\\sin x" },
  tan: { name: 'tangent rule', formula: "(\\tan x)' = \\frac{1}{\\cos^{2} x}" },
  exp: { name: 'exponential rule', formula: "(e^{x})' = e^{x}" },
  exponential: { name: 'exponential rule', formula: "(a^{x})' = a^{x} \\ln a" },
  ln: { name: 'logarithm rule', formula: "(\\ln x)' = \\frac{1}{x}" },
  sqrt: { name: 'square root rule', formula: "(\\sqrt{x})' = \\frac{1}{2\\sqrt{x}}" },
};
