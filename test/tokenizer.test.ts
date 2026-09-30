import { describe, expect, it } from 'vitest';
import { ParseError } from '../src/errors';
import { tokenize } from '../src/tokenizer';

const kinds = (s: string) =>
  tokenize(s)
    .slice(0, -1)
    .map((t) => (t.type === 'num' ? String(t.value) : t.type === 'op' ? t.op : `${t.type}:${'name' in t ? t.name : ''}`));

describe('tokenizer', () => {
  it('reads numbers, including decimals with a leading dot', () => {
    expect(kinds('3 4.5 .25')).toEqual(['3', '4.5', '0.25']);
  });

  it('splits letter runs into names and single-letter variables', () => {
    expect(kinds('xy')).toEqual(['var:x', 'var:y']);
    expect(kinds('2pix')).toEqual(['2', 'const:pi', 'var:x']);
    expect(kinds('sinx')).toEqual(['fn:sin', 'var:x']);
    expect(kinds('exp(x)')).toEqual(['fn:exp', 'lparen:', 'var:x', 'rparen:']);
    expect(kinds('ex')).toEqual(['const:e', 'var:x']);
  });

  it('records positions', () => {
    const [a, b] = tokenize('  sin(x)');
    expect(a).toMatchObject({ type: 'fn', pos: 2, end: 5 });
    expect(b).toMatchObject({ type: 'lparen', pos: 5 });
  });

  it('always ends with eof', () => {
    expect(tokenize('').map((t) => t.type)).toEqual(['eof']);
  });

  it('rejects unknown characters with their position', () => {
    try {
      tokenize('x + $');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect((err as ParseError).pos).toBe(4);
    }
  });
});
