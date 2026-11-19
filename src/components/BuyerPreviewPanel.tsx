import React, { useState } from 'react';
import {
  Check,
  Copy,
  RefreshCw,
  ArrowLeft,
  Layers,
  FileText,
} from 'lucide-react';
import { parseSafePreviewSegments } from '../lib/spintax';

interface BuyerPreviewPanelProps {
  variants: string[];
  mode: 'single' | 'batch';
  onModeChange: (mode: 'single' | 'batch') => void;
  onRegenerate: () => void;
  onBackToDescription: () => void;
  hasErrors: boolean;
  detectedColumns: string[];
  columns: Record<string, string>;
  onUpdateColumn: (key: string, value: string) => void;
}

function SafeFormattedText({ text }: { text: string }) {
  const segments = parseSafePreviewSegments(text);
  return (
    <div className="text-[14.5px] leading-[1.68] text-slate-800 whitespace-pre-wrap break-words">
      {segments.map((seg, idx) =>
        seg.bold ? (
          <strong key={idx} className="font-bold text-slate-950">
            {seg.text}
          </strong>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        )
      )}
    </div>
  );
}

export function BuyerPreviewPanel({
  variants,
  mode,
  onModeChange,
  onRegenerate,
  onBackToDescription,
  hasErrors,
  detectedColumns,
  columns,
  onUpdateColumn,
}: BuyerPreviewPanelProps) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Sub-toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => onModeChange('single')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'single'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            1 вариант
          </button>
          <button
            type="button"
            onClick={() => onModeChange('batch')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'batch'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            5 вариантов
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Другой вариант
          </button>
        </div>
      </div>

      {/* Inline column overrides if template references any (Column) */}
      {detectedColumns.length > 0 && (
        <div className="px-5 py-2.5 border-b border-slate-200 bg-amber-50/40 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-amber-900 shrink-0">
            Подстановки столбиков:
          </span>
          {detectedColumns.map((col) => (
            <label key={col} className="inline-flex items-center gap-1.5 text-xs">
              <span className="font-mono text-amber-800">({col})</span>
              <input
                type="text"
                value={columns[col] ?? ''}
                onChange={(e) => onUpdateColumn(col, e.target.value)}
                className="w-28 px-2 py-0.5 text-xs bg-white border border-amber-200 rounded focus:outline-none focus:border-blue-500 text-slate-800"
              />
            </label>
          ))}
        </div>
      )}

      {hasErrors && (
        <div className="px-5 py-2.5 border-b border-red-200 bg-red-50/70 text-xs text-red-700">
          В шаблоне есть незакрытые скобки или теги — часть конструкции может отобразиться как обычный текст. Исправьте подсвеченные ошибки справа.
        </div>
      )}

      {/* Rendered buyer-facing content */}
      <div className="flex-1 overflow-y-auto editor-scroll p-5 space-y-5 bg-white min-h-[360px]">
        {variants.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 px-4">
            <p className="text-sm font-medium text-slate-700">
              Нажмите «Показать пример» справа
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs">
              Здесь появится готовый вариант описания — точно так, как его увидит покупатель в объявлении.
            </p>
          </div>
        ) : mode === 'single' ? (
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
              <span className="text-xs text-slate-500">
                Так текст увидит покупатель ·{' '}
                <span className="font-mono tabular-nums text-slate-700">
                  {variants[0].replace(/<\/?strong>/gi, '').length.toLocaleString('ru-RU')} симв.
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleCopy(variants[0].replace(/<\/?strong>/gi, ''), 0)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedIdx === 0 ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Скопировано
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Копировать текст
                  </>
                )}
              </button>
            </div>
            <SafeFormattedText text={variants[0]} />
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {variants.map((variant, idx) => (
              <div key={idx} className={idx === 0 ? 'pb-5' : 'py-5'}>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span className="text-xs font-semibold text-slate-700 font-mono tabular-nums">
                    Вариант {idx + 1} · {variant.replace(/<\/?strong>/gi, '').length.toLocaleString('ru-RU')} симв.
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(variant.replace(/<\/?strong>/gi, ''), idx)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    {copiedIdx === idx ? (
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
                <SafeFormattedText text={variant} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/60">
        <button
          type="button"
          onClick={onBackToDescription}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          К исходному описанию
        </button>
        <span className="text-xs text-slate-500">
          Проверка примеров бесплатна и без ограничений
        </span>
      </div>
    </div>
  );
}
