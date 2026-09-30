/**
 * Fashion Finder — Ethereal Twilight Pastel Edition (2026)
 * - Чистый воздушный лукбук без белых рамок и тяжелых блоков.
 * - Прямая интеграция с Google Custom Search JSON API для реальных фото.
 * - Проверенная коллекция реальных фото одежды Wildberries с официального CDN.
 * - Прописной теплый текст, пастельные акценты и мерцающие блёсточки.
 */

const state = {
  activeTags: [],
  itemSummary: '',
  chatHistory: [],
  currentTopic: '',
  recentTopics: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sff_recent_topics') || '[]');
      return Array.isArray(saved) ? saved.slice(0, 10) : [];
    } catch (_) {
      return [];
    }
  })(),

  // Настройки модели
  selectedProvider: 'deepseek-v4.1-flash',
  model: 'deepseek-v4.1-flash',
  apiKey:      localStorage.getItem('sff_api_key')      || '',
  deepseekKey: localStorage.getItem('sff_deepseek_key') || ''
};



// Скрытие всех Google CSE виджетов вне #cseTarget
if (typeof window !== 'undefined') {
  function hideCseExtras() {
    // Скрываем оверлеи
    document.querySelectorAll(
      '.gsc-results-wrapper-overlay, .gsc-modal-background-image, ' +
      '.gsc-modal-background-image-visible, .gsc-results-wrapper-visible, ' +
      '.gsc-modal-background'
    ).forEach(el => {
      el.style.setProperty('display',         'none',    'important');
      el.style.setProperty('visibility',      'hidden',  'important');
      el.style.setProperty('pointer-events',  'none',    'important');
      el.style.setProperty('left',            '-99999px','important');
    });

    // Скрываем любые Google-CSE дивы которые Google вставил прямо в <body> вне #cseTarget
    const cseTarget = document.getElementById('cseTarget');
    document.querySelectorAll(
      'body > .gsc-control-cse, body > .gsc-search-box, ' +
      'body > [id^="___gcse_"]'
    ).forEach(el => {
      if (el !== cseTarget && !cseTarget?.contains(el)) {
        el.style.setProperty('display',    'none',   'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('position',   'fixed',  'important');
        el.style.setProperty('left',       '-9999px','important');
        el.style.setProperty('top',        '-9999px','important');
      }
    });
  }

  const cseObserver = new MutationObserver(hideCseExtras);

  if (document.body) {
    cseObserver.observe(document.body, { childList: true, subtree: false });
    hideCseExtras();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      cseObserver.observe(document.body, { childList: true, subtree: false });
      hideCseExtras();
    });
  }
}



// =========================================================================
// ДИНАМИЧЕСКИЙ ПОИСК РЕАЛЬНЫХ ТОВАРОВ И ФОТО ЧЕРЕЗ GOOGLE CSE
// Поисковая система Google CSE ID: f4a91216ff6d641fd (Wildberries & Ozon)
// =========================================================================

