import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Braces,
  Calendar,
  CheckCircle2,
  History,
  Menu,
  RefreshCw,
  ShieldCheck,
  Table2,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { analyzeSpintax, evaluateSpintax } from './lib/spintax';
import { SpintaxEditor } from './components/SpintaxEditor';
import { BuyerPreviewPanel } from './components/BuyerPreviewPanel';
import { DateGeneratorView } from './components/DateGeneratorView';
import { ColumnsManagerView } from './components/ColumnsManagerView';
import { SyntaxGuideView } from './components/SyntaxGuideView';
import { HistoryView, type SavedTemplateRecord } from './components/HistoryView';
import { TitlesGeneratorPanel } from './components/TitlesGeneratorPanel';

type ActiveSection = 'uniquifier' | 'dates' | 'columns' | 'guide' | 'history';
type LeftTab = 'description' | 'preview';
type Intensity = 'standard' | 'deep';

const MAX_DESCRIPTION_LENGTH = 7000;

const STORAGE_KEYS = {
  description: 'avtozagruzka_description_v2',
  template: 'avtozagruzka_template_v2',
  titlesTemplate: 'avtozagruzka_titles_template_v2',
  columns: 'avtozagruzka_columns_v2',
  history: 'avtozagruzka_history_v2',
  activeJobId: 'avtozagruzka_active_job_v2',
};

const LEGACY_KEYS = [
  'avtozagruzka_description_v1',
  'avtozagruzka_template_v1',
  'avtozagruzka_columns_v1',
  'avtozagruzka_history_v1',
  'avtozagruzka_active_job_v1',
];

interface JobResponse {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  description: string;
  template: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [section, setSection] = useState<ActiveSection>('uniquifier');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [description, setDescription] = useState<string>(() =>
    readLocalStorage(STORAGE_KEYS.description, '')
  );
  const [template, setTemplate] = useState<string>(() =>
    readLocalStorage(STORAGE_KEYS.template, '')
  );
  const [titlesTemplate, setTitlesTemplate] = useState<string>(() =>
    readLocalStorage(STORAGE_KEYS.titlesTemplate, '')
  );
  const [columns, setColumns] = useState<Record<string, string>>(() =>
    readLocalStorage(STORAGE_KEYS.columns, {})
  );
  const [history, setHistory] = useState<SavedTemplateRecord[]>(() =>
    readLocalStorage(STORAGE_KEYS.history, [])
  );

  const [leftTab, setLeftTab] = useState<LeftTab>('description');
  const [previewMode, setPreviewMode] = useState<'single' | 'batch'>('single');
  const [previewVariants, setPreviewVariants] = useState<string[]>([]);
  const [intensity, setIntensity] = useState<Intensity>('standard');

  const [genTools, setGenTools] = useState({
    useChoice: true,
    useShuffle: true,
    useParagraphs: true,
    useCommaList: true,
    useStrong: true,
    addDate: false,
    addAutoArt: false,
    addCustomArt: false,
  });

  const [activeJobId, setActiveJobId] = useState<string | null>(() =>
    readLocalStorage<string | null>(STORAGE_KEYS.activeJobId, null)
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(() => Boolean(activeJobId));
  const [apiError, setApiError] = useState<string | null>(null);
  const [recoveredNotice, setRecoveredNotice] = useState<string | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);

  const pollTimerRef = useRef<number | null>(null);

