/**
 * The little arithmetic language an expression renderer classifies by: field
 * names, numbers, brackets and `+ - * /` over one feature's properties. The
 * grammar is deliberately the intersection of what QGIS expressions, Mapbox
 * expressions and OGC filter arithmetic each write, so an expression exports to
 * all three without a translation that has to drop a piece.
 *
 * Parsing is total: a malformed expression comes back as a message to show,
 * never as a throw, because the parse happens on the way to the render loop.
 */

export type BinaryOperator = '+' | '-' | '*' | '/';

export type ExpressionNode =
  | { kind: 'number'; value: number }
  | { kind: 'field'; name: string }
  | { kind: 'binary'; operator: BinaryOperator; left: ExpressionNode; right: ExpressionNode };

export type ParsedExpression =
  | { node: ExpressionNode; error: null }
  | { node: null; error: string };

type Token =
  | { type: 'number'; at: number; text: string; value: number }
  | { type: 'field'; at: number; text: string; name: string }
  | { type: 'operator'; at: number; text: string; operator: BinaryOperator }
  | { type: 'open'; at: number; text: string }
  | { type: 'close'; at: number; text: string };

const OPERATORS: BinaryOperator[] = ['+', '-', '*', '/'];
const PRECEDENCE: Record<BinaryOperator, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };

const WHITESPACE = /\s/;
const DIGIT = /[0-9]/;
const NUMBER = /^[0-9]+(\.[0-9]+)?/;
const BARE_FIELD = /^[A-Za-z_][A-Za-z0-9_]*/;

const ENDS_EARLY = 'That expression ends where a value was expected.';
const UNCLOSED_BRACKET = 'That expression leaves a bracket open.';
const UNCLOSED_NAME = 'That expression leaves a quoted field name open.';
const EMPTY = 'That expression is empty.';

const unexpected = (text: string, at: number) =>
  `Unexpected "${text}" at character ${at + 1}: an expression reads field names, numbers, brackets and + - * /.`;

const trailing = (text: string, at: number) =>
  `Unexpected "${text}" at character ${at + 1}: the expression already ended there.`;

function quotedField(text: string, start: number): { name: string; length: number } | null {
  let at = start + 1;
  let name = '';
  while (at < text.length) {
    if (text[at] !== '"') {
      name += text[at];
      at += 1;
      continue;
    }
    if (text[at + 1] === '"') {
      name += '"';
      at += 2;
      continue;
    }
    return { name, length: at + 1 - start };
  }
  return null;
}

function tokenize(text: string): { tokens: Token[]; error: null } | { tokens: null; error: string } {
  const tokens: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const character = text[at];
    if (WHITESPACE.test(character)) {
      at += 1;
      continue;
    }
    if (character === '(' || character === ')') {
      tokens.push({ type: character === '(' ? 'open' : 'close', at, text: character });
      at += 1;
      continue;
    }
    const operator = OPERATORS.find((known) => known === character);
    if (operator) {
      tokens.push({ type: 'operator', at, text: character, operator });
      at += 1;
      continue;
    }
    if (DIGIT.test(character)) {
      const digits = NUMBER.exec(text.slice(at))?.[0] ?? character;
      tokens.push({ type: 'number', at, text: digits, value: Number(digits) });
      at += digits.length;
      continue;
    }
    const bare = BARE_FIELD.exec(text.slice(at))?.[0];
    if (bare) {
      tokens.push({ type: 'field', at, text: bare, name: bare });
      at += bare.length;
      continue;
    }
    if (character === '"') {
      const quoted = quotedField(text, at);
      if (!quoted) return { tokens: null, error: UNCLOSED_NAME };
      tokens.push({ type: 'field', at, text: text.slice(at, at + quoted.length), name: quoted.name });
      at += quoted.length;
      continue;
    }
    return { tokens: null, error: unexpected(character, at) };
  }
  return { tokens, error: null };
}