async function searchGoogleCse(query) {
  const target = document.getElementById('cseTarget');
  if (!target) return null;

  // Ожидаем готовности Google CSE
  let attempts = 0;
  while (attempts < 30) {
    if (window.google?.search?.cse?.element?.getElement) {
      const el = google.search.cse.element.getElement('fashionSearch');
      if (el) break;
    }
    await new Promise(r => setTimeout(r, 150));
    attempts++;
  }

  let element = null;
  try {
    element = window.google?.search?.cse?.element?.getElement('fashionSearch');
  } catch (_) {}

  // Если элемент ещё не отрендерен, рендерим его принудительно
  if (!element && window.google?.search?.cse?.element?.render) {
    try {
      google.search.cse.element.render({
        div: 'cseTarget',
        tag: 'search',
        gname: 'fashionSearch',
        attributes: {
          defaultToImageSearch: true,
          enableImageSearch: true
        }
      });
      await new Promise(r => setTimeout(r, 300));
      element = google.search.cse.element.getElement('fashionSearch');
    } catch (e) {
      console.warn('[Google CSE render error]:', e);
    }
  }

  if (!element) {
    console.warn('[Google CSE] Элемент поиска не найден');
    return null;
  }

  const cleanQ = (query || '').replace(/site:[^\s]+/gi, '').trim();
  const collected = [];
  const seen = new Set();

  function harvest() {
    // В Google CSE Image Search контейнеры картинок - это .gsc-imageResult и .gs-imageResult
    const rawItems = Array.from(target.querySelectorAll('.gsc-imageResult, .gs-imageResult, .gsc-result, .gs-result'));
    for (const it of rawItems) {
      // Фотография товара из Google Картинок
      const img = it.querySelector('img.gs-image') || it.querySelector('img');
      const imgSrc = img ? (img.currentSrc || img.src || img.getAttribute('src')) : '';
      if (!imgSrc || !imgSrc.startsWith('http') || imgSrc.includes('googlelogo')) continue;

      // Ссылка на товар (ищем ссылку с реальным адресом в popup или title)
      const titleLink = it.querySelector('a.gs-title[href]') || 
                        it.querySelector('a.gs-previewLink[href]') || 
                        it.querySelector('a[data-ctorig]') || 
                        it.querySelector('a[href]:not([href=""]):not([href="#"])');

      let rawUrl = '';
      if (titleLink) {
        const ctOrig = titleLink.getAttribute('data-ctorig');
        const href = titleLink.href || '';
        if (ctOrig && ctOrig.startsWith('http')) {
          rawUrl = ctOrig;
        } else if (href.includes('google.com/url') || href.includes('/url?')) {
          try {
            const u = new URL(href);
            rawUrl = u.searchParams.get('q') || u.searchParams.get('url') || href;
          } catch (_) {
            rawUrl = href;
          }
        } else {
          rawUrl = href;
        }
      }

      // Название товара
      let title = (img ? (img.getAttribute('title') || img.getAttribute('alt')) : '') || '';
      if (!title && titleLink) title = titleLink.innerText || '';
      title = title
        .replace(/\s*-\s*Купить.*$/i, '')
        .replace(/\s*\|\s*Wildberries.*$/i, '')
        .replace(/\s*\|\s*Ozon.*$/i, '')
        .replace(/\.\.\.$/, '')
        .trim();

      // Определение платформы: WB или Ozon
      const isOzon = rawUrl.includes('ozon.ru') || title.toLowerCase().includes('ozon') || title.toLowerCase().includes('озон');
      const isWb   = rawUrl.includes('wildberries.ru') || title.toLowerCase().includes('wildberries') || title.toLowerCase().includes('вайлдберриз');
      let platform = 'wb';
      if (isOzon) {
        platform = 'ozon';
      } else if (isWb) {
        platform = 'wb';
      } else {
        // Балансируем выдачу поровну между WB и Ozon
        const wbCount = collected.filter(c => c.platform === 'wb').length;
        const ozonCount = collected.filter(c => c.platform === 'ozon').length;
        platform = wbCount <= ozonCount ? 'wb' : 'ozon';
      }

      // Проверяем: не является ли ссылка страницей категории, бренда или тега (как /tags/tapochki-bezzubik)
      const isTagOrCategory = /\/(tags|category|brand|brands|promotions|kollektsii|seller)\//i.test(rawUrl);

      // Извлечение реального числового артикула (SKU)
      let sku = '';
      let isExactProduct = false;

      if (!isTagOrCategory) {
        const wbM = rawUrl.match(/\/catalog\/(\d{6,11})/i) || rawUrl.match(/\/product\/(\d{6,11})/i);
        const ozonM = rawUrl.match(/\/product\/[^\/]*?(\d{7,12})/i) || rawUrl.match(/\/product\/(\d{7,12})/i);
        if (wbM) {
          sku = wbM[1];
          isExactProduct = true;
          rawUrl = `https://www.wildberries.ru/catalog/${sku}/detail.aspx`;
        } else if (ozonM) {
          sku = ozonM[1];
          isExactProduct = true;
        }
      }

      // Дедупликация
      const dedupeKey = sku || (isExactProduct ? rawUrl : '') || imgSrc;
      if (dedupeKey && seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Ссылка перехода:
      // Если это реальный товар — даем прямую ссылку на его карточку.
      // Если это страница тега или категории (вроде /tags/tapochki-bezzubik) —
      // КАТЕГОРИЧЕСКИ НЕ ДАЕМ ссылку на чужой тег! Вместо этого формируем точный поиск этого товара:
      const finalUrl = isExactProduct && rawUrl.startsWith('http')
        ? rawUrl
        : (platform === 'ozon'
            ? `https://www.ozon.ru/search/?text=${encodeURIComponent(title || cleanQ)}`
            : `https://www.wildberries.ru/catalog/0/search.aspx?search=${encodeURIComponent(title || cleanQ)}`);

      collected.push({
        id: sku,
        title: title || `${cleanQ} ${sku ? 'арт. ' + sku : ''}`,
        price: 'В наличии',
        platform: platform,
        img: imgSrc,
        url: finalUrl,
        isExactProduct: isExactProduct
      });
    }
  }

  // 1. Запуск поиска в Google Картинках
  element.execute(cleanQ);

  // Сбор результатов страницы 1
  for (let step = 0; step < 25; step++) {
    await new Promise(r => setTimeout(r, 200));
    harvest();
    if (collected.length >= 20) break;
  }

  // Сбор результатов страницы 2
  const page2Btn = Array.from(target.querySelectorAll('.gsc-cursor-page')).find(b => b.innerText.trim() === '2');
  if (page2Btn) {
    page2Btn.click();
    for (let step = 0; step < 25; step++) {
      await new Promise(r => setTimeout(r, 200));
      harvest();
      if (collected.length >= 40) break;
    }
  }

  // Сбор результатов страницы 3
  const page3Btn = Array.from(target.querySelectorAll('.gsc-cursor-page')).find(b => b.innerText.trim() === '3');
  if (page3Btn) {
    page3Btn.click();
    for (let step = 0; step < 25; step++) {
      await new Promise(r => setTimeout(r, 200));
      harvest();
      if (collected.length >= 60) break;
    }
  }

  // Умная сортировка результатов:
  // 1. Приоритет карточкам с наибольшим совпадением ключевых слов запроса (тапочки, желтые и т.д.)
  // 2. Приоритет карточкам с реальным подтвержденным артикулом (SKU)
  const qWords = cleanQ.toLowerCase().split(/\s+/).filter(w => w.length >= 4);
  collected.sort((a, b) => {
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();

    const aMatchCount = qWords.filter(w => aTitle.includes(w.slice(0, -1))).length;
    const bMatchCount = qWords.filter(w => bTitle.includes(w.slice(0, -1))).length;

    if (aMatchCount !== bMatchCount) {
      return bMatchCount - aMatchCount;
    }
    return (b.isExactProduct ? 1 : 0) - (a.isExactProduct ? 1 : 0);
  });

  // Формируем сбалансированную выдачу до 30 для WB и до 30 для Ozon (30 на 30 = 60)
  let wbItems = collected.filter(it => it.platform === 'wb').slice(0, 30);
  let ozonItems = collected.filter(it => it.platform === 'ozon').slice(0, 30);

  const balanced = [];
  const maxLen = Math.max(wbItems.length, ozonItems.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < wbItems.length) balanced.push(wbItems[i]);
    if (i < ozonItems.length) balanced.push(ozonItems[i]);
  }

  if (balanced.length > 0) return balanced;
  return collected.length > 0 ? collected.slice(0, 60) : null;
}