  // Clean up any legacy pre-populated localStorage entries from earlier builds
  useEffect(() => {
    try {
      for (const legacyKey of LEGACY_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Sync draft state to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.description, JSON.stringify(description));
    } catch {
      // Storage quota ignored
    }
  }, [description]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.template, JSON.stringify(template));
    } catch {
      // Storage quota ignored
    }
  }, [template]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.titlesTemplate, JSON.stringify(titlesTemplate));
    } catch {
      // Storage quota ignored
    }
  }, [titlesTemplate]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify(columns));
    } catch {
      // Storage quota ignored
    }
  }, [columns]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    } catch {
      // Storage quota ignored
    }
  }, [history]);

  useEffect(() => {
    try {
      if (activeJobId) {
        window.localStorage.setItem(STORAGE_KEYS.activeJobId, JSON.stringify(activeJobId));
      } else {
        window.localStorage.removeItem(STORAGE_KEYS.activeJobId);
      }
    } catch {
      // Ignore
    }
  }, [activeJobId]);

  const knownColumnNames = useMemo(() => Object.keys(columns), [columns]);

  const templateAnalysis = useMemo(
    () => analyzeSpintax(template, knownColumnNames),
    [template, knownColumnNames]
  );

  const templateHasErrors = useMemo(
    () => templateAnalysis.issues.some((i) => i.severity === 'error'),
    [templateAnalysis.issues]
  );

  const saveToHistory = useCallback((record: SavedTemplateRecord) => {
    setHistory((prev) => {
      if (prev.some((item) => item.id === record.id)) return prev;
      return [record, ...prev].slice(0, 30);
    });
  }, []);

  // Poll active background job (also recovers templates generated while window was closed)
  const pollJob = useCallback(
    async (jobId: string, isRecovery: boolean) => {
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          if (res.status === 404) {
            setActiveJobId(null);
            setIsGenerating(false);
            return;
          }
          throw new Error('Ошибка проверки статуса генерации.');
        }

        const job = (await res.json()) as JobResponse;
        if (job.status === 'pending') {
          setIsGenerating(true);
          pollTimerRef.current = window.setTimeout(() => {
            void pollJob(jobId, isRecovery);
          }, 1200);
          return;
        }

        setIsGenerating(false);
        setActiveJobId(null);

        if (job.status === 'completed' && job.template) {
          setTemplate(job.template);
          setApiError(null);
          saveToHistory({
            id: job.id,
            description: job.description,
            template: job.template,
            createdAt: job.completedAt ?? job.createdAt,
          });
          if (isRecovery) {
            setRecoveredNotice(
              'Шаблон, запущенный ранее, успешно завершился и автоматически загружен в редактор.'
            );
          }
        } else if (job.status === 'failed') {
          setApiError(job.error || 'Нейросеть не ответила. Попробуйте повторить запрос.');
        }
      } catch (err: unknown) {
        setIsGenerating(false);
        setActiveJobId(null);
        setApiError(
          err instanceof Error
            ? err.message
            : 'Не удалось связаться с сервером. Попробуйте ещё раз.'
        );
      }
    },
    [saveToHistory]
  );

  // Resume polling on mount if a job was active when the tab was closed
  useEffect(() => {
    if (activeJobId) {
      void pollJob(activeJobId, true);
    }
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge completed server jobs into history on mount for seamless recovery
  useEffect(() => {
    let cancelled = false;
    fetch('/api/jobs')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { jobs?: JobResponse[] } | null) => {
        if (cancelled || !data?.jobs) return;
        const completed = data.jobs.filter(
          (j): j is JobResponse & { template: string } =>
            j.status === 'completed' && Boolean(j.template)
        );
        if (completed.length > 0) {
          setHistory((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const additions = completed
              .filter((j) => !existingIds.has(j.id))
              .map((j) => ({
                id: j.id,
                description: j.description,
                template: j.template,
                createdAt: j.completedAt ?? j.createdAt,
              }));
            if (additions.length === 0) return prev;
            return [...additions, ...prev]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 30);
          });
        }
      })
      .catch(() => {
        // Non-fatal
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isOverLimit = description.length > MAX_DESCRIPTION_LENGTH;
  const excessChars = Math.max(0, description.length - MAX_DESCRIPTION_LENGTH);

  const handleGenerateTemplate = async () => {
    if (!description.trim() || isOverLimit || isGenerating) return;

    setApiError(null);
    setRecoveredNotice(null);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          intensity,
          tools: {
            ...genTools,
            columns: knownColumnNames,
          },
        }),
      });

      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        throw new Error(data.error || 'Не удалось запустить генерацию шаблона.');
      }

      setActiveJobId(data.id);
      void pollJob(data.id, false);
    } catch (err: unknown) {
      setIsGenerating(false);
      setApiError(
        err instanceof Error
          ? err.message
          : 'Произошла ошибка при обращении к сервису. Попробуйте снова.'
      );
    }
  };

  const generatePreviewVariants = useCallback(
    (mode: 'single' | 'batch', customColumns?: Record<string, string>) => {
      if (!template.trim()) return;
      const colMap = customColumns ?? columns;
      const count = mode === 'batch' ? 5 : 1;
      const results: string[] = [];
      for (let i = 0; i < count; i++) {
        results.push(evaluateSpintax(template, { columns: colMap }));
      }
      setPreviewVariants(results);
    },
    [template, columns]
  );

  const handleShowPreview = () => {
    if (!template.trim()) return;
    generatePreviewVariants(previewMode);
    setLeftTab('preview');
  };

  const handlePreviewModeChange = (nextMode: 'single' | 'batch') => {
    setPreviewMode(nextMode);
    generatePreviewVariants(nextMode);
  };

  const handleUpdateColumnInline = (key: string, val: string) => {
    const nextCols = { ...columns, [key]: val };
    setColumns(nextCols);
    if (leftTab === 'preview') {
      generatePreviewVariants(previewMode, nextCols);
    }
  };

  const handleCopyTemplate = async () => {
    if (!template.trim()) return;
    try {
      await navigator.clipboard.writeText(template);
      setCopiedTemplate(true);
      setTimeout(() => setCopiedTemplate(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleInsertIntoTemplate = (snippet: string) => {
    setTemplate((prev) => (prev.trim() ? `${prev}\n${snippet}` : snippet));
    setSection('uniquifier');
  };

  const handleLoadHistoryRecord = (rec: SavedTemplateRecord) => {
    setDescription(rec.description);
    setTemplate(rec.template);
    setLeftTab('description');
    setSection('uniquifier');
  };

  const handleDeleteHistoryRecord = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const sectionLabels: Record<ActiveSection, string> = {
    uniquifier: 'Уникализатор описаний',
    dates: 'Генератор дат',
    columns: 'Столбики таблицы',
    guide: 'Справочник разметки',
    history: 'История шаблонов',
  };

  const navItems: Array<{
    id: ActiveSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    meta?: string;
  }> = [
    { id: 'uniquifier', label: 'Уникализатор описаний', icon: Braces },
    { id: 'dates', label: 'Генератор дат', icon: Calendar },
    {
      id: 'columns',
      label: 'Столбики таблицы',
      icon: Table2,
      meta: knownColumnNames.length > 0 ? String(knownColumnNames.length) : undefined,
    },
    { id: 'guide', label: 'Справочник разметки', icon: BookOpen },
    {
      id: 'history',
      label: 'История шаблонов',
      icon: History,
      meta: history.length > 0 ? String(history.length) : undefined,
    },
  ];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation (248px) */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[248px] shrink-0 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Wordmark */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSection('uniquifier');
              setMobileMenuOpen(false);
            }}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Автозагрузка
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
            aria-label="Закрыть меню"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Разделы автозагрузки">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.meta && (
                  <span className="font-mono text-xs tabular-nums text-slate-400 shrink-0">
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Static Preservation Policy Footer */}
        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Что нейросеть не трогает</span>
          </div>
          <ul className="space-y-1 text-xs text-slate-500 leading-relaxed">
            <li>Цифры — цены, пробег, годы</li>
            <li>Контакты — адреса и телефоны</li>
            <li>Марки, модели, артикулы и %art%</li>
          </ul>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (SaaS Breadcrumb + Single-Line Context Action) */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
              aria-label="Открыть меню"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 whitespace-nowrap hidden sm:inline">
                Автозагрузка
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">
                {sectionLabels[section]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {section === 'uniquifier' ? (
              <button
                type="button"
                onClick={() => setSection('dates')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Генератор дат
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSection('uniquifier')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Braces className="w-3.5 h-3.5" />
                Уникализатор описаний
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6">
          {section === 'uniquifier' && (
            <div className="max-w-[1360px] mx-auto space-y-5">
              {/* Workspace Heading & Presets Row */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">
                    Уникализатор описаний
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Вставьте обычное описание до 7 000 символов — нейросеть создаст шаблон с синонимами и перемешиванием, чтобы каждое объявление было уникальным.
                  </p>
                </div>

                {/* Depth Control */}
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div
                    className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg"
                    role="group"
                    aria-label="Глубина уникализации"
                  >
                    <button
                      type="button"
                      onClick={() => setIntensity('standard')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        intensity === 'standard'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Стандарт
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntensity('deep')}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        intensity === 'deep'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Глубокая
                    </button>
                  </div>
                </div>
              </div>

              {/* Background Recovery Notice */}
              {recoveredNotice && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{recoveredNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecoveredNotice(null)}
                    className="text-emerald-700 hover:text-emerald-900 p-1"
                    aria-label="Скрыть уведомление"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* API Error Alert */}
              {apiError && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{apiError}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleGenerateTemplate}
                      disabled={!description.trim() || isOverLimit || isGenerating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-800 bg-white border border-red-200 hover:bg-red-100/60 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Повторить
                    </button>
                    <button
                      type="button"
                      onClick={() => setApiError(null)}
                      className="text-red-600 hover:text-red-900 p-1"
                      aria-label="Закрыть ошибку"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Primary Dual-Column Workspace */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch min-h-[540px]">
                {/* LEFT COLUMN: Description Input OR Buyer Preview */}
                <section className="flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden h-full">
                  <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setLeftTab('description')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          leftTab === 'description'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Описание объявления
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (previewVariants.length === 0 && template.trim()) {
                            generatePreviewVariants(previewMode);
                          }
                          setLeftTab('preview');
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                          leftTab === 'preview'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Пример для покупателя
                      </button>
                    </div>

                    {leftTab === 'description' && description.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDescription('')}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Очистить
                      </button>
                    )}
                  </div>

                  {leftTab === 'description' ? (
                    <>
                      <div className="flex-1 flex flex-col min-h-[420px]">
                        <textarea
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Вставьте описание объявления любой тематики (до 7 000 символов). Цифры, цены, телефоны, адреса, бренды, модели и подстановки вроде %арт% или (Столбик) останутся без изменений..."
                          aria-label="Описание объявления"
                          className="editor-scroll flex-1 w-full p-5 text-[14.5px] leading-[1.68] text-slate-800 placeholder:text-slate-400 bg-white resize-none focus:outline-none"
                        />
                      </div>

                      {/* Generation Tools Selector Bar */}
                      <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50/40 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-600">
                            Инструменты для генерации
                          </span>
                          <button
                            type="button"
                            onClick={() => setSection('columns')}
                            className="text-blue-700 hover:underline whitespace-nowrap"
                          >
                            {knownColumnNames.length > 0
                              ? `Столбики: ${knownColumnNames.length}`
                              : '+ Столбики (...)'}
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              { key: 'useChoice', code: '{ | }', tip: 'Выбор синонима' },
                              { key: 'useParagraphs', code: '[+\\n+ |]', tip: 'Перемешать абзацы' },
                              { key: 'useCommaList', code: '[+,+ |]', tip: 'Перемешать перечисления' },
                              { key: 'useShuffle', code: '[ | ]', tip: 'Перемешать элементы' },
                              { key: 'useStrong', code: '<strong>', tip: 'Выделение жирным' },
                              { key: 'addDate', code: '%дата%', tip: 'Добавить %дата% / %дата+1%' },
                              { key: 'addAutoArt', code: '%арт%', tip: 'Добавить авто-артикул %арт%' },
                              { key: 'addCustomArt', code: '#арт#', tip: 'Добавить свой артикул #арт#{...}#арт#' },
                            ] as const
                          ).map((item) => {
                            const active = genTools[item.key];
                            return (
                              <button
                                key={item.key}
                                type="button"
                                aria-pressed={active}
                                title={item.tip}
                                onClick={() =>
                                  setGenTools((prev) => ({
                                    ...prev,
                                    [item.key]: !prev[item.key],
                                  }))
                                }
                                className={`px-2 py-1 font-mono text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                                  active
                                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                                }`}
                              >
                                {item.code}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Left Footer: Counter & Primary CTA */}
                      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-200 bg-slate-50/60">
                        <div className="text-xs">
                          {isOverLimit ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-red-600">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono tabular-nums">
                                {description.length.toLocaleString('ru-RU')} / 7 000
                              </span>
                              <span>
                                · Сократите на{' '}
                                <strong className="font-mono tabular-nums">
                                  {excessChars.toLocaleString('ru-RU')}
                                </strong>{' '}
                                симв.
                              </span>
                            </span>
                          ) : (
                            <span className="text-slate-500">
                              <span className="font-mono tabular-nums text-slate-700 font-medium">
                                {description.length.toLocaleString('ru-RU')}
                              </span>{' '}
                              / 7 000 символов
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={handleGenerateTemplate}
                          disabled={!description.trim() || isOverLimit || isGenerating}
                          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          {isGenerating ? 'Создаём шаблон…' : 'Создать шаблон'}
                          {!isGenerating && (
                            <span className="text-blue-200 font-normal">· Бесплатно</span>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <BuyerPreviewPanel
                      variants={previewVariants}
                      mode={previewMode}
                      onModeChange={handlePreviewModeChange}
                      onRegenerate={() => generatePreviewVariants(previewMode)}
                      onBackToDescription={() => setLeftTab('description')}
                      hasErrors={templateHasErrors}
                      detectedColumns={templateAnalysis.stats.columnRefs}
                      columns={columns}
                      onUpdateColumn={handleUpdateColumnInline}
                    />
                  )}
                </section>

                {/* RIGHT COLUMN: Syntax-Highlighted Spintax Template Editor */}
                <SpintaxEditor
                  value={template}
                  onChange={setTemplate}
                  knownColumns={knownColumnNames}
                  isGenerating={isGenerating}
                  onPreview={handleShowPreview}
                  onCopy={handleCopyTemplate}
                  copied={copiedTemplate}
                />
              </div>

              {/* 15 Headlines Generator Panel (from loaded description) */}
              <TitlesGeneratorPanel
                description={description}
                isDescriptionOverLimit={isOverLimit}
                value={titlesTemplate}
                onChange={setTitlesTemplate}
              />

              {/* Clean Architectural Reference Footer Strip */}
              <div className="grid grid-cols-1 md:grid-cols-3 bg-white border border-slate-200 rounded-xl divide-y md:divide-y-0 md:divide-x divide-slate-200">
                <div className="p-4">
                  <h3 className="text-xs font-semibold text-slate-900">
                    01. Факты остаются нетронутыми
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Цифры, цены, размеры, контакты, адреса, марки, модели, артикулы и подстановки вроде{' '}
                    <span className="font-mono text-slate-700">%art%</span> или{' '}
                    <span className="font-mono text-slate-700">(Столбик)</span> сохраняются без изменений.
                  </p>
                </div>
                <div className="p-4">
                  <h3 className="text-xs font-semibold text-slate-900">
                    02. Проверка своего шаблона
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Вставьте готовую разметку в правое поле: скобки и разделители подсветятся сразу, а ошибки покажутся с номером строки ещё до нажатия «Показать пример».
                  </p>
                </div>
                <div className="p-4">
                  <h3 className="text-xs font-semibold text-slate-900">
                    03. Сохранение при закрытии окна
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Генерация выполняется в фоне на сервере — если закрыть вкладку, готовый шаблон сохранится и автоматически загрузится при возвращении.
                  </p>
                </div>
              </div>
            </div>
          )}

          {section === 'dates' && <DateGeneratorView />}

          {section === 'columns' && (
            <ColumnsManagerView
              columns={columns}
              onChange={setColumns}
              onInsertIntoTemplate={handleInsertIntoTemplate}
            />
          )}

          {section === 'guide' && (
            <SyntaxGuideView
              columns={columns}
              onInsertIntoTemplate={handleInsertIntoTemplate}
            />
          )}

          {section === 'history' && (
            <HistoryView
              records={history}
              knownColumns={knownColumnNames}
              onLoad={handleLoadHistoryRecord}
              onDelete={handleDeleteHistoryRecord}
            />
          )}
        </main>
      </div>
    </div>
  );
}
