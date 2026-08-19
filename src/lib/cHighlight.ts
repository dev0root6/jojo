export type TokenType =
  | 'comment'
  | 'preprocessor'
  | 'string'
  | 'number'
  | 'keyword'
  | 'type'
  | 'function'
  | 'punct'
  | 'plain';

export interface Token {
  text: string;
  type: TokenType;
}

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'switch', 'case',
  'default', 'goto', 'sizeof', 'struct', 'union', 'enum', 'typedef', 'static', 'const',
  'extern', 'register', 'volatile', 'auto', 'inline', 'restrict', 'NULL',
]);

const TYPES = new Set([
  'int', 'char', 'float', 'double', 'void', 'long', 'short', 'signed', 'unsigned',
  'bool', 'size_t', 'FILE',
]);

// Order matters: comments and preprocessor lines win over everything inside them,
// and an unterminated string must still consume to end of line rather than
// swallowing the rest of the file.
const RULES: Array<{ type: TokenType; pattern: RegExp }> = [
  { type: 'comment', pattern: /\/\*[\s\S]*?(?:\*\/|$)/y },
  { type: 'comment', pattern: /\/\/[^\n]*/y },
  { type: 'preprocessor', pattern: /#[^\n]*/y },
  { type: 'string', pattern: /"(?:\\.|[^"\\\n])*"?/y },
  { type: 'string', pattern: /'(?:\\.|[^'\\\n])*'?/y },
  { type: 'number', pattern: /\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)[uUlLfF]*/y },
  { type: 'plain', pattern: /[A-Za-z_]\w*/y },
  { type: 'plain', pattern: /\s+/y },
  { type: 'punct', pattern: /[{}()[\];,.<>+\-*/%=!&|^~?:]+/y },
];

/**
 * Splits C source into coloured spans.
 *
 * Every character of the input lands in exactly one token, so joining the
 * token texts reproduces the source byte for byte — the highlight layer sits
 * behind the textarea and would drift out of alignment otherwise.
 */
export function tokenizeC(code: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < code.length) {
    let matched = false;

    for (const rule of RULES) {
      rule.pattern.lastIndex = index;
      const found = rule.pattern.exec(code);
      if (!found || !found[0]) continue;

      let { type } = rule;
      const text = found[0];

      if (type === 'plain' && /^[A-Za-z_]/.test(text)) {
        if (KEYWORDS.has(text)) type = 'keyword';
        else if (TYPES.has(text)) type = 'type';
        else if (isCallAt(code, index + text.length)) type = 'function';
      }

      push(tokens, text, type);
      index += text.length;
      matched = true;
      break;
    }

    // Nothing claimed this character; keep it so the text stays intact.
    if (!matched) {
      push(tokens, code[index], 'plain');
      index += 1;
    }
  }

  return tokens;
}

/** An identifier followed by "(" reads as a call, e.g. printf(. */
function isCallAt(code: string, from: number): boolean {
  let cursor = from;
  while (cursor < code.length && (code[cursor] === ' ' || code[cursor] === '\t')) cursor += 1;
  return code[cursor] === '(';
}

/** Merges runs of the same type so the DOM stays small. */
function push(tokens: Token[], text: string, type: TokenType) {
  const last = tokens[tokens.length - 1];
  if (last && last.type === type) last.text += text;
  else tokens.push({ text, type });
}