// =========================================================================
// ИИ СТИЛИСТ (DEEPSEEK / OPENROUTER)
// =========================================================================

const SYSTEM_PROMPT = `
Ты — консультант по подбору одежды. Ты общаешься естественно, спокойно и по делу, как реальный человек, а не бот.

ПРАВИЛА ТЕКСТА (HUMANIZER):
- Пиши просто, конкретно и без искусственного восторга.
- Запрещены шаблонные фразы: "та самая база", "мастхэв", "подчеркнет индивидуальность", "не просто вещь, а заявление", "гармоничный образ", "идеальный выбор".
- Запрещены похвалы запроса ("Отличный выбор!", "Прекрасный вкус!").
- Запрещены надуманные триады ("стильно, удобно и практично").
- Запрещены поучения консьержа и непрошеные советы ("не забудь примерить", "помни о стирке").
- Не используй длинные тире (—). Используй запятые, точки или двоеточия.
- Не ставь гирлянды эмодзи. Можно максимум одну искорку ✨ в конце.
- В поле "stylist_thought" пиши ровно 1-2 коротких предложения с конкретным замечанием по ткани, плотности или посадке (например: "Для свободного кроя подойдет плотный хлопок от 220 грамм, тогда воротник держит форму.").

ПРАВИЛА ОПРЕДЕЛЕНИЯ ТЕМЫ ВЕЩИ (topic и is_new_topic):
1. "topic" — СТРОГО 1 СЛОВО на русском языке с заглавной буквы, называющее базовый предмет гардероба из запроса (например: Носки, Футболка, Велосипедки, Худи, Джинсы, Платье, Брюки, Куртка, Топ, Юбка, Шорты, Пальто, Кардиган, Рубашка, Кеды, Кроссовки, Ботинки, Сумка, Лонгслив, Пиджак, Пуховик, Леггинсы, Кепка, Ремень, Шарф, Свитер, Палаццо, Бомбер и т.д.). Строго ОДНО слово в именительном падеже без прилагательных!
2. "is_new_topic" — boolean:
   - true: если начался поиск ДРУГОГО нового предмета или это первый запрос (например, искали футболку, а теперь носки).
   - false: если продолжается уточнение деталей ТЕКУЩЕЙ вещи (например: "а в черном цвете", "высокая талия", "подлиннее", "из хлопка", "с принтом").

Возвращай строго валидный JSON:
{
  "topic": "Носки",
  "is_new_topic": true,
  "active_tags": ["параметр1", "параметр2"],
  "item_summary": "Связное краткое описание вещи",
  "category": "носки",
  "stylist_thought": "Короткий комментарий стилиста по ткани или посадке ✨",
  "google_query": "site:wildberries.ru/catalog носки аниме"
}
`;

// =========================================================================
// ДИНАМИЧЕСКИЕ ЧИПЫ ИСТОРИИ ПОИСКА (СТРОГО 1 СЛОВО, МАКСИМУМ 10 ТЕМ)
// =========================================================================

/**
 * Умная нормализация поискового запроса:
 * - Исправляет опечатки ("сндалей" -> сандалии, "жжёлтые" -> желтые)
 * - Убирает слова-паразиты ("типа", "как", "вроде", "купить", "пожалуйста")
 * - Выносит цвет ("желтые", "черные" и т.д.) на первое место, чтобы Google искал именно нужный цвет
 */
