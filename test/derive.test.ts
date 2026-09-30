import { describe, expect, it } from 'vitest';
import { derive, formatSteps, ParseError, parse, ruleName, toText } from '../src';

describe('derive', () => {
  it('parses, differentiates and simplifies', () => {
    const s = derive('x^2 * sin(3x)');
    expect(toText(s.result)).toBe('2x*sin(3x) + 3x^2*cos(3x)');
    expect(s.differentiation.steps).toHaveLength(5);
    expect(s.simplification.steps.map((t) => ruleName(t))).toEqual(['first power', 'constant folding']);
  });

  it('accepts a parsed expression and another variable', () => {
    const s = derive(parse('t^3 + x'), 't');
    expect(toText(s.result)).toBe('3t^2');
    expect(s.wrt).toBe('t');
  });

  it('lets parse errors through with their location', () => {
    expect(() => derive('2 +')).toThrow(ParseError);
  });
});

describe('formatSteps', () => {
  it('lays the proof out with rules in the margin', () => {
    expect(formatSteps(derive('x^2 * sin(3x)'))).toBe(
      [
        'd/dx[x^2*sin(3x)]',
        '  = d/dx[x^2]*sin(3x) + x^2*d/dx[sin(3x)]      [product rule]',
        '  = 2x^1*sin(3x) + x^2*d/dx[sin(3x)]           [power rule]',
        '  = 2x^1*sin(3x) + x^2*(cos(3x)*d/dx[3x])      [chain rule]',
        '  = 2x^1*sin(3x) + x^2*(cos(3x)*(3*d/dx[x]))   [constant multiple rule]',
        '  = 2x^1*sin(3x) + x^2*(cos(3x)*(3*1))         [variable rule]',
        '  = 2x*sin(3x) + x^2*(cos(3x)*(3*1))           [first power]',
        '  = 2x*sin(3x) + 3x^2*cos(3x)                  [constant folding]',
        '',
        'd/dx[x^2*sin(3x)] = 2x*sin(3x) + 3x^2*cos(3x)',
      ].join('\n'),
    );
  });

  it('can include the remark on how a rule matched', () => {
    const out = formatSteps(derive('sin(3x)'), { details: true });
    expect(out).toContain('outer: sin(u), inner: u = 3x');
  });

  it('handles a constant input', () => {
    expect(formatSteps(derive('7'))).toBe(['d/dx[7]', '  = 0   [constant rule]', '', 'd/dx[7] = 0'].join('\n'));
  });
});
