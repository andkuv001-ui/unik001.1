import React, { useMemo, useRef } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  Trash2,
} from 'lucide-react';
import {
  analyzeSpintax,
  tokenizeSpintax,
  type HighlightToken,
  type ValidationIssue,
} from '../lib/spintax';

interface SpintaxEditorProps {
  value: string;
  onChange: (next: string) => void;
  knownColumns: string[];
  isGenerating: boolean;
  onPreview: () => void;
  onCopy: () => void;
  copied: boolean;
}

interface QuickSnippet {
  label: string;
  title: string;
  before: string;
  after: string;
  placeholder: string;
}

const QUICK_SNIPPETS: QuickSnippet[] = [
  {
    label: '{ | }',
    title: 'Выбор одного варианта из списка',
    before: '{',
    after: '|вариант 2}',
    placeholder: 'вариант 1',
  },
  {
    label: '[ | ]',
    title: 'Перемешивание элементов без разделителя',
    before: '[',
    after: '|2|3]',
    placeholder: '1',
  },
  {
    label: '[+\\n+ |]',
    title: 'Перемешивание абзацев',
    before: '[+\\n+ ',
    after: '|Абзац 2]',
    placeholder: 'Абзац 1',
  },
  {
    label: '[+,+ |]',
    title: 'Перемешивание через запятую',
    before: '[+,+ ',
    after: '|пункт 2|пункт 3]',
    placeholder: 'пункт 1',
  },
  {
    label: '(Столбик)',
    title: 'Подстановка значения из столбика таблицы',
    before: '(',
    after: ')',
    placeholder: 'Название столбика',
  },
  {
    label: '%дата%',
    title: 'Сегодняшняя дата',
    before: '%дата%',
    after: '',
    placeholder: '',
  },
  {
    label: '%дата+1%',
    title: 'Дата + N дней',
    before: '%дата+1%',
    after: '',
    placeholder: '',
  },
  {
    label: '%арт%',
    title: 'Автогенерация уникального артикула (v-9255)',
    before: '%арт%',
    after: '',
    placeholder: '',
  },
  {
    label: '#арт#',
    title: 'Удаление лишних пробелов внутри артикула',
    before: '#арт#',
    after: '#арт#',
    placeholder: '{1|2|3}{1|2|3}{1|2|3}',
  },
  {
    label: '<strong>',
    title: 'Выделение текста жирным',
    before: '<strong>',
    after: '</strong>',
    placeholder: 'жирный текст',
  },
];

function getTokenClassName(token: HighlightToken): string {
  switch (token.type) {
    case 'choice-bracket':
      return 'text-blue-700 bg-blue-100/80 font-semibold rounded-[2px]';
    case 'choice-pipe':
      return 'text-blue-600 font-bold';
    case 'shuffle-bracket':
      return 'text-emerald-700 bg-emerald-100/80 font-semibold rounded-[2px]';
    case 'shuffle-sep':
      return 'text-emerald-800 bg-emerald-100/90 font-semibold rounded-[2px]';
    case 'shuffle-pipe':
      return 'text-emerald-600 font-bold';
    case 'column':
      return 'text-amber-800 bg-amber-100/90 font-medium rounded-[2px]';
    case 'macro':
      return 'text-violet-700 bg-violet-100/80 font-medium rounded-[2px]';
    case 'art-wrap':
      return 'text-rose-700 bg-rose-100/80 font-semibold rounded-[2px]';
    case 'strong-tag':
      return 'text-slate-900 bg-slate-200/80 font-semibold rounded-[2px]';
    case 'error':
      return 'text-red-700 bg-red-200/90 font-bold underline decoration-wavy decoration-red-600 rounded-[2px]';
    default:
      return 'text-slate-800';
  }
}