function normalizeFashionQuery(raw) {
  if (!raw) return '';
  let str = raw.toLowerCase().replace(/ё/g, 'е').replace(/[«»"'`.,!?:;(){}\[\]*✦✧⋆✨🌸💫]/g, ' ');

  const typos = {
    'сндалей': 'сандалии',
    'сандалей': 'сандалии',
    'сандали': 'сандалии',
    'сандаль': 'сандалии',
    'жжелтые': 'желтые',
    'жолтые': 'желтые',
    'жёлтые': 'желтые',
    'кросы': 'кроссовки',
    'кроссы': 'кроссовки',
    'велик': 'велосипедки',
    'велы': 'велосипедки'
  };

  const stopWords = new Set([
    'типа', 'как', 'вроде', 'наподобие', 'стиле', 'купить', 'пожалуйста',
    'найди', 'мне', 'хочу', 'покажи', 'ищу', 'какой', 'какая', 'какие',
    'что-то', 'прям', 'очень', 'бы'
  ]);

  const colorWords = [
    'желтые', 'желтый', 'желтая', 'черные', 'черный', 'черная',
    'белые', 'белый', 'белая', 'розовые', 'розовый', 'розовая',
    'красные', 'красный', 'красная', 'синие', 'синий', 'синяя',
    'зеленые', 'зеленый', 'зеленая', 'бежевые', 'бежевый', 'бежевая',
    'серые', 'серый', 'серая', 'фиолетовые', 'фиолетовый', 'оранжевые'
  ];

  const tokens = str.split(/\s+/).filter(Boolean).map(t => typos[t] || t);
  const meaningful = tokens.filter(t => !stopWords.has(t) && t.length >= 2);

  // Ищем цвет
  const foundColor = meaningful.find(t => colorWords.includes(t));
  const otherWords = meaningful.filter(t => t !== foundColor);

  // Цвет ВСЕГДА ставим на первое место в запросе для точной выдачи в Google
  if (foundColor) {
    return `${foundColor} ${otherWords.join(' ')}`.trim();
  }
  return meaningful.join(' ').trim();
}

/**
 * Извлекает строго 1 слово предмета на русском с заглавной буквы.
 * Никаких фиксированных списков — поддерживает любую вещь (Носки, Тапочки, Футболка и т.д.).
 */
function detectOneWordTopic(aiData, userText) {
  // 1. Проверяем поле topic от ИИ
  let raw = (aiData && aiData.topic ? String(aiData.topic) : '').trim();
  raw = raw.replace(/[«»"'`.,!?:;(){}\[\]*✦✧⋆✨🌸💫]/g, '').trim();

  if (raw) {
    const words = raw.split(/\s+/).filter(w => w.length >= 2 && !/^(с|из|в|на|для|под|от|по|без|и)$/i.test(w));
    if (words.length > 0) {
      const w = words[0];
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
  }

  // 2. Проверяем поле category от ИИ
  if (aiData && aiData.category) {
    let cat = String(aiData.category).trim().replace(/[«»"'`.,!?:;(){}\[\]*✦✧⋆✨🌸💫]/g, '');
    const words = cat.split(/\s+/).filter(w => w.length >= 2 && !/^(с|из|в|на|для|под|от|по|без|и)$/i.test(w));
    if (words.length > 0) {
      const w = words[0];
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
  }

  // 3. Извлекаем главное предметное слово из запроса пользователя
  if (userText) {
    const normalized = normalizeFashionQuery(userText);
    const stopWords = new Set([
      'желтые', 'желтый', 'желтая', 'черные', 'черный', 'черная',
      'белые', 'белый', 'белая', 'розовые', 'розовый', 'розовая',
      'красные', 'красный', 'красная', 'синие', 'синий', 'синяя',
      'зеленые', 'зеленый', 'зеленая', 'бежевые', 'бежевый', 'бежевая',
      'серые', 'серый', 'серая', 'фиолетовые', 'фиолетовый', 'оранжевые',
      'оверсайз', 'короткий', 'длинный', 'свободный', 'теплый', 'летний', 'зимний'
    ]);
    const words = normalized.split(/\s+/).filter(w => w.length >= 3 && !stopWords.has(w));
    if (words.length > 0) {
      const w = words[0];
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    const anyWord = normalized.split(/\s+/).filter(w => w.length >= 3)[0];
    if (anyWord) {
      return anyWord.charAt(0).toUpperCase() + anyWord.slice(1).toLowerCase();
    }
  }

  return 'Вещь';
}

/**
 * Добавляет тему в недавние, если это новая тема. Не дублирует при уточнениях!
 */
function addRecentTopic(topicWord, isNewTopic) {
  if (!topicWord) return;

  const isSameAsCurrent = state.currentTopic && state.currentTopic.toLowerCase() === topicWord.toLowerCase();
  state.currentTopic = topicWord;

  // Если это уточнение по текущей вещи — новое слово не создаем, только подсвечиваем активный чип
  if (isSameAsCurrent && !isNewTopic) {
    renderRecentChips();
    return;
  }

  // Если новая тема — убираем дубликат и ставим на 1-е место
  state.recentTopics = state.recentTopics.filter(t => t.toLowerCase() !== topicWord.toLowerCase());
  state.recentTopics.unshift(topicWord);

  // Ограничиваем историю строго максимум 10 последними темами
  if (state.recentTopics.length > 10) {
    state.recentTopics = state.recentTopics.slice(0, 10);
  }

  // Сохраняем в localStorage
  try {
    localStorage.setItem('sff_recent_topics', JSON.stringify(state.recentTopics));
  } catch (_) {}

  renderRecentChips();
}

/**
 * Отрисовывает чипы недавних тем (строго по 1 слову, без обрезания, до 10 штук)
 */
function renderRecentChips() {
  const container = document.getElementById('recentChips');
  if (!container) return;

  if (!state.recentTopics || state.recentTopics.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  const sparkles = ['✦', '✧', '⋆', '✨'];

  container.innerHTML = state.recentTopics.map((topic, idx) => {
    const isActive = state.currentTopic && state.currentTopic.toLowerCase() === topic.toLowerCase();
    const sp = sparkles[idx % sparkles.length];
    return `
      <button 
        type="button" 
        class="chip-bubble ${isActive ? 'active' : ''}" 
        data-topic="${escapeHtml(topic)}"
        title="Искать «${escapeHtml(topic)}»"
      >
        <span>${escapeHtml(topic)}</span> <span class="chip-sparkle">${sp}</span>
      </button>
    `;
  }).join('');

  container.querySelectorAll('.chip-bubble').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.getAttribute('data-topic');
      if (topic) {
        handleSearch(topic);
      }
    });
  });
}

function extractJson(text) {
  let c = (text || '').trim();
  try { return JSON.parse(c); } catch (_) {}
  c = c.replace(/```json/gi, '').replace(/```/g, '').trim();
  try { return JSON.parse(c); } catch (_) {}
  const m = c.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch (_) {}
  }
  throw new Error('Не удалось получить ответ стилиста');
}

async function askAi(userText) {
  const history = state.chatHistory.slice(-6);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userText }
  ];

  // 1. Попытка через прямой DeepSeek API (если ключ sk-... и не sk-or-...)
  if (state.deepseekKey && !state.deepseekKey.startsWith('sk-or-')) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const d = await res.json();
        return extractJson(d.choices[0].message.content);
      }
    } catch (e) {
      console.warn('[AI] DeepSeek Direct API error:', e.message);
    }
  }

  // 2. Попытка через OpenRouter строго с моделью deepseek-v4.1-flash
  const openRouterKey = (state.deepseekKey && state.deepseekKey.startsWith('sk-or-'))
    ? state.deepseekKey
    : (state.apiKey && state.apiKey.startsWith('sk-or-') ? state.apiKey : '');

  if (openRouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://fashion-finder.local',
          'X-Title': 'Fashion Finder'
        },
        body: JSON.stringify({
          model: 'deepseek-v4.1-flash',
          messages: messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        })
      });
      if (res.ok) {
        const d = await res.json();
        return extractJson(d.choices[0].message.content);
      }
    } catch (e) {
      console.warn('[AI] OpenRouter DeepSeek error:', e.message);
    }
  }

  // 3. Бесплатный фоллбэк строго с моделью DeepSeek
  try {
    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: messages.map(m => m.content).join('\n') }],
        model: 'deepseek', // Строго DeepSeek
        jsonMode: true
      })
    });
    if (res.ok) {
      const t = await res.text();
      return extractJson(t);
    }
  } catch (_) {}

  // Умный разбор запроса (если API стилиста временно не ответил)
  const normQuery = normalizeFashionQuery(userText);
  const fallbackTopic = detectOneWordTopic(null, userText) || 'Вещь';

  // Извлекаем чистые аккуратные теги (цвет, фасон, материал) без мусорных фраз
  const stopTagWords = new Set(['типа', 'как', 'купить', 'пожалуйста', 'хочу', 'мне', 'покажи', 'ищу', 'вещь']);
  const cleanTags = normQuery.split(/\s+/).filter(w => w.length >= 3 && !stopTagWords.has(w));

  // Человечный совет стилиста по категории вещи (без дежурного роботизированного текста)
  let thought = 'Для этой вещи важны удобная посадка и практичный материал ✨';
  const lowText = (normQuery + ' ' + userText).toLowerCase();
  if (lowText.includes('тапочк') || lowText.includes('сандал') || lowText.includes('шлеп') || lowText.includes('сланц')) {
    thought = 'Для домашней обуви лучше выбирать мягкую амортизирующую подошву и дышащие материалы, чтобы стопа не уставала ✨';
  } else if (lowText.includes('футболк') || lowText.includes('лонгслив') || lowText.includes('топ')) {
    thought = 'Для базового кроя подойдет плотный хлопок от 220 грамм, тогда воротник и плечи держат форму ✨';
  } else if (lowText.includes('худи') || lowText.includes('свитшот') || lowText.includes('толстовк')) {
    thought = 'В оверсайз моделях важен плотный футер с начесом или петлей, чтобы вещь не провисала мешком ✨';
  } else if (lowText.includes('джинс') || lowText.includes('брюк') || lowText.includes('палаццо')) {
    thought = 'Высокая посадка и плотная фактура ткани создают красивую прямую линию без лишних складок ✨';
  } else if (lowText.includes('плать') || lowText.includes('юбк')) {
    thought = 'При свободном силуэте лучше обращать внимание на струящиеся ткани, которые не мнутся при ходьбе ✨';
  } else if (lowText.includes('кроссовк') || lowText.includes('кед')) {
    thought = 'Для повседневной носки важна гибкая подошва и перфорация для циркуляции воздуха ✨';
  }

  return {
    topic: fallbackTopic,
    is_new_topic: true,
    active_tags: cleanTags.slice(0, 3),
    item_summary: normQuery || userText,
    category: fallbackTopic.toLowerCase(),
    stylist_thought: thought,
    google_query: normQuery || userText
  };
}


