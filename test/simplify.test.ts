import { describe, expect, it } from 'vitest';
import type { Expr } from '../src/ast';
import { differentiate } from '../src/diff';
import { evaluate } from '../src/eval';
import { parse } from '../src/parser';
import { toText } from '../src/print';
import { SIMPLIFY_RULES, simplify } from '../src/simplify';
import { mulberry32, randomExpr } from './gen';

const s = (src: string) => toText(simplify(parse(src)).result);
const rules = (src: string) => simplify(parse(src)).steps.map((t) => t.rule);

describe('identities', () => {
  it('drops zero terms and unit factors', () => {
    expect(s('x + 0')).toBe('x');
    expect(s('0 + x')).toBe('x');
    expect(s('x - 0')).toBe('x');
    expect(s('0 - x')).toBe('-x');
    expect(s('x * 1')).toBe('x');
    expect(s('1 * x')).toBe('x');
    expect(s('x / 1')).toBe('x');
    expect(rules('x + 0')).toEqual(['zero-term']);
    expect(rules('x * 1')).toEqual(['unit-factor']);
  });

  it('collapses multiplication by zero', () => {
    expect(s('0 * sin(x)')).toBe('0');
    expect(s('x * y * 0')).toBe('0');
    expect(s('0 / x')).toBe('0');
    expect(rules('x * 0')).toEqual(['zero-product']);
  });

  it('handles zeroth and first powers', () => {
    expect(s('x^1')).toBe('x');
    expect(s('x^0')).toBe('1');
    expect(s('1^x')).toBe('1');
    expect(s('(x+1)^1')).toBe('x + 1');
  });

  it('cancels a quotient with itself', () => {
    expect(s('x / x')).toBe('1');
    expect(s('sin(x) / sin(x)')).toBe('1');
    expect(s('(x+1)/(x+1)')).toBe('1');
  });
});

describe('constant folding', () => {
  it('folds sums, products and powers of literals', () => {
    expect(s('2 + 3')).toBe('5');
    expect(s('2 * 3 * 4')).toBe('24');
    expect(s('2^10')).toBe('1024');
    expect(s('(1 + 2) * (3 + 4)')).toBe('21');
    expect(s('10 - 4')).toBe('6');
  });

  it('keeps negative results as an explicit sign', () => {
    expect(s('2 - 5')).toBe('-3');
    expect(s('3 * -2')).toBe('-6');
    expect(s('x - 5 + 2')).toBe('x - 3');
  });

  it('reduces exact fractions but leaves inexact ones alone', () => {
    expect(s('6 / 3')).toBe('2');
    expect(s('2 / 4')).toBe('1/2');
    expect(s('1 / 3')).toBe('1/3');
    expect(s('x / 3')).toBe('x/3');
  });

  it('avoids float noise in decimals', () => {
    expect(s('0.1 + 0.2')).toBe('0.3');
    expect(s('0.1 * 3')).toBe('0.3');
  });

  it('gathers coefficients that are not adjacent', () => {
    expect(s('2 * x * 3')).toBe('6x');
    expect(s('x * 3')).toBe('3x');
    expect(rules('x * 3')).toEqual(['coefficient-first']);
  });

  it('knows a few values of elementary functions', () => {
    expect(s('sin(0)')).toBe('0');
    expect(s('cos(0)')).toBe('1');
    expect(s('exp(0)')).toBe('1');
    expect(s('ln(1)')).toBe('0');
    expect(s('ln(e)')).toBe('1');
    expect(s('sqrt(9)')).toBe('3');
    expect(s('sqrt(2)')).toBe('sqrt(2)');
    expect(s('ln(exp(x))')).toBe('x');
  });
});

describe('like terms', () => {
  it('collects terms with numeric coefficients', () => {
    expect(s('x + x')).toBe('2x');
    expect(s('3x + 2x')).toBe('5x');
    expect(s('x + 2x + x')).toBe('4x');
    expect(s('5x - 2x')).toBe('3x');
    expect(s('x - x')).toBe('0');
    expect(s('2x^2 + 3x - x^2 + x')).toBe('x^2 + 4x');
  });

  it('matches terms whatever the factor order', () => {
    expect(s('x*sin(x) + sin(x)*x')).toBe('2x*sin(x)');
  });

  it('cancels across a subtracted group', () => {
    expect(s('x + 1 - (x - 1)')).toBe('2');
    expect(s('a - (b + a)')).toBe('-b');
  });

  it('leaves unlike terms in their original order', () => {
    expect(s('x^2 + x + 1')).toBe('x^2 + x + 1');
    expect(s('sin(x) + cos(x)')).toBe('sin(x) + cos(x)');
  });

  it('collects the whole chain in one step', () => {
    const r = simplify(parse('x + 2x + 3x + 4x'));
    expect(r.steps).toHaveLength(1);
    expect(r.steps[0]!.rule).toBe('collect');
    expect(toText(r.result)).toBe('10x');
  });
});