export function SpintaxEditor({
  value,
  onChange,
  knownColumns,
  isGenerating,
  onPreview,
  onCopy,
  copied,
}: SpintaxEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLPreElement>(null);

  const analysis = useMemo(
    () => analyzeSpintax(value, knownColumns),
    [value, knownColumns]
  );

  const tokens = useMemo(
    () => tokenizeSpintax(value, analysis.errorIndices, knownColumns),
    [value, analysis.errorIndices, knownColumns]
  );

  const errorIssues = analysis.issues.filter((i) => i.severity === 'error');
  const warningIssues = analysis.issues.filter((i) => i.severity === 'warning');

  const handleScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const insertSnippet = (snippet: QuickSnippet) => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);

    const middle = selected || snippet.placeholder;
    const inserted = `${snippet.before}${middle}${snippet.after}`;
    const next = value.slice(0, start) + inserted + value.slice(end);
    onChange(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursorStart = start + snippet.before.length;
      const cursorEnd = cursorStart + middle.length;
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const focusIssue = (issue: ValidationIssue) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(issue.startIndex, Math.max(issue.endIndex, issue.startIndex + 1));
  };

  return (
    <section className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 bg-white">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">
            Шаблон уникализации
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Скобки и разделители подсвечиваются автоматически · Можно вставить свой шаблон
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Очистить шаблон"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Очистить
            </button>
          )}
          <button
            type="button"
            onClick={onCopy}
            disabled={!value.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Скопировано
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Копировать
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick-insert toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 bg-slate-50/70 overflow-x-auto">
        {QUICK_SNIPPETS.map((snippet) => (
          <button
            key={snippet.label}
            type="button"
            title={snippet.title}
            onClick={() => insertSnippet(snippet)}
            className="px-2 py-1 font-mono text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/40 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {snippet.label}
          </button>
        ))}
      </div>

      {/* Syntax-Highlighted Editor Canvas */}
      <div className="relative flex-1 min-h-[380px] bg-white">
        {isGenerating && (
          <div className="absolute inset-0 z-20 bg-white/85 backdrop-blur-[1px] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-900">
              Нейросеть собирает шаблон уникализации…
            </p>
            <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
              Подбираем синонимы, перемешиваем абзацы и перечисления, сохраняя цифры, контакты и модели. Можно закрыть окно — результат всё равно сохранится.
            </p>
          </div>
        )}

        {/* Highlight Backdrop */}
        <pre
          ref={backdropRef}
          aria-hidden="true"
          className="editor-scroll pointer-events-none absolute inset-0 m-0 p-5 font-mono text-[13px] leading-[1.68] whitespace-pre-wrap break-words overflow-auto text-slate-800"
        >
          {value.length === 0 ? (
            <span className="text-slate-400 font-sans text-sm">
              Здесь появится готовый шаблон после нажатия «Создать шаблон» — или вставьте свою разметку для подсветки и проверки.
            </span>
          ) : (
            <>
              {tokens.map((token, idx) => (
                <span key={`${token.start}-${idx}`} className={getTokenClassName(token)}>
                  {token.value}
                </span>
              ))}
              {/* Trailing newline ensures backdrop height matches textarea when ending with \n */}
              {'\n'}
            </>
          )}
        </pre>

        {/* Transparent Editable Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          aria-label="Шаблон уникализации"
          className="editor-scroll relative z-10 w-full h-full min-h-[380px] p-5 font-mono text-[13px] leading-[1.68] whitespace-pre-wrap break-words bg-transparent text-transparent caret-slate-900 resize-none focus:outline-none selection:bg-blue-200/50"
        />
      </div>

      {/* Validation Issues Panel (shown only when errors or warnings exist) */}
      {value.trim().length > 0 && (errorIssues.length > 0 || warningIssues.length > 0) && (
        <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3 max-h-36 overflow-y-auto editor-scroll">
          <div className="space-y-1.5">
            {errorIssues.map((issue, idx) => (
              <button
                key={`err-${idx}`}
                type="button"
                onClick={() => focusIssue(issue)}
                className="w-full text-left flex items-start gap-2 text-xs text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" />
                <span className="font-mono tabular-nums text-red-600 shrink-0">
                  Стр. {issue.line}:{issue.column}
                </span>
                <span>{issue.message}</span>
              </button>
            ))}
            {warningIssues.map((issue, idx) => (
              <button
                key={`warn-${idx}`}
                type="button"
                onClick={() => focusIssue(issue)}
                className="w-full text-left flex items-start gap-2 text-xs text-amber-800 hover:bg-amber-50 px-2 py-1 rounded transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                <span className="font-mono tabular-nums text-amber-700 shrink-0">
                  Стр. {issue.line}:{issue.column}
                </span>
                <span>{issue.message}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer Status & Primary Preview Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/60">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {value.trim().length === 0 ? (
            <span className="text-slate-500">Ожидает шаблон</span>
          ) : errorIssues.length > 0 ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              Ошибок разметки: <span className="font-mono tabular-nums">{errorIssues.length}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Разметка корректна
            </span>
          )}

          {value.trim().length > 0 && errorIssues.length === 0 && (
            <>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-600 font-mono tabular-nums">
                {analysis.stats.formattedCombinations}
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <span className="text-slate-500 font-mono tabular-nums">
                {value.length.toLocaleString('ru-RU')} симв.
              </span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onPreview}
          disabled={!value.trim() || isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50/40 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Eye className="w-3.5 h-3.5" />
          Показать пример
          <span className="text-slate-400 font-normal">· Бесплатно</span>
        </button>
      </div>
    </section>
  );
}