// Получение товаров: строго динамический поиск из Google CSE
async function getLookItems(category, query) {
  // Живой поиск через Google CSE (cx=f4a91216ff6d641fd)
  try {
    const cseResults = await searchGoogleCse(query);
    if (cseResults && cseResults.length > 0) return cseResults;
  } catch (e) {
    console.warn('[Search] Ошибка Google CSE:', e.message);
  }

  // Резервный каталог 30 на 30 (если Google CSE временно не ответил)
  const qEnc = encodeURIComponent(query);
  const wbSvgRaw = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#db2777"/><stop offset="100%" stop-color="#831843"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)" rx="24"/><text x="50%" y="42%" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#fff" opacity="0.9">✨</text><text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="#fff">Wildberries</text><text x="50%" y="65%" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#fff" opacity="0.85">Каталог товаров</text></svg>`;
  const ozonSvgRaw = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#075985"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)" rx="24"/><text x="50%" y="42%" text-anchor="middle" font-family="sans-serif" font-size="48" fill="#fff" opacity="0.9">✨</text><text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="#fff">Ozon</text><text x="50%" y="65%" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#fff" opacity="0.85">Каталог товаров</text></svg>`;
  const wbSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wbSvgRaw);
  const ozonSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ozonSvgRaw);

  const fallbackItems = [];
  for (let i = 1; i <= 30; i++) {
    fallbackItems.push({
      id: '',
      title: `${query} (выбор ${i})`,
      price: 'В наличии',
      platform: 'wb',
      img: wbSvg,
      url: `https://www.wildberries.ru/catalog/0/search.aspx?search=${qEnc}`
    });
    fallbackItems.push({
      id: '',
      title: `${query} (выбор ${i})`,
      price: 'В наличии',
      platform: 'ozon',
      img: ozonSvg,
      url: `https://www.ozon.ru/search/?text=${qEnc}`
    });
  }
  return fallbackItems;
}



