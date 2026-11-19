import React, { useMemo, useState } from 'react';
import { Calendar, Check, Copy, Download, RefreshCw } from 'lucide-react';

type OutputFormat = 'ru' | 'iso' | 'macro';
type DistributionMode = 'uniform' | 'random';

function formatLocalDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function DateGeneratorView() {
  const today = useMemo(() => new Date(), []);
  const weekLater = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  }, []);

  const [count, setCount] = useState(25);
  const [startDate, setStartDate] = useState(formatLocalDateInput(today));
  const [endDate, setEndDate] = useState(formatLocalDateInput(weekLater));
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(21);
  const [mode, setMode] = useState<DistributionMode>('uniform');
  const [format, setFormat] = useState<OutputFormat>('ru');
  const [seed, setSeed] = useState(1);
  const [copied, setCopied] = useState(false);

  const generatedRows = useMemo(() => {
    const safeCount = Math.max(1, Math.min(500, count || 1));
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const totalDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );
    const safeStartH = Math.max(0, Math.min(23, startHour));
    const safeEndH = Math.max(safeStartH + 1, Math.min(24, endHour));
    const activeMinutesPerDay = (safeEndH - safeStartH) * 60;

    // Deterministic-ish PRNG keyed by seed so clicking "Обновить разброс" produces fresh results
    let s = seed * 9301 + 49297;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const timestamps: Date[] = [];

    for (let i = 0; i < safeCount; i++) {
      let dayOffset: number;
      let minuteInWindow: number;

      if (mode === 'uniform') {
        const fraction = safeCount === 1 ? 0 : i / (safeCount - 1);
        const totalWindowMinutes = totalDays * activeMinutesPerDay;
        const offsetMin = Math.floor(fraction * (totalWindowMinutes - 1));
        dayOffset = Math.floor(offsetMin / activeMinutesPerDay);
        minuteInWindow = offsetMin % activeMinutesPerDay;
      } else {
        dayOffset = Math.floor(rand() * totalDays);
        minuteInWindow = Math.floor(rand() * activeMinutesPerDay);
      }

      const dt = new Date(start.getTime());
      dt.setDate(dt.getDate() + dayOffset);
      dt.setHours(
        safeStartH + Math.floor(minuteInWindow / 60),
        minuteInWindow % 60,
        mode === 'random' ? Math.floor(rand() * 60) : 0,
        0
      );
      timestamps.push(dt);
    }

    timestamps.sort((a, b) => a.getTime() - b.getTime());

    return timestamps.map((dt, idx) => {
      const dd = pad2(dt.getDate());
      const mm = pad2(dt.getMonth() + 1);
      const yyyy = dt.getFullYear();
      const hh = pad2(dt.getHours());
      const min = pad2(dt.getMinutes());
      const sec = pad2(dt.getSeconds());

      const diffDays = Math.round(
        (new Date(yyyy, dt.getMonth(), dt.getDate()).getTime() - todayMidnight.getTime()) /
          (1000 * 60 * 60 * 24)
      );

      let formatted = `${dd}.${mm}.${yyyy} ${hh}:${min}`;
      if (format === 'iso') {
        formatted = `${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}+03:00`;
      } else if (format === 'macro') {
        formatted = diffDays === 0 ? '%дата%' : diffDays > 0 ? `%дата+${diffDays}%` : `%дата${diffDays}%`;
      }

      return {
        index: idx + 1,
        value: formatted,
        weekday: dt.toLocaleDateString('ru-RU', { weekday: 'short' }),
      };
    });
  }, [count, startDate, endDate, startHour, endHour, mode, format, seed]);

  const handleCopyAll = async () => {
    const text = generatedRows.map((r) => r.value).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleDownloadCsv = () => {
    const header = '№;DateBegin';
    const body = generatedRows.map((r) => `${r.index};${r.value}`).join('\n');
    const blob = new Blob([`\uFEFF${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datebegin_${startDate}_${count}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Configuration panel */}
      <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div>
          <h1 className="text-base font-semibold text-slate-900">
            Генератор дат публикации
          </h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Создаёт столбец <span className="font-mono text-slate-700">DateBegin</span> для таблицы автозагрузки с равномерным или случайным распределением по рабочим часам.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Количество объявлений (1–500)
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Дата начала
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Дата окончания
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Публиковать с (час)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Публиковать до (час)
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Распределение по времени
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('uniform')}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                  mode === 'uniform'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Равномерно
              </button>
              <button
                type="button"
                onClick={() => setMode('random')}
                className={`py-1.5 px-3 text-xs font-medium rounded-md transition-colors ${
                  mode === 'random'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Случайный разброс
              </button>
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Формат вывода
            </span>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setFormat('ru')}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                  format === 'ru'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Excel (ДД.ММ)
              </button>
              <button
                type="button"
                onClick={() => setFormat('iso')}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                  format === 'iso'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                XML ISO-8601
              </button>
              <button
                type="button"
                onClick={() => setFormat('macro')}
                className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors ${
                  format === 'macro'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                %дата+N%
              </button>
            </div>
          </div>

          {mode === 'random' && (
            <button
              type="button"
              onClick={() => setSeed((s) => s + 1)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Перегенерировать случайные даты
            </button>
          )}
        </div>
      </section>

      {/* Generated table */}
      <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Сгенерированный столбец
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              · {generatedRows.length} строк
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Скопировано
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Копировать столбец
                </>
              )}
            </button>
          </div>
        </div>

        <div className="max-h-[520px] overflow-y-auto editor-scroll">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
              <tr>
                <th className="py-2.5 px-5 w-16">№</th>
                <th className="py-2.5 px-5">DateBegin</th>
                <th className="py-2.5 px-5 w-24 text-right">День</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {generatedRows.map((row) => (
                <tr key={row.index} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2 px-5 font-mono text-xs text-slate-400 tabular-nums">
                    {row.index}
                  </td>
                  <td className="py-2 px-5 font-mono text-[13px] text-slate-800 tabular-nums">
                    {row.value}
                  </td>
                  <td className="py-2 px-5 text-xs text-slate-500 text-right capitalize">
                    {row.weekday}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
