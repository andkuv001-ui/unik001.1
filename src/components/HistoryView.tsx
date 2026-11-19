import React from 'react';
import { ArrowUpRight, Trash2, Clock } from 'lucide-react';
import { analyzeSpintax } from '../lib/spintax';

export interface SavedTemplateRecord {
  id: string;
  description: string;
  template: string;
  createdAt: string;
}

interface HistoryViewProps {
  records: SavedTemplateRecord[];
  knownColumns: string[];
  onLoad: (record: SavedTemplateRecord) => void;
  onDelete: (id: string) => void;
}

export function HistoryView({
  records,
  knownColumns,
  onLoad,
  onDelete,
}: HistoryViewProps) {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-base font-semibold text-slate-900">
          Сохранённые шаблоны
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Каждый созданный нейросетью шаблон сохраняется автоматически — даже если закрыть вкладку во время генерации.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {records.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">
              История шаблонов пока пуста
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Создайте первый шаблон во вкладке «Уникализатор описаний» — он автоматически появится здесь.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {records.map((rec) => {
              const { stats } = analyzeSpintax(rec.template, knownColumns);
              const dateLabel = new Date(rec.createdAt).toLocaleString('ru-RU', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });
              const previewLine =
                rec.description.split('\n').find((l) => l.trim().length > 0) ||
                rec.template.slice(0, 90);

              return (
                <div
                  key={rec.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {previewLine}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span className="font-mono tabular-nums">{dateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {stats.formattedCombinations}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {rec.template.length.toLocaleString('ru-RU')} симв.
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onLoad(rec)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
                    >
                      Открыть в редакторе
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(rec.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Удалить из истории"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
