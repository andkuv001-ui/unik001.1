export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  startIndex: number;
  endIndex: number;
}

export interface SpintaxStats {
  choiceBlocks: number;
  shuffleBlocks: number;
  paragraphShuffles: number;
  macrosCount: number;
  columnRefs: string[];
  estimatedCombinations: bigint;
  formattedCombinations: string;
}

export type HighlightTokenType =
  | 'text'
  | 'choice-bracket'
  | 'choice-pipe'
  | 'shuffle-bracket'
  | 'shuffle-sep'
  | 'shuffle-pipe'
  | 'column'
  | 'macro'
  | 'art-wrap'
  | 'strong-tag'
  | 'error';

export interface HighlightToken {
  type: HighlightTokenType;
  value: string;
  start: number;
  end: number;
  depth?: number;
}

export interface RenderOptions {
  columns: Record<string, string>;
  now?: Date;
}

function getLineAndCol(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: index - lastNewline };
}

function formatDateRu(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function generateRandomArticle(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `v-${num}`;
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function factorialBigInt(n: number): bigint {
  if (n <= 1) return 1n;
  const capped = Math.min(n, 20);
  let res = 1n;
  for (let i = 2; i <= capped; i++) {
    res *= BigInt(i);
  }
  return res;
}

export function formatCombinationsCount(count: bigint): string {
  if (count <= 1n) return '1 вариант';
  if (count < 1_000_000n) {
    return `${count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} вар.`;
  }
  if (count < 1_000_000_000n) {
    const millions = Number(count / 100_000n) / 10;
    return `> ${millions.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн вар.`;
  }
  if (count < 1_000_000_000_000n) {
    const billions = Number(count / 100_000_000n) / 10;
    return `> ${billions.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млрд вар.`;
  }
  return '> 1 трлн вар.';
}

/**
 * Extracts shuffle separator syntax at the beginning of a [...] block content:
 * e.g., "+,+ item1 | item2" or "+\n+ item1 | item2"
 */
function parseShuffleSeparator(inner: string): {
  separator: string;
  body: string;
  hasExplicitSep: boolean;
  isParagraph: boolean;
} {
  if (inner.startsWith('+')) {
    const closingPlus = inner.indexOf('+', 1);
    if (closingPlus > 0 && closingPlus <= 24) {
      const rawSep = inner.slice(1, closingPlus);
      const isParagraph = rawSep.includes('\\n') || rawSep.includes('\n');
      let decodedSep = rawSep.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
      // Match user's exact specification: [+,+ 1 | 2 | 3 | 4 ] -> "2, 4, 1, 3"
      if (decodedSep === ',' || decodedSep === ';') {
        decodedSep = `${decodedSep} `;
      }
      const body = inner.slice(closingPlus + 1);
      return {
        separator: decodedSep,
        body,
        hasExplicitSep: true,
        isParagraph,
      };
    }
  }
  return {
    separator: '',
    body: inner,
    hasExplicitSep: false,
    isParagraph: false,
  };
}

/**
 * Splits a block body by top-level '|' ignoring nested {...} and [...]
 */
function splitTopLevelOptions(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let curlyDepth = 0;
  let squareDepth = 0;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '{') {
      curlyDepth++;
      current += ch;
    } else if (ch === '}') {
      if (curlyDepth > 0) curlyDepth--;
      current += ch;
    } else if (ch === '[') {
      squareDepth++;
      current += ch;
    } else if (ch === ']') {
      if (squareDepth > 0) squareDepth--;
      current += ch;
    } else if (ch === '|' && curlyDepth === 0 && squareDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Finds the matching closing bracket for an opening '{' or '[' at startIndex
 */
function findMatchingBracket(text: string, startIndex: number): number {
  const openChar = text[startIndex];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;

  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === openChar) {
      depth++;
    } else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Evaluates a spintax template into a single randomized buyer-facing string.
 * Supports:
 * - {a|b|c}
 * - [a|b|c]
 * - [+\n+ a|b|c]
 * - [+,+ a|b|c] (or any [+sep+ ...])
 * - (ColumnName)
 * - %дата%, %дата+N%, %дата-N%
 * - %арт%, %art%
 * - #арт#...#арт# (removes all whitespace inside after evaluating inner spintax)
 * - <strong>...</strong> (preserved for safe rendering)
 */
export function evaluateSpintax(template: string, options: RenderOptions): string {
  const now = options.now ?? new Date();
  const columnsLookup = new Map<string, string>();
  for (const [key, value] of Object.entries(options.columns)) {
    const cleanKey = key.trim().toLowerCase();
    if (cleanKey) {
      columnsLookup.set(cleanKey, value);
    }
  }

  function evalChunk(input: string, depth: number): string {
    if (depth > 30) return input;
    let output = '';
    let i = 0;

    while (i < input.length) {
      // Handle #арт# ... #арт# compact article block
      if (input.slice(i, i + 5).toLowerCase() === '#арт#') {
        const lowerRest = input.slice(i + 5).toLowerCase();
        const closeRel = lowerRest.indexOf('#арт#');
        if (closeRel !== -1) {
          const inner = input.slice(i + 5, i + 5 + closeRel);
          const evaluatedInner = evalChunk(inner, depth + 1);
          output += evaluatedInner.replace(/\s+/g, '');
          i = i + 5 + closeRel + 5;
          continue;
        }
      }

      const ch = input[i];

      // Choice block {a|b|c}
      if (ch === '{') {
        const end = findMatchingBracket(input, i);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          const choices = splitTopLevelOptions(inner);
          const picked = choices[Math.floor(Math.random() * choices.length)] ?? '';
          output += evalChunk(picked, depth + 1);
          i = end + 1;
          continue;
        }
      }

      // Shuffle block [a|b|c] or [+sep+ a|b|c]
      if (ch === '[') {
        const end = findMatchingBracket(input, i);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          const { separator, body } = parseShuffleSeparator(inner);
          const rawItems = splitTopLevelOptions(body);
          const evaluatedItems = rawItems
            .map((item) => evalChunk(item.trim(), depth + 1).trim())
            .filter((item) => item.length > 0);
          const shuffled = shuffleArray(evaluatedItems);
          output += shuffled.join(separator);
          i = end + 1;
          continue;
        }
      }

      // Macros: %дата%, %дата+N%, %дата-N%, %арт%, %art%
      if (ch === '%') {
        const dateMatch = input.slice(i).match(/^%дата(?:\s*([+-])\s*(\d+))?%/i);
        if (dateMatch) {
          const sign = dateMatch[1];
          const days = dateMatch[2] ? Number(dateMatch[2]) : 0;
          const targetDate = new Date(now.getTime());
          if (sign === '+') {
            targetDate.setDate(targetDate.getDate() + days);
          } else if (sign === '-') {
            targetDate.setDate(targetDate.getDate() - days);
          }
          output += formatDateRu(targetDate);
          i += dateMatch[0].length;
          continue;
        }

        const artMatch = input.slice(i).match(/^%(?:арт|art)%/i);
        if (artMatch) {
          output += generateRandomArticle();
          i += artMatch[0].length;
          continue;
        }
      }

      // Column placeholders: (Название столбика)
      if (ch === '(') {
        const closeParen = input.indexOf(')', i + 1);
        if (closeParen !== -1 && closeParen - i <= 60) {
          const colName = input.slice(i + 1, closeParen);
          if (!colName.includes('\n') && !colName.includes('(')) {
            const mapped = columnsLookup.get(colName.trim().toLowerCase());
            if (mapped !== undefined) {
              output += mapped;
              i = closeParen + 1;
              continue;
            }
          }
        }
      }

      output += ch;
      i++;
    }

    return output;
  }

  return evalChunk(template, 0);
}

/**
 * Validates spintax syntax, detects unclosed/mismatched brackets, unclosed #арт#,
 * unclosed <strong> tags, and computes combinatorics + token stats.
 */
export function analyzeSpintax(
  template: string,
  knownColumns: string[] = []
): {
  issues: ValidationIssue[];
  stats: SpintaxStats;
  errorIndices: Set<number>;
} {
  const issues: ValidationIssue[] = [];
  const errorIndices = new Set<number>();

  interface StackItem {
    char: '{' | '[';
    index: number;
  }
  const stack: StackItem[] = [];

  let choiceBlocks = 0;
  let shuffleBlocks = 0;
  let paragraphShuffles = 0;
  let macrosCount = 0;
  const columnRefsSet = new Set<string>();
  const knownColLower = new Set(knownColumns.map((c) => c.trim().toLowerCase()));

  // 1. Validate brackets { } and [ ]
  for (let i = 0; i < template.length; i++) {
    const ch = template[i];
    if (ch === '{' || ch === '[') {
      stack.push({ char: ch, index: i });
      if (ch === '[') {
        const nextPlus = template[i + 1] === '+';
        if (nextPlus) {
          const closingPlus = template.indexOf('+', i + 2);
          const nextCloseBracket = template.indexOf(']', i + 1);
          if (closingPlus === -1 || (nextCloseBracket !== -1 && closingPlus > nextCloseBracket)) {
            const loc = getLineAndCol(template, i);
            issues.push({
              severity: 'error',
              message: 'Незакрытый разделитель [+...+ в блоке перемешивания',
              line: loc.line,
              column: loc.column,
              startIndex: i,
              endIndex: i + 2,
            });
            errorIndices.add(i);
            errorIndices.add(i + 1);
          }
        }
      }
    } else if (ch === '}' || ch === ']') {
      const expectedOpen = ch === '}' ? '{' : '[';
      if (stack.length === 0) {
        const loc = getLineAndCol(template, i);
        issues.push({
          severity: 'error',
          message: `Лишняя закрывающая скобка «${ch}» без открывающей «${expectedOpen}»`,
          line: loc.line,
          column: loc.column,
          startIndex: i,
          endIndex: i + 1,
        });
        errorIndices.add(i);
      } else {
        const top = stack[stack.length - 1];
        if (top.char !== expectedOpen) {
          const loc = getLineAndCol(template, i);
          const openLoc = getLineAndCol(template, top.index);
          issues.push({
            severity: 'error',
            message: `Несоответствие скобок: открыта «${top.char}» (стр. ${openLoc.line}), а закрывается «${ch}»`,
            line: loc.line,
            column: loc.column,
            startIndex: i,
            endIndex: i + 1,
          });
          errorIndices.add(i);
          errorIndices.add(top.index);
          // Pop mismatched top if matching exists deeper, otherwise keep going
          const matchIdx = [...stack].reverse().findIndex((s) => s.char === expectedOpen);
          if (matchIdx !== -1) {
            const actualIdx = stack.length - 1 - matchIdx;
            stack.splice(actualIdx, 1);
          }
        } else {
          stack.pop();
          const inner = template.slice(top.index + 1, i);
          if (top.char === '{') {
            choiceBlocks++;
            if (!inner.trim()) {
              const loc = getLineAndCol(template, top.index);
              issues.push({
                severity: 'warning',
                message: 'Пустой блок выбора {}',
                line: loc.line,
                column: loc.column,
                startIndex: top.index,
                endIndex: i + 1,
              });
            } else if (!inner.includes('|')) {
              const loc = getLineAndCol(template, top.index);
              issues.push({
                severity: 'warning',
                message: 'В блоке {...} нет разделителя «|» — всегда будет один вариант',
                line: loc.line,
                column: loc.column,
                startIndex: top.index,
                endIndex: i + 1,
              });
            }
          } else {
            shuffleBlocks++;
            const parsed = parseShuffleSeparator(inner);
            if (parsed.isParagraph) paragraphShuffles++;
            if (!parsed.body.trim()) {
              const loc = getLineAndCol(template, top.index);
              issues.push({
                severity: 'warning',
                message: 'Пустой блок перемешивания []',
                line: loc.line,
                column: loc.column,
                startIndex: top.index,
                endIndex: i + 1,
              });
            }
          }
        }
      }
    }
  }

  for (const unclosed of stack) {
    const loc = getLineAndCol(template, unclosed.index);
    const expectedClose = unclosed.char === '{' ? '}' : ']';
    issues.push({
      severity: 'error',
      message: `Незакрытая скобка «${unclosed.char}» — ожидается «${expectedClose}»`,
      line: loc.line,
      column: loc.column,
      startIndex: unclosed.index,
      endIndex: unclosed.index + 1,
    });
    errorIndices.add(unclosed.index);
  }

  // 2. Validate #арт# pairs
  const artMatches = [...template.matchAll(/#арт#/gi)];
  if (artMatches.length % 2 !== 0) {
    const lastMatch = artMatches[artMatches.length - 1];
    const idx = lastMatch.index ?? 0;
    const loc = getLineAndCol(template, idx);
    issues.push({
      severity: 'error',
      message: 'Незакрытый тег #арт# — добавьте парный закрывающий #арт#',
      line: loc.line,
      column: loc.column,
      startIndex: idx,
      endIndex: idx + 5,
    });
    for (let k = idx; k < idx + 5; k++) errorIndices.add(k);
  }

  // 3. Validate <strong> ... </strong> pairs
  const strongStack: number[] = [];
  const strongRegex = /<\/?strong>/gi;
  let strongMatch: RegExpExecArray | null;
  while ((strongMatch = strongRegex.exec(template)) !== null) {
    const isClosing = strongMatch[0].startsWith('</');
    const idx = strongMatch.index;
    if (!isClosing) {
      strongStack.push(idx);
    } else if (strongStack.length === 0) {
      const loc = getLineAndCol(template, idx);
      issues.push({
        severity: 'error',
        message: 'Лишний закрывающий тег </strong> без открывающего <strong>',
        line: loc.line,
        column: loc.column,
        startIndex: idx,
        endIndex: idx + strongMatch[0].length,
      });
      for (let k = idx; k < idx + strongMatch[0].length; k++) errorIndices.add(k);
    } else {
      strongStack.pop();
    }
  }
  for (const unclosedStrong of strongStack) {
    const loc = getLineAndCol(template, unclosedStrong);
    issues.push({
      severity: 'error',
      message: 'Незакрытый тег <strong> — добавьте </strong>',
      line: loc.line,
      column: loc.column,
      startIndex: unclosedStrong,
      endIndex: unclosedStrong + 8,
    });
    for (let k = unclosedStrong; k < unclosedStrong + 8; k++) errorIndices.add(k);
  }

  // 4. Count macros & detect column placeholders
  const macroMatches = template.match(/%(?:дата(?:\s*[+-]\s*\d+)?|арт|art)%/gi);
  macrosCount = macroMatches ? macroMatches.length : 0;

  const isLikelyColumn = (rawName: string): boolean => {
    const trimmed = rawName.trim();
    if (!trimmed || trimmed.length > 36) return false;
    if (knownColLower.has(trimmed.toLowerCase())) return true;
    // Match short column names like (Цвет), (Название столбика), (Материал), skipping phone codes (999) or sentences
    if (!/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_\- ]{0,35}$/.test(trimmed)) return false;
    const words = trimmed.split(/\s+/);
    if (words.length > 3) return false;
    // Skip common Russian parenthetical abbreviations/units like (шт), (см), (мм), (кг), (г), (м), (м2), (м3), (руб), (₽)
    const unitBlacklist = new Set(['шт', 'см', 'мм', 'кг', 'г', 'м', 'м2', 'м3', 'руб', 'л', 'вт', 'квт', 'ч', 'мин', 'сек', 'дн', 'мес', 'гг', 'тд', 'тп', 'др', 'пр']);
    if (unitBlacklist.has(trimmed.toLowerCase())) return false;
    return true;
  };

  const parenRegex = /\(([^()\n]{1,48})\)/g;
  let parenMatch: RegExpExecArray | null;
  while ((parenMatch = parenRegex.exec(template)) !== null) {
    const name = parenMatch[1].trim();
    if (isLikelyColumn(name)) {
      columnRefsSet.add(name);
    }
  }

  // 5. Compute combinatorics (recursive estimate, capped to avoid huge BigInt perf issues)
  const CAP = 1_000_000_000_000_000n;
  function countCombinations(input: string, depth: number): bigint {
    if (depth > 16) return 1n;
    let total = 1n;
    let i = 0;
    while (i < input.length && total < CAP) {
      const ch = input[i];
      if (ch === '{') {
        const end = findMatchingBracket(input, i);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          const options = splitTopLevelOptions(inner);
          let sum = 0n;
          for (const opt of options) {
            sum += countCombinations(opt, depth + 1);
            if (sum >= CAP) {
              sum = CAP;
              break;
            }
          }
          total *= sum > 0n ? sum : 1n;
          i = end + 1;
          continue;
        }
      } else if (ch === '[') {
        const end = findMatchingBracket(input, i);
        if (end !== -1) {
          const inner = input.slice(i + 1, end);
          const { body } = parseShuffleSeparator(inner);
          const items = splitTopLevelOptions(body);
          let prod = factorialBigInt(items.length);
          for (const item of items) {
            prod *= countCombinations(item, depth + 1);
            if (prod >= CAP) {
              prod = CAP;
              break;
            }
          }
          total *= prod > 0n ? prod : 1n;
          i = end + 1;
          continue;
        }
      }
      i++;
    }
    return total > CAP ? CAP : total;
  }

  const hasErrors = issues.some((iss) => iss.severity === 'error');
  const estimatedCombinations = hasErrors ? 1n : countCombinations(template, 0);

  issues.sort((a, b) => a.startIndex - b.startIndex);

  return {
    issues,
    errorIndices,
    stats: {
      choiceBlocks,
      shuffleBlocks,
      paragraphShuffles,
      macrosCount,
      columnRefs: Array.from(columnRefsSet),
      estimatedCombinations,
      formattedCombinations: formatCombinationsCount(estimatedCombinations),
    },
  };
}

/**
 * Tokenizes template for syntax highlighting in the editor overlay.
 */
export function tokenizeSpintax(
  template: string,
  errorIndices: Set<number>,
  knownColumns: string[] = []
): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  const bracketStack: Array<'{' | '['> = [];
  const knownColLower = new Set(knownColumns.map((c) => c.trim().toLowerCase()));

  let i = 0;
  let bufferStart = 0;

  const flushText = (end: number) => {
    if (end > bufferStart) {
      tokens.push({
        type: 'text',
        value: template.slice(bufferStart, end),
        start: bufferStart,
        end,
      });
    }
  };

  while (i < template.length) {
    // Error character
    if (errorIndices.has(i)) {
      flushText(i);
      let end = i + 1;
      while (end < template.length && errorIndices.has(end)) end++;
      tokens.push({
        type: 'error',
        value: template.slice(i, end),
        start: i,
        end,
      });
      i = end;
      bufferStart = i;
      continue;
    }

    // #арт#
    if (template.slice(i, i + 5).toLowerCase() === '#арт#') {
      flushText(i);
      tokens.push({
        type: 'art-wrap',
        value: template.slice(i, i + 5),
        start: i,
        end: i + 5,
      });
      i += 5;
      bufferStart = i;
      continue;
    }

    // <strong> or </strong>
    const strongMatch = template.slice(i).match(/^<\/?strong>/i);
    if (strongMatch) {
      flushText(i);
      tokens.push({
        type: 'strong-tag',
        value: strongMatch[0],
        start: i,
        end: i + strongMatch[0].length,
      });
      i += strongMatch[0].length;
      bufferStart = i;
      continue;
    }

    // %дата%, %дата+N%, %арт%, %art%
    if (template[i] === '%') {
      const macroMatch = template.slice(i).match(/^%(?:дата(?:\s*[+-]\s*\d+)?|арт|art)%/i);
      if (macroMatch) {
        flushText(i);
        tokens.push({
          type: 'macro',
          value: macroMatch[0],
          start: i,
          end: i + macroMatch[0].length,
        });
        i += macroMatch[0].length;
        bufferStart = i;
        continue;
      }
    }

    // (Название столбика)
    if (template[i] === '(') {
      const closeParen = template.indexOf(')', i + 1);
      if (closeParen !== -1 && closeParen - i <= 40) {
        const inner = template.slice(i + 1, closeParen);
        const trimmed = inner.trim();
        const unitBlacklist = new Set(['шт', 'см', 'мм', 'кг', 'г', 'м', 'м2', 'м3', 'руб', 'л', 'вт', 'квт', 'ч', 'мин', 'сек', 'дн', 'мес', 'гг', 'тд', 'тп', 'др', 'пр']);
        const matchesColumn =
          !inner.includes('\n') &&
          !inner.includes('(') &&
          (knownColLower.has(trimmed.toLowerCase()) ||
            (/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_\- ]{0,35}$/.test(trimmed) &&
              trimmed.split(/\s+/).length <= 3 &&
              !unitBlacklist.has(trimmed.toLowerCase())));
        if (matchesColumn) {
          flushText(i);
          tokens.push({
            type: 'column',
            value: template.slice(i, closeParen + 1),
            start: i,
            end: closeParen + 1,
          });
          i = closeParen + 1;
          bufferStart = i;
          continue;
        }
      }
    }

    const ch = template[i];

    if (ch === '{') {
      flushText(i);
      bracketStack.push('{');
      tokens.push({
        type: 'choice-bracket',
        value: '{',
        start: i,
        end: i + 1,
        depth: bracketStack.length,
      });
      i++;
      bufferStart = i;
      continue;
    }

    if (ch === '}') {
      flushText(i);
      const depth = bracketStack.length;
      if (bracketStack[bracketStack.length - 1] === '{') bracketStack.pop();
      tokens.push({
        type: 'choice-bracket',
        value: '}',
        start: i,
        end: i + 1,
        depth,
      });
      i++;
      bufferStart = i;
      continue;
    }

    if (ch === '[') {
      flushText(i);
      bracketStack.push('[');
      tokens.push({
        type: 'shuffle-bracket',
        value: '[',
        start: i,
        end: i + 1,
        depth: bracketStack.length,
      });
      i++;
      // Check immediately for [+sep+ separator
      if (template[i] === '+') {
        const closingPlus = template.indexOf('+', i + 1);
        const nextClose = template.indexOf(']', i);
        if (closingPlus !== -1 && closingPlus - i <= 24 && (nextClose === -1 || closingPlus < nextClose)) {
          tokens.push({
            type: 'shuffle-sep',
            value: template.slice(i, closingPlus + 1),
            start: i,
            end: closingPlus + 1,
          });
          i = closingPlus + 1;
        }
      }
      bufferStart = i;
      continue;
    }

    if (ch === ']') {
      flushText(i);
      const depth = bracketStack.length;
      if (bracketStack[bracketStack.length - 1] === '[') bracketStack.pop();
      tokens.push({
        type: 'shuffle-bracket',
        value: ']',
        start: i,
        end: i + 1,
        depth,
      });
      i++;
      bufferStart = i;
      continue;
    }

    if (ch === '|') {
      flushText(i);
      const currentContext = bracketStack[bracketStack.length - 1];
      tokens.push({
        type: currentContext === '[' ? 'shuffle-pipe' : 'choice-pipe',
        value: '|',
        start: i,
        end: i + 1,
      });
      i++;
      bufferStart = i;
      continue;
    }

    i++;
  }

  flushText(template.length);
  return tokens;
}

/**
 * Safely splits rendered preview text into React-renderable segments supporting ONLY <strong>...</strong>.
 */
export interface PreviewSegment {
  text: string;
  bold: boolean;
}

export function parseSafePreviewSegments(rendered: string): PreviewSegment[] {
  const segments: PreviewSegment[] = [];
  const regex = /<strong>([\s\S]*?)<\/strong>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rendered)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: rendered.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < rendered.length) {
    segments.push({ text: rendered.slice(lastIndex), bold: false });
  }

  return segments;
}
