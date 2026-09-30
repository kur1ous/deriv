import { add, call, constant, div, mul, neg, num, pow, sub, variable, type Expr } from './ast';
import { ParseError } from './errors';
import { tokenize, type Token } from './tokenizer';

// Binding powers. Implicit multiplication sits with `*` so `1/2x` is (1/2)*x, matching
// left-to-right reading; unary minus binds tighter than `*` but looser than `^`, so
// `-x^2` is -(x^2) while `-2x` is (-2)*x.
const BP = { add: 10, mul: 20, prefix: 25, pow: 30 } as const;

export function parse(src: string): Expr {
  return new Parser(src).parseAll();
}

class Parser {
  private tokens: Token[];
  private i = 0;

  constructor(private src: string) {
    this.tokens = tokenize(src);
  }

  parseAll(): Expr {
    if (this.peek().type === 'eof') throw new ParseError('empty expression', this.src, 0, 0);
    const e = this.expr(0);
    const t = this.peek();
    if (t.type === 'rparen') throw new ParseError("unmatched ')'", this.src, t.pos, t.end);
    if (t.type !== 'eof') throw this.unexpected(t);
    return e;
  }

  private peek(): Token {
    return this.tokens[this.i]!;
  }

  private next(): Token {
    return this.tokens[this.i++]!;
  }

  private unexpected(t: Token): ParseError {
    if (t.type === 'eof') return new ParseError('unexpected end of input', this.src, t.pos, t.pos);
    return new ParseError(`unexpected ${describe(t)}`, this.src, t.pos, t.end);
  }

  private expr(minBp: number): Expr {
    let left = this.prefix();
    for (;;) {
      const t = this.peek();
      if (t.type === 'op') {
        const [lbp, rbp] = infixBp(t.op);
        if (lbp <= minBp) break;
        this.next();
        const right = this.expr(rbp);
        left = build(t.op, left, right);
      } else if (t.type === 'var' || t.type === 'const' || t.type === 'fn' || t.type === 'lparen') {
        if (BP.mul <= minBp) break;
        left = mul(left, this.expr(BP.mul));
      } else if (t.type === 'num') {
        // `2 3` or `x2`: ambiguous between a product and a power, so refuse to guess.
        throw new ParseError(
          `unexpected number ${t.value}; put an operator before it (for example * or ^)`,
          this.src, t.pos, t.end,
        );
      } else {
        break;
      }
    }
    return left;
  }

  private prefix(): Expr {
    const t = this.next();
    switch (t.type) {
      case 'num':
        return num(t.value);
      case 'var':
        return variable(t.name);
      case 'const':
        return constant(t.name);
      case 'fn': {
        const open = this.peek();
        if (open.type !== 'lparen') {
          throw new ParseError(`${t.name} needs parentheses, e.g. ${t.name}(x)`, this.src, t.pos, t.end);
        }
        this.next();
        const arg = this.group(open);
        return call(t.name, arg);
      }
      case 'op':
        if (t.op === '-') return neg(this.expr(BP.prefix));
        if (t.op === '+') return this.expr(BP.prefix);
        throw new ParseError(`unexpected '${t.op}'; expected an expression`, this.src, t.pos, t.end);
      case 'lparen':
        return this.group(t);
      case 'rparen':
        throw new ParseError("expected an expression before ')'", this.src, t.pos, t.end);
      case 'eof':
        throw new ParseError('unexpected end of input; expected an expression', this.src, t.pos, t.pos);
    }
  }

  /** Parse the inside of a parenthesis whose opening token has just been consumed. */
  private group(open: Token): Expr {
    const inner = this.expr(0);
    const close = this.peek();
    if (close.type !== 'rparen') {
      throw new ParseError("missing ')' for this '('", this.src, open.pos, open.end);
    }
    this.next();
    return inner;
  }
}

function infixBp(op: '+' | '-' | '*' | '/' | '^'): [number, number] {
  if (op === '+' || op === '-') return [BP.add, BP.add];
  if (op === '*' || op === '/') return [BP.mul, BP.mul];
  return [BP.pow, BP.pow - 1]; // right-associative
}


function build(op: '+' | '-' | '*' | '/' | '^', l: Expr, r: Expr): Expr {
  switch (op) {
    case '+': return add(l, r);
    case '-': return sub(l, r);
    case '*': return mul(l, r);
    case '/': return div(l, r);
    case '^': return pow(l, r);
  }
}

function describe(t: Token): string {
  switch (t.type) {
    case 'num': return `number ${t.value}`;
    case 'var': return `variable ${t.name}`;
    case 'const': return `constant ${t.name}`;
    case 'fn': return `function ${t.name}`;
    case 'op': return `'${t.op}'`;
    case 'lparen': return "'('";
    case 'rparen': return "')'";
    case 'eof': return 'end of input';
  }
}
