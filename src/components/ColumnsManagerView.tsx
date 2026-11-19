import React, { useState } from 'react';
import { Plus, Trash2, Copy, Check } from 'lucide-react';

interface ColumnsManagerViewProps {
  columns: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onInsertIntoTemplate: (snippet: string) => void;
}

export function ColumnsManagerView({
  columns,
  onChange,
  onInsertIntoTemplate,
}: ColumnsManagerViewProps) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const entries = Object.entries(columns);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey.trim().replace(/[()]/g, '');
    if (!cleanKey) return;
    onChange({
      ...columns,
      [cleanKey]: newVal.trim() || 'Пример значения',
    });
    setNewKey('');
    setNewVal('');
  };

  const handleUpdateValue = (key: string, val: string) => {
    onChange({
      ...columns,
      [key]: val,
    });
  };

  const handleRemove = (key: string) => {
    const next = { ...columns };
    delete next[key];
    onChange(next);
  };

  const handleCopyToken = async (key: string) => {
    try {
      await navigator.clipboard.writeText(`(${key})`);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-base font-semibold text-slate-900">
          Столбики таблицы автозагрузки
        </h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Используйте конструкцию <span className="font-mono text-amber-800">(Название столбика)</span> в шаблоне описания для подстановки параметров конкретного товара. Указанные ниже тестовые значения подставляются при нажатии «Показать пример».
        </p>

        <form onSubmit={handleAdd} className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Название столбика (например, Бренд)"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Тестовое значение для примера"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!newKey.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить столбик
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700">Нет добавленных столбиков</p>
            <p className="text-xs text-slate-500 mt-1">
              Добавьте первый столбик выше, чтобы использовать его в шаблоне через круглые скобки.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
              <tr>
                <th className="py-3 px-5">Подстановка в шаблоне</th>
                <th className="py-3 px-5">Тестовое значение</th>
                <th className="py-3 px-5 text-right w-52">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {entries.map(([key, val]) => (
                <tr key={key} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2.5 px-5 font-mono text-xs font-medium text-amber-800">
                    ({key})
                  </td>
                  <td className="py-2.5 px-5">
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => handleUpdateValue(key, e.target.value)}
                      className="w-full max-w-xs px-2.5 py-1 text-sm text-slate-800 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="py-2.5 px-5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onInsertIntoTemplate(`(${key})`)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md transition-colors whitespace-nowrap"
                      >
                        Вставить
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyToken(key)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        title="Копировать тег"
                      >
                        {copiedKey === key ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(key)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="Удалить столбик"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
