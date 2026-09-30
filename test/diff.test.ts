import { describe, expect, it } from 'vitest';
import { hasDeriv, num, variable } from '../src/ast';
import { differentiate } from '../src/diff';
import { evaluate } from '../src/eval';
import { parse } from '../src/parser';
import { toText } from '../src/print';
import { DIFF_RULES } from '../src/rules';

const run = (src: string, wrt = 'x') => differentiate(parse(src), wrt);
const rules = (src: string, wrt = 'x') => run(src, wrt).steps.map((s) => s.rule);
const out = (src: string, wrt = 'x') => toText(run(src, wrt).result);

describe('single rules', () => {
  it('constant and variable', () => {
    expect(rules('5')).toEqual(['constant']);
    expect(rules('x')).toEqual(['variable']);
    expect(out('pi')).toBe('0');
  });

  it('treats other letters as constants', () => {
    expect(rules('y')).toEqual(['constant']);
    expect(run('y').steps[0]!.detail).toBe('y does not depend on x');
    expect(rules('y*x')).toEqual(['constant-multiple', 'variable']);
    expect(rules('x*y', 'y')).toEqual(['constant-multiple', 'variable']);
  });

  it('sum, difference and negation', () => {
    expect(rules('x + 1')).toEqual(['sum', 'variable', 'constant']);
    expect(rules('x - 1')).toEqual(['difference', 'variable', 'constant']);
    expect(rules('-x')).toEqual(['constant-multiple', 'variable']);
    expect(run('-x').steps[0]!.detail).toBe('c = -1');
  });

  it('constant multiple on either side, and division by a constant', () => {
    expect(out('3x')).toBe('3*1');
    expect(out('x*3')).toBe('1*3');
    expect(out('x/3')).toBe('1/3');
  });

  it('power rule', () => {
    expect(rules('x^2')).toEqual(['power']);
    expect(out('x^2')).toBe('2x^1');
    expect(out('x^0.5')).toBe('0.5x^(-0.5)');
    expect(out('x^n')).toBe('n*x^(n - 1)');
  });

  it('product rule', () => {
    expect(rules('x * sin(x)')).toEqual(['product', 'variable', 'sin']);
    expect(out('x * sin(x)')).toBe('1sin(x) + x*cos(x)');
  });

  it('quotient rule', () => {
    expect(rules('sin(x)/x')).toEqual(['quotient', 'sin', 'variable']);
    expect(out('sin(x)/x')).toBe('(cos(x)*x - sin(x)*1)/x^2');
  });

  it('elementary functions of x', () => {
    expect(out('sin(x)')).toBe('cos(x)');
    expect(out('cos(x)')).toBe('-sin(x)');
    expect(out('tan(x)')).toBe('1/cos(x)^2');
    expect(out('exp(x)')).toBe('exp(x)');
    expect(out('ln(x)')).toBe('1/x');
    expect(out('sqrt(x)')).toBe('1/(2sqrt(x))');
    expect(rules('e^x')).toEqual(['exp']);
    expect(out('2^x')).toBe('2^x*ln(2)');
    expect(rules('2^x')).toEqual(['exponential']);
  });
});

describe('chain rule', () => {
  it('names the outer and inner functions', () => {
    const d = run('sin(3x)');
    expect(d.steps.map((s) => s.rule)).toEqual(['chain', 'constant-multiple', 'variable']);
    expect(d.steps[0]!.detail).toBe('outer: sin(u), inner: u = 3x');
    expect(toText(d.result)).toBe('cos(3x)*(3*1)');
  });

  it('applies to powers, exponentials, roots and logs', () => {
    expect(rules('(2x+1)^3')[0]).toBe('chain');
    expect(run('(2x+1)^3').steps[0]!.detail).toBe('outer: u^3, inner: u = 2x + 1');
    expect(rules('e^(2x)')).toEqual(['chain', 'constant-multiple', 'variable']);
    expect(rules('sqrt(x^2+1)')[0]).toBe('chain');
    expect(rules('ln(x^2)')).toEqual(['chain', 'power']);
    expect(rules('tan(x^2)')).toEqual(['chain', 'power']);
  });

  it('nests: sin(cos(x))', () => {
    expect(rules('sin(cos(x))')).toEqual(['chain', 'cos']);
    expect(out('sin(cos(x))')).toBe('cos(cos(x))*(-sin(x))');
  });
});

describe('general power rule', () => {
  it('handles a variable in both base and exponent', () => {
    expect(rules('x^x')).toEqual(['general-power', 'variable', 'variable']);
    expect(rules('x^sin(x)')[0]).toBe('general-power');
  });
});

describe('trace shape', () => {
  it('starts from the pending derivative and ends with none', () => {
    const d = run('x^2 * sin(3x)');
    expect(toText(d.start)).toBe('d/dx[x^2*sin(3x)]');
    expect(d.steps.map((s) => s.rule)).toEqual(['product', 'power', 'chain', 'constant-multiple', 'variable']);
    expect(hasDeriv(d.result)).toBe(false);
    expect(toText(d.result)).toBe('2x^1*sin(3x) + x^2*(cos(3x)*(3*1))');
  });

  it('shows the whole expression after each step', () => {
    const d = run('x^2 * sin(3x)');
    expect(d.steps.map((s) => toText(s.result))).toEqual([
      'd/dx[x^2]*sin(3x) + x^2*d/dx[sin(3x)]',
      '2x^1*sin(3x) + x^2*d/dx[sin(3x)]',
      '2x^1*sin(3x) + x^2*(cos(3x)*d/dx[3x])',
      '2x^1*sin(3x) + x^2*(cos(3x)*(3*d/dx[x]))',
      '2x^1*sin(3x) + x^2*(cos(3x)*(3*1))',
    ]);
  });

  it('works on the leftmost pending derivative first', () => {
    const d = run('x*x*x');
    expect(toText(d.steps[0]!.from)).toBe('d/dx[x*x*x]');
    expect(d.steps.at(-1)!.rule).toBe('variable');
  });

  it('every rule that appears has a name and formula', () => {
    for (const s of run('x^x + sin(x)/x + sqrt(2x) + tan(x) + 2^x + ln(x) + e^x').steps) {
      expect(DIFF_RULES[s.rule].name).toBeTruthy();
      expect(DIFF_RULES[s.rule].formula).toBeTruthy();
    }
  });

  it('does not mutate its input', () => {
    const e = parse('x^2 * sin(3x)');
    const before = toText(e);
    differentiate(e);
    expect(toText(e)).toBe(before);
  });
});

describe('evaluation of results', () => {
  it('matches known derivatives at a point', () => {
    const at = (src: string, x: number) => evaluate(differentiate(parse(src)).result, { x });
    expect(at('x^3', 2)).toBeCloseTo(12);
    expect(at('sin(x)', 0)).toBeCloseTo(1);
    expect(at('x^2 * sin(3x)', 1)).toBeCloseTo(2 * Math.sin(3) + 3 * Math.cos(3));
    expect(at('ln(x)', 4)).toBeCloseTo(0.25);
    expect(at('x^x', 2)).toBeCloseTo(4 * (Math.log(2) + 1));
  });

  it('refuses to evaluate unresolved derivatives and unbound variables', () => {
    expect(() => evaluate(run('x').start, { x: 1 })).toThrow(/unresolved/);
    expect(() => evaluate(variable('z'), {})).toThrow(/z/);
    expect(evaluate(num(2))).toBe(2);
  });
});
