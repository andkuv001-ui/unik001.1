import React, { useState } from 'react';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { evaluateSpintax, parseSafePreviewSegments } from '../lib/spintax';

interface SyntaxGuideViewProps {
  columns: Record<string, string>;
  onInsertIntoTemplate: (snippet: string) => void;
}

interface RuleItem {
  id: string;
  syntax: string;
  title: string;
  description: string;
  exampleInput: string;
}

const SYNTAX_RULES: RuleItem[] = [
  {
    id: 'choice',
    syntax: '{ | }',
    title: 'Выбор одного из вариантов',
    description:
      'Случайным образом выбирает ровно один вариант из перечисленных через вертикальную черту.',
    exampleInput: '{1|2|3|4|5}',
  },
  {
    id: 'shuffle',
    syntax: '[ | ]',
    title: 'Перемешивание без разделителя',
    description:
      'Меняет порядок всех элементов случайным образом и склеивает их без разделителя.',
    exampleInput: '[1|2| 3| 4| 5]',
  },
  {
    id: 'paragraphs',
    syntax: '[+\\n+ |]',
    title: 'Перемешивание абзацев',
    description:
      'Переставляет блоки текста или пункты списка в случайном порядке, разделяя переносом строки.',
    exampleInput: '[+\\n+ 1|2|3]',
  },
  {
    id: 'comma',
    syntax: '[+,+ |]',
    title: 'Перемешивание через разделитель',
    description:
      'Перемешивает перечисления через запятую. Вместо запятой внутри +...+ можно указать любой разделитель.',
    exampleInput: '[+,+ 1 | 2 | 3 | 4 ]',
  },
  {
    id: 'column',
    syntax: '(Название столбика)',
    title: 'Подстановка из столбика таблицы',
    description:
      'Подставляет значение из любого столбика вашей таблицы автозагрузки для логической уникализации по параметрам товара.',
    exampleInput: 'Параметр из таблицы: (Название столбика)',
  },
  {
    id: 'date-today',
    syntax: '%дата%',
    title: 'Сегодняшняя дата',
    description: 'Автоматически подставляет актуальную дату публикации.',
    exampleInput: 'Предложение актуально на %дата%',
  },
  {
    id: 'date-plus',
    syntax: '%дата+1%',
    title: 'Дата + количество дней',
    description: 'Прибавляет к сегодняшней дате указанное число дней (можно задать любое число).',
    exampleInput: 'Скидка действует до %дата+3%',
  },
  {
    id: 'art-auto',
    syntax: '%арт%',
    title: 'Автогенерация уникального артикула',
    description: 'Алгоритм автоматически формирует уникальный артикул формата v-9255.',
    exampleInput: 'Артикул объявления: %арт%',
  },
  {
    id: 'art-trim',
    syntax: '#арт# ... #арт#',
    title: 'Убрать лишние пробелы (свои артикулы)',
    description:
      'Конструкция удаляет все лишние пробелы внутри блока — удобно при генерации собственных артикулов.',
    exampleInput: '#арт#{1|2|3}{1|2|3}{1|2|3}#арт#',
  },
  {
    id: 'strong',
    syntax: '<strong>текст</strong>',
    title: 'Выделение жирным',
    description: 'Выделяет важный фрагмент описания жирным начертанием в опубликованном объявлении.',
    exampleInput: '<strong>Бесплатная доставка</strong> при заказе сегодня',
  },
];

export function SyntaxGuideView({
  columns,
  onInsertIntoTemplate,
}: SyntaxGuideViewProps) {
  const [samples, setSamples] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const rule of SYNTAX_RULES) {
      initial[rule.id] = evaluateSpintax(rule.exampleInput, { columns });
    }
    return initial;
  });

  const reroll = (rule: RuleItem) => {
    setSamples((prev) => ({
      ...prev,
      [rule.id]: evaluateSpintax(rule.exampleInput, { columns }),
    }));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-base font-semibold text-slate-900">
          Справочник синтаксиса уникализации
        </h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Все поддерживаемые конструкции для шаблонов автозагрузки. Нажмите «Обновить» на любой карточке, чтобы увидеть случайный результат, или вставьте шаблон прямо в редактор.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {SYNTAX_RULES.map((rule) => {
          const rendered = samples[rule.id] ?? '';
          const segments = parseSafePreviewSegments(rendered);
          return (
            <div
              key={rule.id}
              className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
            >
              <div className="lg:col-span-4 space-y-1">
                <div className="font-mono text-sm font-semibold text-blue-700">
                  {rule.syntax}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {rule.title}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {rule.description}
                </p>
              </div>

              <div className="lg:col-span-4">
                <div className="text-[11px] font-medium text-slate-400 mb-1">
                  Вводим
                </div>
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 whitespace-pre-wrap break-words">
                  {rule.exampleInput}
                </pre>
              </div>

              <div className="lg:col-span-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-slate-400">
                    Получаем
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => reroll(rule)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-blue-700 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Обновить
                    </button>
                    <button
                      type="button"
                      onClick={() => onInsertIntoTemplate(rule.exampleInput)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-700 hover:underline"
                    >
                      В редактор
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 whitespace-pre-wrap break-words min-h-[42px]">
                  {segments.map((seg, i) =>
                    seg.bold ? (
                      <strong key={i} className="font-bold text-slate-950">
                        {seg.text}
                      </strong>
                    ) : (
                      <React.Fragment key={i}>{seg.text}</React.Fragment>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
