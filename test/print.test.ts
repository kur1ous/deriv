import { describe, expect, it } from 'vitest';
import { add, deriv, div, mul, neg, num, pow, sub, variable } from '../src/ast';
import { parse } from '../src/parser';
import { toLatex, toText } from '../src/print';
import { mulberry32, randomExpr } from './gen';
import { sexp } from './helpers';

const tex = (s: string) => toLatex(parse(s));
const txt = (s: string) => toText(parse(s));

describe('toLatex', () => {
  it('prints atoms and simple products without noise', () => {
    expect(tex('x')).toBe('x');
    expect(tex('3x')).toBe('3x');
    expect(tex('2pi x')).toBe('2\\pi x');
    expect(tex('x^2 sin(3x)')).toBe('x^{2}\\sin\\left(3x\\right)');
  });

  it('adds parentheses only where precedence needs them', () => {
    expect(tex('(x+1)^2')).toBe('\\left(x + 1\\right)^{2}');
    expect(tex('2(x+1)')).toBe('2\\left(x + 1\\right)');
    expect(tex('a - (b - c)')).toBe('a - \\left(b - c\\right)');
    expect(tex('a - b - c')).toBe('a - b - c');
    expect(tex('a + (b + c)')).toBe('a + b + c');
    expect(tex('a*(b*c)')).toBe('abc');
    expect(tex('(a+b)(c+d)')).toBe('\\left(a + b\\right)\\cdot \\left(c + d\\right)');
  });

  it('uses fractions and never parenthesizes their contents', () => {
    expect(tex('(x+1)/(x-1)')).toBe('\\frac{x + 1}{x - 1}');
    expect(tex('1/x^2')).toBe('\\frac{1}{x^{2}}');
    expect(tex('a/b/c')).toBe('\\frac{\\frac{a}{b}}{c}');
  });

  it('handles signs', () => {
    expect(tex('-x^2')).toBe('-x^{2}');
    expect(tex('(-x)^2')).toBe('\\left(-x\\right)^{2}');
    expect(tex('-(a+b)')).toBe('-\\left(a + b\\right)');
    expect(tex('2^-x')).toBe('2^{-x}');
    expect(tex('a - -b')).toBe('a - \\left(-b\\right)');
    expect(tex('a*(-b)')).toBe('a\\cdot \\left(-b\\right)');
    expect(tex('-2x')).toBe('-2x');
  });

  it('puts an explicit dot between adjacent numbers', () => {
    expect(toLatex(mul(num(2), num(3)))).toBe('2\\cdot 3');
    expect(toLatex(mul(num(2), pow(num(3), variable('x'))))).toBe('2\\cdot 3^{x}');
    expect(toLatex(mul(variable('x'), num(3)))).toBe('x\\cdot 3');
  });

  it('writes function powers the way textbooks do', () => {
    expect(tex('sin(x)^2')).toBe('\\sin^{2}\\left(x\\right)');
    expect(tex('sin(x)^x')).toBe('\\left(\\sin\\left(x\\right)\\right)^{x}');
    expect(tex('sqrt(x+1)')).toBe('\\sqrt{x + 1}');
    expect(tex('exp(2x)')).toBe('\\exp\\left(2x\\right)');
    expect(tex('ln(x)')).toBe('\\ln\\left(x\\right)');
  });

  it('prints pending derivatives', () => {
    const e = mul(deriv(pow(variable('x'), num(2))), variable('y'));
    expect(toLatex(e)).toBe('\\frac{d}{dx}\\left[x^{2}\\right]\\cdot y');
    expect(toLatex(pow(deriv(variable('x'), 't'), num(2)))).toBe('\\left(\\frac{d}{dt}\\left[x\\right]\\right)^{2}');
  });

  it('prints negative literals as parenthesized operands', () => {
    expect(toLatex(add(variable('x'), num(-2)))).toBe('x + \\left(-2\\right)');
    expect(toLatex(pow(num(-2), variable('x')))).toBe('\\left(-2\\right)^{x}');
  });
});

describe('toText', () => {
  it('writes the textbook form for small products', () => {
    expect(txt('3x')).toBe('3x');
    expect(txt('3 * 4')).toBe('3*4');
    expect(txt('x * y')).toBe('x*y');
    expect(txt('2(x+1)')).toBe('2(x + 1)');
    expect(txt('x^2 * sin(3x)')).toBe('x^2*sin(3x)');
  });

  it('keeps grouping that changes meaning', () => {
    expect(txt('a - (b + c)')).toBe('a - (b + c)');
    expect(txt('a/(b*c)')).toBe('a/(b*c)');
    expect(txt('(a^b)^c')).toBe('(a^b)^c');
    expect(txt('a^(b^c)')).toBe('a^b^c');
    expect(txt('-x^2')).toBe('-x^2');
    expect(txt('(-x)^2')).toBe('(-x)^2');
    expect(txt('2^-x')).toBe('2^(-x)');
  });

  it('prints pending derivatives', () => {
    expect(toText(add(deriv(variable('x')), num(1)))).toBe('d/dx[x] + 1');
    expect(toText(neg(deriv(variable('x'), 't')))).toBe('-d/dt[x]');
  });

  it('renders derivative-shaped output the way a student would write it', () => {
    expect(toText(div(mul(num(2), variable('x')), sub(variable('x'), num(1))))).toBe('2x/(x - 1)');
  });

  it('re-parses to the same tree for random expressions', () => {
    const rng = mulberry32(2024);
    for (let i = 0; i < 400; i++) {
      const e = randomExpr(rng, 5, { variableExponents: true });
      const s = toText(e);
      expect(sexp(parse(s)), s).toBe(sexp(e));
    }
  });
});