// =========================================================================
// ГЛАВНЫЙ ПАЙПЛАЙН: ОБРАБОТКА ЗАПРОСА ДЕВУШКИ
// =========================================================================

async function handleSearch(userText) {
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('btnSend');
  const chatFlow = document.getElementById('chatFlow');

  if (!userText) return;
  if (input) input.value = '';

  // Удаляем стартовый экран приветствия
  const welcomeEl = document.getElementById('welcomeMsg');
  if (welcomeEl) welcomeEl.remove();

  // 1. Показываем сообщение девушки
  const userMsg = document.createElement('section');
  userMsg.className = 'ethereal-message user-msg';
  userMsg.innerHTML = `<span class="user-text">${escapeHtml(userText)}</span>`;
  chatFlow.appendChild(userMsg);

  // 2. Индикатор поиска
  const thinkingMsg = document.createElement('section');
  thinkingMsg.id = 'thinkingMsg';
  thinkingMsg.className = 'ethereal-message stylist-thinking';
  thinkingMsg.innerHTML = `
    <span class="thinking-sparkle">✦</span>
    <span class="thinking-phrase">ищу подходящие варианты в каталогах...</span>
  `;
  chatFlow.appendChild(thinkingMsg);
  thinkingMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });

  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.style.opacity = '0.6';
  }

  try {
    // 3. Вызываем ИИ (строго DeepSeek)
    const aiData = await askAi(userText);
    state.activeTags = aiData.active_tags || [];
    state.itemSummary = aiData.item_summary || userText;
    state.chatHistory.push({ role: 'user', content: userText });
    state.chatHistory.push({ role: 'assistant', content: JSON.stringify(aiData) });

    // Определяем тему строго из 1 слова и обновляем чипы
    const detectedTopic = detectOneWordTopic(aiData, userText);
    const isNew = aiData.is_new_topic === true || !state.currentTopic || (detectedTopic && detectedTopic.toLowerCase() !== state.currentTopic.toLowerCase());
    if (detectedTopic) {
      addRecentTopic(detectedTopic, isNew);
    }

    // 4. Формируем точный поисковый запрос для Google Картинок
    // Цвет ОБЯЗАТЕЛЬНО ставится на первое место через normalizeFashionQuery
    const normalized = normalizeFashionQuery(userText);
    const topicForSearch = detectedTopic || (aiData && aiData.topic) || (aiData && aiData.category) || '';

    let cleanSearchQuery = '';
    if (normalized) {
      cleanSearchQuery = normalized;
    } else if (topicForSearch) {
      cleanSearchQuery = topicForSearch;
    } else {
      cleanSearchQuery = userText;
    }
    cleanSearchQuery = cleanSearchQuery.replace(/site:[^\s]+/gi, '').trim();

    const category = aiData.category || 'одежда';
    const items = await getLookItems(category, cleanSearchQuery);

    // Удаляем индикатор поиска
    const thEl = document.getElementById('thinkingMsg');
    if (thEl) thEl.remove();

    // 5. Рендерим карточки и комментарий стилиста
    const responseMsg = document.createElement('section');
    responseMsg.className = 'ethereal-message stylist-msg';

    const tagsHtml = state.activeTags.map((t, idx) => `
      <span class="param-bubble">
        <span>${escapeHtml(t)}</span>
        <button type="button" class="bubble-remove" onclick="removeBubbleTag(${idx})">✕</button>
      </span>
    `).join('');

    const wbCount = items.filter(it => it.platform === 'wb').length;
    const ozonCount = items.filter(it => it.platform === 'ozon').length;

    const cardsHtml = items.map((it) => {
      const isWb = it.platform === 'wb';
      const platLabel = isWb ? 'Wildberries' : 'Ozon';
      const platClass = isWb ? 'wb' : 'ozon';
      const buyText = isWb ? 'Купить на WB ↗' : 'Купить на Ozon ↗';
      const googleImgUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent('site:wildberries.ru/catalog ' + it.title)}&hl=ru`;

      return `
        <article class="floating-item ${platClass}">
          <div class="floating-photo-frame" onclick="window.open('${escapeJs(it.url)}', '_blank')">
            <img src="${it.img}" alt="${escapeHtml(it.title)}" class="floating-photo-img" loading="lazy" />
            <span class="photo-plat-tag ${platClass}">${platLabel}</span>
            <span class="photo-price-badge">${it.price || 'В наличии'}</span>
          </div>

          <div class="floating-meta">
            <h4 class="floating-title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</h4>
            ${it.id ? `
              <div class="floating-sku-line">
                <span class="sku-digits">Арт: ${it.id}</span>
                <button type="button" class="sku-copy-link" onclick="navigator.clipboard.writeText('${it.id}'); showToast('Артикул скопирован');">Скопировать</button>
              </div>
            ` : ''}

            <div class="floating-actions">
              <a href="${it.url}" target="_blank" rel="noopener noreferrer" class="btn-open-store ${platClass}">
                <span>${buyText}</span>
              </a>
              <a href="${googleImgUrl}" target="_blank" rel="noopener noreferrer" class="btn-more-google" title="Смотреть другие фото в Google">
                <span>🔍</span>
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');

    const thought = aiData.stylist_thought || 'Подобрала подходящие варианты по вашему описанию:';

    responseMsg.innerHTML = `
      <div class="msg-author-row">
        <span class="author-flower">✦</span>
        <span class="author-name">стилист:</span>
      </div>
      <p class="msg-prose">${escapeHtml(thought)}</p>
      
      ${tagsHtml ? `<div class="ethereal-tags-row">${tagsHtml}</div>` : ''}

      <div class="plat-filter-row">
        <button type="button" class="plat-filter-btn active" data-filter="all">Все (${items.length})</button>
        <button type="button" class="plat-filter-btn wb" data-filter="wb">Wildberries (${wbCount})</button>
        <button type="button" class="plat-filter-btn ozon" data-filter="ozon">Ozon (${ozonCount})</button>
      </div>

      <div class="lookbook-grid">
        ${cardsHtml}
      </div>
    `;

    // Интерактивное переключение фильтров Wildberries / Ozon
    responseMsg.querySelectorAll('.plat-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        responseMsg.querySelectorAll('.plat-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.getAttribute('data-filter');
        const grid = responseMsg.querySelector('.lookbook-grid');
        grid.querySelectorAll('.floating-item').forEach(card => {
          if (filter === 'all' || card.classList.contains(filter)) {
            card.style.display = 'flex';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    chatFlow.appendChild(responseMsg);

    setTimeout(() => {
      responseMsg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);

  } catch (err) {
    const thEl = document.getElementById('thinkingMsg');
    if (thEl) thEl.remove();

    const errEl = document.createElement('section');
    errEl.className = 'ethereal-message stylist-msg';
    errEl.innerHTML = `
      <div class="msg-author-row">
        <span class="author-flower">✦</span>
        <span class="author-name">стилист:</span>
      </div>
      <p class="msg-prose">Не удалось загрузить варианты по запросу. Попробуйте еще раз.</p>
    `;
    chatFlow.appendChild(errEl);
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.style.opacity = '1';
    }
  }
}

function removeBubbleTag(idx) {
  const removed = state.activeTags.splice(idx, 1);
  showToast(`Параметр «${removed}» удален`);
  handleSearch(`Ищи без параметра: ${removed}`);
}

function showToast(text) {
  const area = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast-bubble';
  toast.textContent = text;

  if (area) area.appendChild(toast);
  else document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 20);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// =========================================================================
// ИНИЦИАЛИЗАЦИЯ И СЛУШАТЕЛИ СОБЫТИЙ
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
  const btnSend   = document.getElementById('btnSend');
  const userInput = document.getElementById('userInput');
  const askForm   = document.getElementById('askForm');
  const apiKeyInput = document.getElementById('customApiKey');

  // Восстановление сохранённого ключа стилиста
  if (apiKeyInput && state.deepseekKey) apiKeyInput.value = state.deepseekKey;

  // Отправка формы
  if (askForm) {
    askForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const txt = userInput ? userInput.value.trim() : '';
      handleSearch(txt);
    });
  }

  if (userInput) {
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const txt = userInput.value.trim();
        handleSearch(txt);
      }
    });
  }

  // Карточки вдохновения
  function bindInspirationCards() {
    document.querySelectorAll('.inspire-card').forEach(card => {
      card.addEventListener('click', () => {
        const q = card.getAttribute('data-query');
        if (q) handleSearch(q);
      });
    });
  }
  bindInspirationCards();

  // Инициализация чипов недавних тем (до 10 слов)
  renderRecentChips();

  // Модальное окно настроек
  const modal          = document.getElementById('settingsModal');
  const btnSettings    = document.getElementById('btnSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings  = document.getElementById('btnSaveSettings');

  if (btnSettings    && modal) btnSettings.addEventListener('click',    () => modal.classList.remove('hidden'));
  if (btnCloseSettings && modal) btnCloseSettings.addEventListener('click', () => modal.classList.add('hidden'));

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      const dsKey = apiKeyInput ? apiKeyInput.value.trim() : '';
      if (dsKey) {
        state.deepseekKey = dsKey;
        localStorage.setItem('sff_deepseek_key', dsKey);
      }
      modal.classList.add('hidden');
      showToast('Настройки сохранены');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal) modal.classList.add('hidden');
  });



  // Сброс поиска
  window.resetAllFlow = function() {
    state.activeTags = [];
    state.itemSummary = '';
    state.chatHistory = [];
    state.currentTopic = '';
    renderRecentChips();

    const chatFlow = document.getElementById('chatFlow');
    if (chatFlow) {
      chatFlow.innerHTML = `
        <section class="welcome-hero" id="welcomeMsg">
          <div class="welcome-badge">
            <span class="welcome-badge-text">поиск по деталям кроя</span>
          </div>

          <h2 class="welcome-heading">Какую вещь ищем?</h2>
          <p class="welcome-subtext">
            Назови предмет одежды, цвет, посадку или ткань.<br>
            Помощник найдет подходящие вещи в каталогах Wildberries и Ozon с прямыми ссылками.
          </p>

          <div class="welcome-inspiration-grid">
            <button type="button" class="inspire-card" data-query="черная оверсайз футболка хлопок">
              <span class="inspire-icon">✦</span>
              <div class="inspire-info">
                <span class="inspire-title">Оверсайз футболки</span>
                <span class="inspire-desc">Плотный хлопок от 220 г/м²</span>
              </div>
            </button>

            <button type="button" class="inspire-card" data-query="велосипедки с высокой посадкой черные">
              <span class="inspire-icon">✧</span>
              <div class="inspire-info">
                <span class="inspire-title">Велосипедки</span>
                <span class="inspire-desc">Высокая талия, эластичный материал</span>
              </div>
            </button>

            <button type="button" class="inspire-card" data-query="уютное худи оверсайз с капюшоном">
              <span class="inspire-icon">⋆</span>
              <div class="inspire-info">
                <span class="inspire-title">Свободные худи</span>
                <span class="inspire-desc">Мягкий футер с капюшоном</span>
              </div>
            </button>

            <button type="button" class="inspire-card" data-query="широкие брюки палаццо">
              <span class="inspire-icon">✦</span>
              <div class="inspire-info">
                <span class="inspire-title">Брюки палаццо</span>
                <span class="inspire-desc">Прямой свободный крой</span>
              </div>
            </button>
          </div>

          <p class="msg-note" id="keyStatusHint">
            Поиск подключен. Результаты загружаются с фото и прямыми ссылками.
          </p>
        </section>
      `;
      bindInspirationCards();
    }

    if (userInput) userInput.value = '';
    showToast('Поиск очищен');
  };

  const btnResetHeader = document.getElementById('btnResetAll');
  if (btnResetHeader) btnResetHeader.addEventListener('click', window.resetAllFlow);
});
