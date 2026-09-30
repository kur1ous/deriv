import { describe, expect, it } from 'vitest';
import {
  add, call, constant, deriv, equals, hasDeriv, isConstantIn, mapChildren, mul, neg, num, pow, variable,
} from '../src/ast';

const x = variable('x');

describe('ast', () => {
  it('builds frozen nodes', () => {
    const e = add(x, num(1));
    expect(Object.isFrozen(e)).toBe(true);
    expect(() => {
      (e as { kind: string }).kind = 'sub';
    }).toThrow();
  });

  it('compares structurally', () => {
    expect(equals(mul(num(2), x), mul(num(2), x))).toBe(true);
    expect(equals(mul(num(2), x), mul(x, num(2)))).toBe(false);
    expect(equals(call('sin', x), call('cos', x))).toBe(false);
    expect(equals(deriv(x, 'x'), deriv(x, 't'))).toBe(false);
    expect(equals(constant('e'), variable('e'))).toBe(false);
  });

  it('mapChildren keeps identity when nothing changes', () => {
    const e = pow(add(x, num(1)), num(2));
    expect(mapChildren(e, (c) => c)).toBe(e);
    const r = mapChildren(e, () => num(0));
    expect(equals(r, pow(num(0), num(0)))).toBe(true);
  });

  it('knows which variables an expression depends on', () => {
    const e = mul(variable('a'), call('sin', x));
    expect(isConstantIn(e, 'x')).toBe(false);
    expect(isConstantIn(e, 'y')).toBe(true);
    expect(isConstantIn(neg(constant('pi')), 'x')).toBe(true);
  });

  it('finds pending derivatives', () => {
    expect(hasDeriv(add(x, deriv(x)))).toBe(true);
    expect(hasDeriv(add(x, num(1)))).toBe(false);
  });
});