describe('powers and products', () => {
  it('merges repeated factors into a power', () => {
    expect(s('x * x')).toBe('x^2');
    expect(s('x * x * x')).toBe('x^3');
    expect(s('x^2 * x^3')).toBe('x^5');
    expect(s('x * x^2')).toBe('x^3');
    expect(s('sin(x) * sin(x)')).toBe('sin(x)^2');
    expect(s('x^3 * x^-3')).toBe('1');
    expect(rules('x * x')).toEqual(['merge-powers']);
  });

  it('flattens a power of a power', () => {
    expect(s('(x^2)^3')).toBe('x^6');
    expect(s('(x^0.5)^2')).toBe('x');
  });

  it('cancels common factors in a quotient', () => {
    expect(s('x^2 / x')).toBe('x');
    expect(s('x / x^2')).toBe('1/x');
    expect(s('2x / x^2')).toBe('2/x');
    expect(s('6x / (4x^2)')).toBe('3/(2x)');
    expect(s('2 * (x / 2)')).toBe('x');
  });

  it('moves signs out of products and quotients', () => {
    expect(s('(-x) * y')).toBe('-(x*y)');
    expect(s('(-x) * (-y)')).toBe('x*y');
    expect(s('-(-x)')).toBe('x');
    expect(s('a / (-b)')).toBe('-(a/b)');
    expect(s('(-x)^2')).toBe('x^2');
    expect(s('(-x)^3')).toBe('-x^3');
    expect(s('-(a - b)')).toBe('b - a');
    expect(s('x + -y')).toBe('x - y');
  });
});

describe('records its work', () => {
  it('replays to the final result', () => {
    const r = simplify(parse('2*x*3 + x*1 + 0'));
    expect(r.steps.at(-1)!.result).toBe(r.result);
    expect(toText(r.result)).toBe('7x');
    expect(r.steps.map((t) => t.rule)).toEqual(['fold', 'unit-factor', 'zero-term', 'collect']);
  });

  it('returns no steps for an already simple expression', () => {
    const r = simplify(parse('x^2*sin(x)'));
    expect(r.steps).toEqual([]);
    expect(toText(r.result)).toBe('x^2*sin(x)');
  });

  it('every rule that fires has a name', () => {
    for (const src of ['x*1 + 0', '2x*3', 'x*x', 'x/x', 'x + x', '-(-x)', 'sin(0)', '(x^2)^3', 'x^0', '2*(x/2)']) {
      for (const st of simplify(parse(src)).steps) expect(SIMPLIFY_RULES[st.rule].name).toBeTruthy();
    }
  });

  it('cleans up real derivative output', () => {
    const d = (src: string) => toText(simplify(differentiate(parse(src)).result).result);
    expect(d('x^2')).toBe('2x');
    expect(d('x^2 * sin(3x)')).toBe('2x*sin(3x) + 3x^2*cos(3x)');
    expect(d('(2x+1)^3')).toBe('6(2x + 1)^2');
    expect(d('sqrt(x^2+1)')).toBe('x/sqrt(x^2 + 1)');
    expect(d('ln(x^2)')).toBe('2/x');
    expect(d('ln(x)/x')).toBe('(1 - ln(x))/x^2');
    expect(d('x^3 + 2x^2 - 5x + 1')).toBe('3x^2 + 4x - 5');
    expect(d('e^(2x)')).toBe('2e^(2x)');
  });
});

describe('properties', () => {
  const at = (e: Expr, x: number) => evaluate(e, { x });

  it('preserves the value of random expressions', () => {
    const rng = mulberry32(11);
    let checked = 0;
    for (let i = 0; i < 600; i++) {
      const e = randomExpr(rng, 4, { variableExponents: true });
      const r = simplify(e).result;
      for (let j = 0; j < 4; j++) {
        const x = rng() * 5 - 2.5;
        const a = at(e, x);
        const b = at(r, x);
        // simplification may widen the domain (x/x = 1), never change a defined value
        if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 1e8) continue;
        checked++;
        expect(Math.abs(a - b), `${toText(e)} => ${toText(r)} at ${x}`).toBeLessThanOrEqual(1e-6 * (1 + Math.abs(a)));
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('is idempotent and always terminates', () => {
    const rng = mulberry32(12);
    for (let i = 0; i < 600; i++) {
      const e = randomExpr(rng, 5, { variableExponents: true });
      const once = simplify(e).result;
      const twice = simplify(once);
      expect(twice.steps, toText(e)).toEqual([]);
    }
  });

  it('keeps simplified derivatives equal to the raw ones', () => {
    const rng = mulberry32(13);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const e = randomExpr(rng, 4);
      const raw = differentiate(e).result;
      const simple = simplify(raw).result;
      for (let j = 0; j < 4; j++) {
        const x = rng() * 5 - 2.5;
        const a = at(raw, x);
        const b = at(simple, x);
        if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 1e8) continue;
        checked++;
        expect(Math.abs(a - b), `${toText(e)} at ${x}`).toBeLessThanOrEqual(1e-6 * (1 + Math.abs(a)));
      }
    }
    expect(checked).toBeGreaterThan(700);
  });
});
