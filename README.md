# deriv

A small symbolic differentiation engine that shows its work. Give it `x^2 * sin(3x)` and it
parses it, differentiates it one rule at a time (product rule, chain rule, power rule, ...),
then simplifies the result, recording every rewrite. Rule-based and deterministic: the same
input always produces the same steps.

It is meant for people checking *how* a derivative comes out, not just what it is. A web page
that typesets the steps in KaTeX is planned; for now this is the library.

## Example

```
d/dx[x^2*sin(3x)]
  = d/dx[x^2]*sin(3x) + x^2*d/dx[sin(3x)]      [product rule]
  = 2x^1*sin(3x) + x^2*d/dx[sin(3x)]           [power rule]
  = 2x^1*sin(3x) + x^2*(cos(3x)*d/dx[3x])      [chain rule]
  = 2x^1*sin(3x) + x^2*(cos(3x)*(3*d/dx[x]))   [constant multiple rule]
  = 2x^1*sin(3x) + x^2*(cos(3x)*(3*1))         [variable rule]
  = 2x*sin(3x) + x^2*(cos(3x)*(3*1))           [first power]
  = 2x*sin(3x) + 3x^2*cos(3x)                  [constant folding]

d/dx[x^2*sin(3x)] = 2x*sin(3x) + 3x^2*cos(3x)
```

Each line is the whole expression after one rule was applied to the leftmost pending
`d/dx[...]`, so the trace reads top to bottom like a worked solution.

## Using it

Not on npm yet; clone it and import from `src`.

```ts
import { derive, formatSteps, toLatex } from './src';

const solution = derive('x^2 * sin(3x)');   // derive(text, 'x') differentiates with respect to x

console.log(formatSteps(solution));         // the proof above

solution.result;                            // simplified derivative, an immutable Expr tree
toLatex(solution.result);                   // 2x\sin\left(3x\right) + 3x^{2}\cos\left(3x\right)

for (const step of solution.differentiation.steps) {
  step.rule;     // 'product', 'power', 'chain', ...
  step.detail;   // e.g. "outer: sin(u), inner: u = 3x"
  step.result;   // the whole expression after this step
}
```

The pieces are also usable on their own: `parse`, `differentiate`, `simplify`, `evaluate`,
`toText`, `toLatex`. Bad input throws a `ParseError` carrying the offset of the offending token.
`formatParseError(err)` returns its message and source with a caret under the offending span:

```text
sin needs parentheses, e.g. sin(x)
2sin x
 ^~~
```

## Input

- Operators `+ - * / ^`, unary minus, parentheses. `^` is right-associative and binds tighter
  than unary minus, so `-x^2` is `-(x^2)`.
- Implicit multiplication: `3x`, `2(x+1)`, `(x+1)(x-1)`, `x sin(x)`. It shares precedence with
  `*`, so `1/2x` is `(1/2)x`. A number directly after an operand (`x2`, `2 3`) is rejected
  rather than guessed at.
- Functions `sin cos tan exp ln sqrt`, always with parentheses. Constants `pi` and `e`.
- Every other letter is a variable, one letter each (`xy` is `x*y`). Letters other than the
  one you differentiate by are treated as constants.

## Simplifier

Constant folding, `x + 0`, `x * 1`, `x * 0`, like-term collection, merging powers
(`x * x^2` to `x^3`), cancelling common factors in quotients, and sign clean-up. It does not
check for division by zero, so `x/x` becomes `1`. It does not expand or factor.

## Tests

```
pnpm install
pnpm test
```

Besides unit tests, a property test compares the derivative of a few thousand random
expressions against a central finite difference at random points, and another checks that
simplification never changes an expression's value.

## License

MIT
