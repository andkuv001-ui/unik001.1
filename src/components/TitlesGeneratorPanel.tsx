import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Heading,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { evaluateSpintax } from '../lib/spintax';

interface TitlesGeneratorPanelProps {
  description: string;
  isDescriptionOverLimit: boolean;
  value: string;
  onChange: (next: string) => void;
}

const MAX_TITLE_LENGTH = 100;

function extractTitlesFromTemplate(template: string): string[] {
  const trimmed = template.trim();
  if (!trimmed) return [];
  const inner =
    trimmed.startsWith('{') && trimmed.endsWith('}')
      ? trimmed.slice(1, -1)
      : trimmed;
  return inner
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function TitlesGeneratorPanel({
  description,
  isDescriptionOverLimit,
  value,
  onChange,
}: TitlesGeneratorPanelProps) {
  const [excludePrice, setExcludePrice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showList, setShowList] = useState(false);
  const [sampleTitle, setSampleTitle] = useState<string | null>(null);

  const parsedTitles = useMemo(() => extractTitlesFromTemplate(value), [value]);
  const overLimitCount = useMemo(
    () => parsedTitles.filter((t) => t.length > MAX_TITLE_LENGTH).length,
    [parsedTitles]
  );

  const handleGenerate = async () => {
    if (!description.trim() || isDescriptionOverLimit || isLoading) return;

    setIsLoading(true);
    setError(null);
    setSampleTitle(null);

    try {
      const res = await fetch('/api/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          excludePrice,
        }),
      });

      const data = (await res.json()) as {
        template?: string;
        headlines?: string[];
        error?: string;
      };

      if (!res.ok || !data.template) {
        throw new Error(data.error || 'Не удалось сгенерировать заголовки.');
      }

      onChange(data.template);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Ошибка при генерации заголовков. Попробуйте снова.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!value.trim()) return;
    try {
      await navigator.clipboard.writeText(value.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handlePreviewRandom = () => {
    if (!value.trim()) return;
    setSampleTitle(evaluateSpintax(value.trim(), { columns: {} }));
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Heading className="w-4 h-4 text-slate-500 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900">
              Генератор 15 заголовков из описания
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Формула «Ключевик + УТП + конкретика» · До 100 знаков с пробелами · Формат{' '}
            <span className="font-mono text-slate-700">{'{Заголовок 1|...|Заголовок 15}'}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            aria-pressed={excludePrice}
            onClick={() => setExcludePrice((prev) => !prev)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
              excludePrice
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            {excludePrice ? 'Без цены' : 'С ценой'}
          </button>

          {value.trim().length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setSampleTitle(null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
              title="Очистить заголовки"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Очистить
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
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

          <button
            type="button"
            onClick={handleGenerate}
            disabled={!description.trim() || isDescriptionOverLimit || isLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Создаём 15 заголовков…' : 'Создать 15 заголовков'}
          </button>
        </div>
      </div>

      {/* Error Bar */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-800">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-red-800 bg-white border border-red-200 hover:bg-red-100/60 rounded-md transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3 h-3" />
            Повторить
          </button>
        </div>
      )}

      {/* Main Editable Spintax Output */}
      <div className="relative p-5">
        {isLoading && (
          <div className="absolute inset-0 z-10 bg-white/85 backdrop-blur-[1px] flex items-center justify-center gap-3 p-4">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs font-medium text-slate-700">
              Подбираем 15 заголовков по формуле «Ключевик + УТП + конкретика» (до 100 знаков)…
            </span>
          </div>
        )}

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          spellCheck={false}
          aria-label="Шаблон 15 заголовков в фигурных скобках"
          placeholder="Вставьте описание в поле «Описание объявления» выше и нажмите «Создать 15 заголовков» — здесь появится готовая строка формата {Заголовок 1|Заголовок 2|...|Заголовок 15} без счётчика знаков внутри."
          className="editor-scroll w-full p-3.5 font-mono text-[12.5px] leading-[1.65] text-slate-800 placeholder:text-slate-400 placeholder:font-sans bg-slate-50/70 border border-slate-200 rounded-lg resize-y focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
        />

        {/* Random Preview Result */}
        {sampleTitle !== null && (
          <div className="mt-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-slate-400 mb-0.5">
                Случайный вариант заголовка
              </div>
              <div className="text-sm font-semibold text-slate-900 break-words">
                {sampleTitle}
              </div>
            </div>
            <span
              className={`font-mono text-xs tabular-nums shrink-0 ${
                sampleTitle.length > MAX_TITLE_LENGTH
                  ? 'text-red-600 font-semibold'
                  : 'text-slate-500'
              }`}
            >
              {sampleTitle.length} / {MAX_TITLE_LENGTH}
            </span>
          </div>
        )}

        {/* Footer Meta & List Toggle */}
        {parsedTitles.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-500">
              <span>
                Заголовков:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {parsedTitles.length}
                </strong>
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              {overLimitCount > 0 ? (
                <span className="text-red-600 font-medium">
                  Превышают 100 знаков:{' '}
                  <span className="font-mono tabular-nums">{overLimitCount}</span>
                </span>
              ) : (
                <span className="text-emerald-700 font-medium">
                  Все в пределах 100 знаков
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePreviewRandom}
                className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline whitespace-nowrap"
              >
                <Eye className="w-3.5 h-3.5" />
                Проверить случайный
              </button>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                onClick={() => setShowList((prev) => !prev)}
                className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
              >
                {showList ? (
                  <>
                    Скрыть список
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    Проверить списком ({parsedTitles.length})
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Optional Verification Table (char counts shown strictly outside the template string) */}
        {showList && parsedTitles.length > 0 && (
          <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-medium text-slate-500">
                <tr>
                  <th className="py-2 px-3.5 w-10">№</th>
                  <th className="py-2 px-3.5">Заголовок</th>
                  <th className="py-2 px-3.5 w-24 text-right">Знаков</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {parsedTitles.map((title, idx) => {
                  const tooLong = title.length > MAX_TITLE_LENGTH;
                  return (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3.5 font-mono tabular-nums text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3.5 text-slate-800">{title}</td>
                      <td
                        className={`py-2 px-3.5 font-mono tabular-nums text-right ${
                          tooLong ? 'text-red-600 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        {title.length} / 100
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
