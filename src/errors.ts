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

export function formatParseError(err: ParseError): string {
  const lines = err.source.split(/(\r\n|\r|\n)/);
  const output = [err.message];
  let offset = 0;
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i]!;
    output.push(line);
    if (err.pos >= offset && err.pos <= offset + line.length) {
      const column = err.pos - offset;
      const indent = line.slice(0, column).replace(/[^\t]/g, ' ');
      const width = Math.max(1, Math.min(err.end - offset, line.length) - column);
      output.push(`${indent}^${'~'.repeat(width - 1)}`);
    }
    offset += line.length + (lines[i + 1]?.length ?? 0);
  }
  return output.join('\n');
}
