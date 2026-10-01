import { describe, expect, it } from 'vitest';
import { formatParseError, ParseError, parse } from '../src';

function errorFor(source: string): ParseError {
  try {
    parse(source);
  } catch (err) {
    if (err instanceof ParseError) return err;
    throw err;
  }
  throw new Error(`expected "${source}" to fail`);
}

describe('formatParseError', () => {
  it.each([
    ['x + $', "unexpected character '$'", '    ^'],
    ['', 'empty expression', '^'],
    ['   ', 'empty expression', '^'],
    ['x + 1)', "unmatched ')'", '     ^'],
    ['2(x + 1', "missing ')' for this '('", ' ^'],
    ['x + * 2', "unexpected '*'; expected an expression", '    ^'],
    ['sin()', "expected an expression before ')'", '    ^'],
    ['x +', 'unexpected end of input; expected an expression', '   ^'],
    ['sin x', 'sin needs parentheses, e.g. sin(x)', '^~~'],
    ['x + sqrt x', 'sqrt needs parentheses, e.g. sqrt(x)', '    ^~~~'],
    ['x123', 'unexpected number 123; put an operator before it (for example * or ^)', ' ^~~'],
  ])('formats the error in %j', (source, message, marker) => {
    expect(formatParseError(errorFor(source))).toBe([message, source, marker].join('\n'));
  });

  it('marks a zero-width span with one caret after trailing spaces', () => {
    expect(formatParseError(errorFor('x +  '))).toBe(
      'unexpected end of input; expected an expression\nx +  \n     ^',
    );
  });

  it('preserves tabs in the indentation', () => {
    expect(formatParseError(errorFor('\tx +\t sin x'))).toBe(
      'sin needs parentheses, e.g. sin(x)\n\tx +\t sin x\n\t   \t ^~~',
    );
  });

  it.each(['\n', '\r\n', '\r'])('places the marker under its line with %j line breaks', (newline) => {
    const source = ['x +', '  sin y +', 'z'].join(newline);
    expect(formatParseError(errorFor(source))).toBe(
      ['sin needs parentheses, e.g. sin(x)', 'x +', '  sin y +', '  ^~~', 'z'].join('\n'),
    );
  });

  it('marks the opening parenthesis even when the input ends on another line', () => {
    expect(formatParseError(errorFor('2(x +\n 1'))).toBe(
      ["missing ')' for this '('", '2(x +', ' ^', ' 1'].join('\n'),
    );
  });

  it('marks end of input on a final empty line', () => {
    expect(formatParseError(errorFor('x +\n'))).toBe(
      ['unexpected end of input; expected an expression', 'x +', '', '^'].join('\n'),
    );
  });
});
