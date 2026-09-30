import { describe, expect, it } from 'vitest';
import { ParseError } from '../src/errors';
import { parse } from '../src/parser';
import { sexp } from './helpers';

const p = (s: string) => sexp(parse(s));

describe('precedence and associativity', () => {
  it('multiplies before adding', () => {
    expect(p('1 + 2 * 3')).toBe('(+ 1 (* 2 3))');
    expect(p('1 * 2 + 3')).toBe('(+ (* 1 2) 3)');
  });

  it('subtraction and division are left-associative', () => {
    expect(p('a - b - c')).toBe('(- (- a b) c)');
    expect(p('a / b / c')).toBe('(/ (/ a b) c)');
  });

  it('power is right-associative and binds tighter than unary minus', () => {
    expect(p('x^2^3')).toBe('(^ x (^ 2 3))');
    expect(p('-x^2')).toBe('(neg (^ x 2))');
    expect(p('(-x)^2')).toBe('(^ (neg x) 2)');
  });

  it('allows a sign in the exponent', () => {
    expect(p('2^-x')).toBe('(^ 2 (neg x))');
    expect(p('x^-2 * 3')).toBe('(* (^ x (neg 2)) 3)');
  });

  it('handles stacked and doubled signs', () => {
    expect(p('--x')).toBe('(neg (neg x))');
    expect(p('a - -b')).toBe('(- a (neg b))');
    expect(p('+x')).toBe('x');
    expect(p('3 * -x')).toBe('(* 3 (neg x))');
  });
});

describe('implicit multiplication', () => {
  it('number followed by variable or group', () => {
    expect(p('3x')).toBe('(* 3 x)');
    expect(p('2(x+1)')).toBe('(* 2 (+ x 1))');
    expect(p('3x^2')).toBe('(* 3 (^ x 2))');
  });

  it('group next to group, and variable next to group', () => {
    expect(p('(x+1)(x-1)')).toBe('(* (+ x 1) (- x 1))');
    expect(p('x(x+1)')).toBe('(* x (+ x 1))');
  });

  it('chains of letters', () => {
    expect(p('3xy')).toBe('(* (* 3 x) y)');
    expect(p('2xy^2')).toBe('(* (* 2 x) (^ y 2))');
  });

  it('works with functions and constants on either side', () => {
    expect(p('x sin(x)')).toBe('(* x (sin x))');
    expect(p('sin(x)cos(x)')).toBe('(* (sin x) (cos x))');
    expect(p('2pi x')).toBe('(* (* 2 pi) x)');
    expect(p('x^2 sin(3x)')).toBe('(* (^ x 2) (sin (* 3 x)))');
  });

  it('shares precedence with * so 1/2x is (1/2)x', () => {
    expect(p('1/2x')).toBe('(* (/ 1 2) x)');
    expect(p('x/2y')).toBe('(* (/ x 2) y)');
  });

  it('power binds tighter than the implicit product on its left', () => {
    expect(p('2x^2y')).toBe('(* (* 2 (^ x 2)) y)');
    expect(p('x^2(x+1)')).toBe('(* (^ x 2) (+ x 1))');
  });

  it('unary minus takes only the next factor', () => {
    expect(p('-2x')).toBe('(* (neg 2) x)');
    expect(p('-x sin(x)')).toBe('(* (neg x) (sin x))');
  });

  it('subtraction is never treated as implicit multiplication', () => {
    expect(p('2 -x')).toBe('(- 2 x)');
    expect(p('x -(1)')).toBe('(- x 1)');
  });
});

describe('functions and constants', () => {
  it('parses each function', () => {
    for (const f of ['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt']) {
      expect(p(`${f}(x)`)).toBe(`(${f} x)`);
    }
  });

  it('nests calls and puts powers outside them', () => {
    expect(p('sin(cos(x))')).toBe('(sin (cos x))');
    expect(p('sin(x)^2')).toBe('(^ (sin x) 2)');
    expect(p('e^(2x)')).toBe('(^ e (* 2 x))');
  });

  it('reads e and pi as constants, not variables', () => {
    expect(parse('e').kind).toBe('const');
    expect(parse('pi').kind).toBe('const');
    expect(parse('x').kind).toBe('var');
  });

  it('tolerates whitespace and redundant parentheses', () => {
    expect(p('  ( ( x ) )  ')).toBe('x');
    expect(p('sin ( x )')).toBe('(sin x)');
  });
});

describe('errors', () => {
  function fail(src: string): ParseError {
    try {
      parse(src);
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      return err as ParseError;
    }
    throw new Error(`expected "${src}" to fail`);
  }

  it('reports the offending span', () => {
    const e = fail('x + * 2');
    expect(e.pos).toBe(4);
    expect(e.message).toMatch(/expected an expression/);
  });

  it('points at the unclosed parenthesis', () => {
    const e = fail('2(x + 1');
    expect(e.pos).toBe(1);
    expect(e.message).toMatch(/missing '\)'/);
  });

  it('flags an unmatched closing parenthesis', () => {
    expect(fail('x + 1)').pos).toBe(5);
  });

  it('refuses to guess between x2 and x*2', () => {
    const e = fail('x2');
    expect(e.pos).toBe(1);
    expect(e.message).toMatch(/operator/);
    fail('2 3');
  });

  it('asks for parentheses after a function name', () => {
    const e = fail('sin x');
    expect(e.message).toBe('sin needs parentheses, e.g. sin(x)');
    expect([e.pos, e.end]).toEqual([0, 3]);
  });

  it('rejects empty input, empty groups and trailing operators', () => {
    expect(fail('').message).toBe('empty expression');
    expect(fail('   ').message).toBe('empty expression');
    fail('sin()');
    fail('()');
    expect(fail('2 +').message).toMatch(/end of input/);
    fail('x^');
    fail('*x');
    fail('x**2');
  });
});