function parseTokens(tokens: Token[]): ParsedExpression {
  let index = 0;
  let failure: string | null = null;

  const fail = (message: string): null => {
    failure ??= message;
    return null;
  };

  const parseValue = (): ExpressionNode | null => {
    const token = tokens[index];
    if (!token) return fail(ENDS_EARLY);
    if (token.type === 'operator') {
      // unary minus, held as a subtraction from zero so every node maps
      // straight onto an operator the three exchange formats already have
      if (token.operator !== '-') return fail(unexpected(token.text, token.at));
      index += 1;
      const operand = parseValue();
      if (!operand) return null;
      return { kind: 'binary', operator: '-', left: { kind: 'number', value: 0 }, right: operand };
    }
    if (token.type === 'number') {
      index += 1;
      return { kind: 'number', value: token.value };
    }
    if (token.type === 'field') {
      index += 1;
      return { kind: 'field', name: token.name };
    }
    if (token.type === 'close') return fail(unexpected(token.text, token.at));
    index += 1;
    const inner = parseSum();
    if (!inner) return null;
    if (tokens[index]?.type !== 'close') return fail(UNCLOSED_BRACKET);
    index += 1;
    return inner;
  };

  const parseLevel = (
    next: () => ExpressionNode | null,
    operators: BinaryOperator[],
  ): ExpressionNode | null => {
    let left = next();
    while (left) {
      const token = tokens[index];
      if (token?.type !== 'operator' || !operators.includes(token.operator)) break;
      index += 1;
      const right = next();
      if (!right) return null;
      left = { kind: 'binary', operator: token.operator, left, right };
    }
    return left;
  };

  const parseProduct = (): ExpressionNode | null => parseLevel(parseValue, ['*', '/']);
  const parseSum = (): ExpressionNode | null => parseLevel(parseProduct, ['+', '-']);

  const node = parseSum();
  if (failure !== null) return { node: null, error: failure };
  if (!node) return { node: null, error: ENDS_EARLY };
  const rest = tokens[index];
  if (rest) return { node: null, error: trailing(rest.text, rest.at) };
  return { node, error: null };
}

export function parseExpression(text: string): ParsedExpression {
  const tokenized = tokenize(text);
  if (tokenized.tokens === null) return { node: null, error: tokenized.error };
  if (tokenized.tokens.length === 0) return { node: null, error: EMPTY };
  return parseTokens(tokenized.tokens);
}

const APPLY: Record<BinaryOperator, (left: number, right: number) => number> = {
  '+': (left, right) => left + right,
  '-': (left, right) => left - right,
  '*': (left, right) => left * right,
  '/': (left, right) => left / right,
};

/**
 * The expression's value for one feature, or null where it has none: a property
 * the feature lacks or holds something other than a number, or a division that
 * leaves the number line.
 */
export function evaluateExpression(
  node: ExpressionNode,
  properties: GeoJSON.GeoJsonProperties,
): number | null {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'field': {
      const value = properties?.[node.name];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    case 'binary': {
      const left = evaluateExpression(node.left, properties);
      const right = evaluateExpression(node.right, properties);
      if (left === null || right === null) return null;
      const value = APPLY[node.operator](left, right);
      return Number.isFinite(value) ? value : null;
    }
  }
}

function bracketed(node: ExpressionNode, minimum: number): string {
  const text = formatExpression(node);
  if (node.kind !== 'binary') return text;
  return PRECEDENCE[node.operator] < minimum ? `(${text})` : text;
}

/** An expression back as text, bracketed wherever the tree binds tighter than the reading would. */
export function formatExpression(node: ExpressionNode): string {
  if (node.kind === 'number') return String(node.value);
  if (node.kind === 'field') {
    return BARE_FIELD.exec(node.name)?.[0] === node.name
      ? node.name
      : `"${node.name.replace(/"/g, '""')}"`;
  }
  const rank = PRECEDENCE[node.operator];
  // a - (b - c) and a / (b / c) keep the brackets the tree holds
  const rightRank = node.operator === '-' || node.operator === '/' ? rank + 1 : rank;
  return `${bracketed(node.left, rank)} ${node.operator} ${bracketed(node.right, rightRank)}`;
}
