import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_DESCRIPTION_LENGTH = 7000;
const STORE_PATH = path.resolve(__dirname, '.jobs-store.json');

interface GenerationTools {
  useChoice: boolean;
  useShuffle: boolean;
  useParagraphs: boolean;
  useCommaList: boolean;
  useStrong: boolean;
  addDate: boolean;
  addAutoArt: boolean;
  addCustomArt: boolean;
  columns: string[];
}

const DEFAULT_GENERATION_TOOLS: GenerationTools = {
  useChoice: true,
  useShuffle: true,
  useParagraphs: true,
  useCommaList: true,
  useStrong: true,
  addDate: false,
  addAutoArt: false,
  addCustomArt: false,
  columns: [],
};

interface UniquifyJob {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  description: string;
  template: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  intensity: 'standard' | 'deep';
  tools: GenerationTools;
}

const jobs = new Map<string, UniquifyJob>();

function loadJobsFromDisk(): void {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as UniquifyJob[];
      if (Array.isArray(parsed)) {
        for (const job of parsed.slice(-50)) {
          // If the server restarted mid-pending, mark gracefully so client isn't stuck forever
          if (job.status === 'pending') {
            job.status = 'failed';
            job.error = 'Сервер был перезапущен во время генерации. Попробуйте запустить ещё раз.';
          }
          jobs.set(job.id, job);
        }
      }
    }
  } catch {
    // Start fresh if store file is missing or unreadable
  }
}

function persistJobsToDisk(): void {
  try {
    const list = Array.from(jobs.values()).slice(-50);
    fs.writeFileSync(STORE_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch {
    // Non-fatal if filesystem is read-only
  }
}

loadJobsFromDisk();

const SYSTEM_INSTRUCTION = `Ты — профессиональный редактор и специалист по спинтакс-шаблонам (уникализатор описаний) для массовой автозагрузки объявлений любых тематик (мебель, недвижимость, услуги, товары, техника, транспорт, стройматериалы и др.).

Твоя задача: превратить переданное пользователем описание объявления в качественный, грамматически безупречный шаблон уникализации, используя ТОЛЬКО следующий синтаксис:

1. {вариант 1|вариант 2|вариант 3} — выбор одного варианта из списка.
   Правило согласования: ВСЕ варианты внутри одной скобки {...} должны быть в ОДИНАКОВОМ роде, числе и падеже, чтобы в любой комбинации текст звучал естественно и грамотно по-русски. Если синоним требует другого предлога или окончания соседнего слова — включай это слово внутрь скобки целиком.

2. [элемент 1|элемент 2|элемент 3] — перемешивание элементов без разделителя (используй только там, где элементы должны склеиваться вплотную).

3. [+\\n+ абзац 1|абзац 2|абзац 3] — перемешивание независимых абзацев или пунктов списка (разделяются переносом строки).
   Обязательно используй буквальную последовательность [+\\n+ в начале скобки.
   Внутри каждого абзаца можно и нужно вкладывать {синонимы|варианты}.
   Перемешивай только логически независимые абзацы или блоки преимуществ. Вступительное предложение и финальный блок с контактами оставляй на своих местах, уникализируя их формулировки через {...}.

4. [+,+ пункт 1|пункт 2|пункт 3] — перемешивание однородных перечислений через запятую (или другой разделитель, например [+ • + ...] или [+ / + ...]).

5. <strong>текст</strong> — сохраняй существующее выделение жирным или аккуратно выделяй важные заголовки/акценты тегом <strong>...</strong> (не злоупотребляй).

КРИТИЧЕСКИ ВАЖНО — ЧТО КАТЕГОРИЧЕСКИ НЕЛЬЗЯ ТРОГАТЬ И ИЗМЕНЯТЬ:
- Любые ЦИФРЫ и числа: цены, размеры, габариты, вес, сроки, годы, пробег, площади, проценты, номера домов/квартир, количества. Оставляй их точь-в-точь как в исходнике.
- Любые КОНТАКТЫ: номера телефонов, адреса, названия улиц, станции метро, имена, ссылки, ники в мессенджерах, график работы.
- Любые МАРКИ, МОДЕЛИ, БРЕНДЫ, НАЗВАНИЯ КОЛЛЕКЦИЙ и АРТИКУЛЫ.
- Любые существующие ПОДСТАНОВКИ и МАКРОСЫ: %art%, %арт%, %дата%, %дата+1% (и любые %дата+N%), #арт#...#арт#, а также любые переменные столбцов в круглых скобках — копируй их 1 в 1 без изменений.
- Строго работай ТОЛЬКО с текстом, который передал пользователь. Никогда не выдумывай факты или товары, которых нет в исходном описании.

ТРЕБОВАНИЯ К РАЗМЕТКЕ И КАЧЕСТВУ:
- Все открытые скобки {, [ и теги <strong> ОБЯЗАТЕЛЬНО должны быть правильно закрыты. Ни одной пропущенной или лишней скобки.
- Не используй Markdown-форматирование (никаких **жирный**, никаких \`\`\` и пояснений до или после текста).
- Верни ТОЛЬКО готовый шаблон уникализации — без вступлений, комментариев и обёрток.
- Сохраняй структуру, тематику и смысл исходного объявления, делая текст живым и естественным (3–5 синонимов на ключевые фразы и глаголы).`;

function cleanGeneratedTemplate(raw: string): string {
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  return text;
}

function isTransientError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('deadline') ||
    lower.includes('timeout') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset')
  );
}

