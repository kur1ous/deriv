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
    ['x123', 'unexpected number 123; put an operator before it, e.g. "x*123"', ' ^~~'],
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

describe('parse error suggestions', () => {
  it.each([
    ['x2', 'x*2', 1, 2],
    ['x123', 'x*123', 1, 4],
    ['2 3', '2 *3', 2, 3],
    ['pi2', 'pi*2', 2, 3],
    ['(x+1)2', '(x+1)*2', 5, 6],
    ['sin(x).5', 'sin(x)*.5', 6, 8],
    ['x\n  2', 'x\n  *2', 4, 5],
  ])('suggests an explicit operator for %j', (source, example, pos, end) => {
    const err = errorFor(source);
    expect(err.message).toContain(`put an operator before it, e.g. ${JSON.stringify(example)}`);
    expect(err.message).not.toContain('\n');
    expect(err).toMatchObject({ source, pos, end });
    expect(() => parse(example)).not.toThrow();
  });

  it.each(['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt'])(
    'suggests parentheses for %sx', (fn) => {
      const source = `${fn}x`;
      const example = `${fn}(x)`;
      const err = errorFor(source);
      expect(err.message).toBe(`${fn} needs parentheses, e.g. ${example}`);
      expect(err).toMatchObject({ source, pos: 0, end: fn.length });
      expect(() => parse(example)).not.toThrow();
    },
  );

  it.each([
    ['(x+1)^', 5],
    ['sin(x)^', 6],
    ['(x+1)^ \t', 5],
    ['sin((x+1)^)', 9],
    ['x^', 1],
    ['x^2^', 3],
  ])('asks for the missing exponent in %j', (source, pos) => {
    const err = errorFor(source);
    expect(err.message).toBe("missing exponent after '^'; add an expression, e.g. ^2");
    expect(err).toMatchObject({ source, pos, end: pos + 1 });
    expect(formatParseError(err)).toBe([err.message, source, ' '.repeat(pos) + '^'].join('\n'));
    expect(() => parse(source.slice(0, pos + 1) + '2' + source.slice(pos + 1))).not.toThrow();
  });
});
