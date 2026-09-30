import { describe, expect, it } from 'vitest';
import type { Expr } from '../src/ast';
import { differentiate } from '../src/diff';
import { evaluate } from '../src/eval';
import { parse } from '../src/parser';
import { toText } from '../src/print';
import { mulberry32, randomExpr } from './gen';

const H = 1e-5;

const at = (e: Expr, x: number) => evaluate(e, { x });

/** Central difference, or null where the function is not smooth enough to trust it. */
function finiteDifference(f: Expr, x: number): number | null {
  const d1 = (at(f, x + H) - at(f, x - H)) / (2 * H);
  const d2 = (at(f, x + 2 * H) - at(f, x - 2 * H)) / (4 * H);
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return null;
  // Near poles and kinks the two step sizes disagree; those points say nothing about the rules.
  if (Math.abs(d1 - d2) > 1e-4 * (1 + Math.abs(d1))) return null;
  return d1;
}

interface Tally {
  checked: number;
  skipped: number;
  worst: { src: string; x: number; got: number; want: number } | null;
}

function check(seed: number, count: number, depth: number, variableExponents: boolean): Tally {
  const rng = mulberry32(seed);
  const t: Tally = { checked: 0, skipped: 0, worst: null };
  let worstErr = 0;
  for (let i = 0; i < count; i++) {
    const f = randomExpr(rng, depth, { variableExponents });
    const df = differentiate(f).result;
    for (let j = 0; j < 5; j++) {
      const x = rng() * 6 - 3;
      const fx = at(f, x);
      const want = finiteDifference(f, x);
      if (want === null || !Number.isFinite(fx) || Math.abs(fx) > 1e6 || Math.abs(want) > 1e6) {
        t.skipped++;
        continue;
      }
      const got = at(df, x);
      if (!Number.isFinite(got)) {
        // e.g. x^(x - x + 2) at negative x: f is defined but the log form is not
        t.skipped++;
        continue;
      }
      t.checked++;
      const err = Math.abs(got - want) / (1 + Math.abs(got) + Math.abs(want));
      if (err > worstErr) {
        worstErr = err;
        t.worst = { src: toText(f), x, got, want };
      }
    }
  }
  return t;
}

describe('derivative agrees with a central finite difference', () => {
  it('for random expressions with constant exponents', () => {
    const t = check(1, 700, 4, false);
    expect(t.checked).toBeGreaterThan(1500);
    expect(t.worst && Math.abs(t.worst.got - t.worst.want) / (1 + Math.abs(t.worst.got))).toBeLessThan(1e-4);
  });

  it('for random expressions that include x^g(x)', () => {
    const t = check(2, 500, 3, true);
    expect(t.checked).toBeGreaterThan(800);
    expect(t.worst && Math.abs(t.worst.got - t.worst.want) / (1 + Math.abs(t.worst.got))).toBeLessThan(1e-4);
  });

  it('for a fixed set of textbook expressions', () => {
    const rng = mulberry32(3);
    const cases = [
      'x^2*sin(3x)', 'sin(x)/x', '(2x+1)^3', 'exp(x^2)', 'ln(x^2+1)', 'sqrt(x^2+1)', 'tan(2x)',
      'x^x', '2^x*x', 'cos(x)^2', 'x/(1+x^2)', 'sin(cos(x))', 'e^(-x^2)', '1/x',
    ];
    for (const src of cases) {
      const f = parse(src);
      const df = differentiate(f).result;
      let n = 0;
      while (n < 8) {
        const x = rng() * 2.5 + 0.2; // positive so x^x and ln are defined
        const want = finiteDifference(f, x);
        if (want === null) continue;
        const got = at(df, x);
        expect(Math.abs(got - want) / (1 + Math.abs(want)), `${src} at ${x}`).toBeLessThan(1e-5);
        n++;
      }
    }
  });
});