function formatFriendlyError(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('403') || lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return 'Ошибка доступа к API нейросети. Проверьте ключ GEMINI_API_KEY в Settings > Secrets.';
  }
  if (lower.includes('429') || lower.includes('resource_exhausted')) {
    return 'Превышен лимит запросов к нейросети. Подождите немного и попробуйте снова.';
  }
  if (isTransientError(msg)) {
    return 'Сервер нейросети временно перегружен из-за высокого спроса (503). Нажмите «Повторить» через несколько секунд.';
  }
  return 'Не удалось сгенерировать шаблон. Попробуйте повторить запрос.';
}

async function runUniquifyJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    job.status = 'failed';
    job.error = 'Не настроен ключ GEMINI_API_KEY на сервере. Проверьте Settings > Secrets.';
    job.completedAt = new Date().toISOString();
    persistJobsToDisk();
    return;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const tools = job.tools ?? DEFAULT_GENERATION_TOOLS;

  const toolDirectives: string[] = [];
  if (tools.useChoice) {
    toolDirectives.push(
      job.intensity === 'deep'
        ? '- Используй {вариант 1|вариант 2|вариант 3|вариант 4} максимально активно (4–5 естественных синонимов почти на каждую фразу).'
        : '- Используй {вариант 1|вариант 2|вариант 3} (3–4 естественных синонима для ключевых фраз и глаголов).'
    );
  } else {
    toolDirectives.push('- НЕ добавляй новые блоки выбора { | }.');
  }

  if (tools.useParagraphs) {
    toolDirectives.push(
      '- Перемешивай логически независимые абзацы и списки преимуществ через [+\\n+ абзац 1|абзац 2|абзац 3].'
    );
  } else {
    toolDirectives.push('- НЕ используй перемешивание абзацев [+\\n+ |].');
  }

  if (tools.useCommaList) {
    toolDirectives.push(
      '- Перемешивай однородные перечисления через [+,+ пункт 1|пункт 2|пункт 3] (или другой подходящий разделитель внутри +...+).'
    );
  } else {
    toolDirectives.push('- НЕ используй перемешивание перечислений [+,+ |].');
  }

  if (tools.useShuffle) {
    toolDirectives.push(
      '- При наличии подходящих слитных последовательностей/кодов допускается перемешивание [элемент1|элемент2].'
    );
  } else {
    toolDirectives.push('- НЕ используй слитное перемешивание [ | ].');
  }

  if (tools.useStrong) {
    toolDirectives.push(
      '- Выдели 1–3 ключевых заголовка или акцента тегом <strong>текст</strong>.'
    );
  } else {
    toolDirectives.push('- НЕ добавляй теги <strong>...</strong> (если их не было в исходнике).');
  }

  if (tools.addDate) {
    toolDirectives.push(
      '- Органично добавь в текст актуальность с использованием %дата% и/или %дата+1% (или %дата+3%), подходящую по смыслу объявлению.'
    );
  }

  if (tools.addAutoArt) {
    toolDirectives.push(
      '- Если в тексте ещё нет %арт% или %art%, добавь в конце строку с автогенерируемым артикулом %арт%.'
    );
  }

  if (tools.addCustomArt) {
    toolDirectives.push(
      '- Добавь в конце собственный уникальный артикул с удалением пробелов через конструкцию #арт#{...}#арт# (например: #арт#{1|2|3}{4|5|6}{7|8|9}{0|1|2}#арт# или с буквенным префиксом под тему).'
    );
  }

  if (tools.columns && tools.columns.length > 0) {
    const colList = tools.columns.map((c) => `(${c})`).join(', ');
    toolDirectives.push(
      `- У пользователя настроены столбики таблицы: ${colList}. Если они уже есть в тексте — обязательно сохрани их 1 в 1; если уместно по смыслу — можешь интегрировать подходящие столбики в круглых скобках.`
    );
  }

  const userPrompt = `Примени к описанию следующие инструменты уникализации:
${toolDirectives.join('\n')}

Исходное описание объявления:
"""
${job.description}
"""

Верни ТОЛЬКО готовый шаблон уникализации для этого описания:`;

  // Try primary model with backoff, then automatically fall back to gemini-3.1-flash-lite on 503 spikes
  const executionPlan: Array<{
    model: string;
    thinkingLevel?: ThinkingLevel;
    delayBeforeMs: number;
  }> = [
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 0 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 1800 },
    { model: 'gemini-3.1-flash-lite', delayBeforeMs: 1200 },
    { model: 'gemini-3.1-flash-lite', delayBeforeMs: 2500 },
  ];

  let lastRawError = 'Не удалось получить ответ от нейросети.';

  for (const step of executionPlan) {
    if (step.delayBeforeMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, step.delayBeforeMs));
    }

    try {
      const response = await ai.models.generateContent({
        model: step.model,
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          ...(step.thinkingLevel
            ? { thinkingConfig: { thinkingLevel: step.thinkingLevel } }
            : {}),
        },
      });

      const rawText = response.text;
      if (!rawText || !rawText.trim()) {
        throw new Error('Empty response from model');
      }

      job.template = cleanGeneratedTemplate(rawText);
      job.status = 'completed';
      job.error = null;
      job.completedAt = new Date().toISOString();
      persistJobsToDisk();
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      lastRawError = msg;

      // Stop immediately on auth/key errors — retrying won't help
      const lower = msg.toLowerCase();
      if (
        lower.includes('403') ||
        lower.includes('permission_denied') ||
        lower.includes('api_key_invalid')
      ) {
        break;
      }
      // Otherwise continue to next retry / fallback model
    }
  }

  job.status = 'failed';
  job.error = formatFriendlyError(lastRawError);
  job.completedAt = new Date().toISOString();
  persistJobsToDisk();
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Create a background uniquification job (persists even if browser tab closes)
  app.post('/api/jobs', (req, res) => {
    const { description, intensity, tools } = req.body as {
      description?: unknown;
      intensity?: unknown;
      tools?: Partial<GenerationTools>;
    };

    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'Введите текст описания объявления.' });
      return;
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      const excess = description.length - MAX_DESCRIPTION_LENGTH;
      res.status(400).json({
        error: `Превышен лимит в ${MAX_DESCRIPTION_LENGTH} символов на ${excess} симв. Сократите текст перед созданием шаблона.`,
      });
      return;
    }

    const sanitizedTools: GenerationTools = {
      useChoice: typeof tools?.useChoice === 'boolean' ? tools.useChoice : true,
      useShuffle: typeof tools?.useShuffle === 'boolean' ? tools.useShuffle : true,
      useParagraphs: typeof tools?.useParagraphs === 'boolean' ? tools.useParagraphs : true,
      useCommaList: typeof tools?.useCommaList === 'boolean' ? tools.useCommaList : true,
      useStrong: typeof tools?.useStrong === 'boolean' ? tools.useStrong : true,
      addDate: Boolean(tools?.addDate),
      addAutoArt: Boolean(tools?.addAutoArt),
      addCustomArt: Boolean(tools?.addCustomArt),
      columns: Array.isArray(tools?.columns)
        ? tools.columns.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 30)
        : [],
    };

    const jobId = crypto.randomUUID();
    const job: UniquifyJob = {
      id: jobId,
      status: 'pending',
      description,
      template: null,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
      intensity: intensity === 'deep' ? 'deep' : 'standard',
      tools: sanitizedTools,
    };

    jobs.set(jobId, job);
    persistJobsToDisk();

    // Fire-and-forget background task so closing browser window never interrupts generation
    void runUniquifyJob(jobId);

    res.status(202).json({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
    });
  });

  // Poll job status
  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Задача не найдена.' });
      return;
    }
    res.json(job);
  });

  // List recent jobs (for recovery / history)
  app.get('/api/jobs', (_req, res) => {
    const recent = Array.from(jobs.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
    res.json({ jobs: recent });
  });

  // Generate 15 headlines from description formatted as {Title 1|Title 2|...|Title 15}
  app.post('/api/titles', async (req, res) => {
    const { description, excludePrice } = req.body as {
      description?: unknown;
      excludePrice?: unknown;
    };

    if (typeof description !== 'string' || !description.trim()) {
      res.status(400).json({ error: 'Введите текст описания объявления, чтобы создать заголовки.' });
      return;
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      const excess = description.length - MAX_DESCRIPTION_LENGTH;
      res.status(400).json({
        error: `Превышен лимит в ${MAX_DESCRIPTION_LENGTH} символов на ${excess} симв. Сократите описание.`,
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'Не настроен ключ GEMINI_API_KEY на сервере. Проверьте Settings > Secrets.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const hidePrice = excludePrice !== false;

    const titleSystemInstruction = `Ты — профессиональный копирайтер объявлений для Авито и досок объявлений любых тематик.

Твоя задача: на основании переданного пользователем описания составить ровно 15 разных, сильных заголовков по формуле:
«Ключевик + УТП + конкретика».

СТРОГИЕ ПРАВИЛА:
1. Ровно 15 уникальных заголовков с разными поисковыми формулировками (ключевиками) в начале.
2. Длина КАЖДОГО заголовка СТРОГО не более 100 символов с учётом пробелов (оптимально 70–94 символа, чтобы точно не превысить лимит).
3. Используй ТОЛЬКО факты, параметры, сроки, материалы, размеры, локацию и преимущества из переданного описания. Ничего не выдумывай.
4. ${hidePrice ? 'КАТЕГОРИЧЕСКИ НЕ указывай цены, стоимость и символ ₽ в заголовках.' : 'При необходимости можно указывать точные цены из исходного описания.'}
5. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать в заголовке количество символов (никаких «(85 зн.)», «[90 симв.]»), нумерацию («1.»), фигурные скобки «{}» и вертикальную черту «|».
6. Верни JSON-объект со строгим массивом "headlines" из 15 чистых строк.`;

    const titlePrompt = `Составь ровно 15 заголовков по формуле «Ключевик + УТП + конкретика» (до 100 символов с пробелами каждый, без указания количества знаков) на основании этого описания:

"""
${description}
"""`;

    const executionPlan: Array<{
      model: string;
      thinkingLevel?: ThinkingLevel;
      delayBeforeMs: number;
    }> = [
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 0 },
      { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, delayBeforeMs: 1500 },
      { model: 'gemini-3.1-flash-lite', delayBeforeMs: 1000 },
      { model: 'gemini-3.1-flash-lite', delayBeforeMs: 2200 },
    ];

    const sanitizeHeadline = (raw: string): string => {
      let text = raw
        .replace(/^\s*\d+[\.\)\-]\s*/, '')
        .replace(/\s*[\(\[]\s*\d+\s*(?:зн\.?|симв\.?|знаков|символов)\s*[\)\]]\s*$/i, '')
        .replace(/[{}|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > 100) {
        const sliced = text.slice(0, 100);
        const lastSpace = sliced.lastIndexOf(' ');
        text = (lastSpace > 50 ? sliced.slice(0, lastSpace) : sliced)
          .replace(/[\s,—–\-:;]+$/g, '')
          .trim();
      }
      return text;
    };

    let lastRawError = 'Не удалось сгенерировать заголовки.';

    for (const step of executionPlan) {
      if (step.delayBeforeMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, step.delayBeforeMs));
      }

      try {
        const response = await ai.models.generateContent({
          model: step.model,
          contents: titlePrompt,
          config: {
            systemInstruction: titleSystemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headlines: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Ровно 15 заголовков до 100 символов каждый без подсчёта знаков.',
                },
              },
              required: ['headlines'],
            },
            ...(step.thinkingLevel
              ? { thinkingConfig: { thinkingLevel: step.thinkingLevel } }
              : {}),
          },
        });

        const rawJson = (response.text ?? '').trim();
        const parsed = JSON.parse(rawJson) as { headlines?: unknown };
        if (!Array.isArray(parsed.headlines) || parsed.headlines.length === 0) {
          throw new Error('Model returned empty headlines array');
        }

        const cleaned = parsed.headlines
          .filter((item): item is string => typeof item === 'string')
          .map(sanitizeHeadline)
          .filter((item) => item.length > 0)
          .slice(0, 15);

        if (cleaned.length === 0) {
          throw new Error('No valid headlines produced');
        }

        const template = `{${cleaned.join('|')}}`;
        res.json({
          template,
          headlines: cleaned,
        });
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastRawError = msg;
        const lower = msg.toLowerCase();
        if (
          lower.includes('403') ||
          lower.includes('permission_denied') ||
          lower.includes('api_key_invalid')
        ) {
          break;
        }
      }
    }

    res.status(503).json({ error: formatFriendlyError(lastRawError) });
  });

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
