/** A problem in the input text. `pos`/`end` are offsets into `source` (end exclusive). */
export class ParseError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly pos: number,
    readonly end: number = pos + 1,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}
