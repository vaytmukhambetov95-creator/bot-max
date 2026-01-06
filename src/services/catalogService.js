import { parseYMLFeed } from '../utils/ymlParser.js';
import { config } from '../config.js';

// Кэш каталога
let catalogCache = {
  products: [],
  lastUpdated: null
};

/**
 * Загрузить каталог (с кэшированием)
 */
export async function loadCatalog() {
  const now = Date.now();
  const cacheAge = catalogCache.lastUpdated
    ? (now - catalogCache.lastUpdated) / 1000 / 60 // в минутах
    : Infinity;

  // Если кэш свежий - возвращаем его
  if (cacheAge < config.catalogCacheMinutes && catalogCache.products.length > 0) {
    return catalogCache.products;
  }

  // Загружаем свежий каталог
  try {
    console.log('Загрузка каталога из YML фида...');
    const products = await parseYMLFeed(config.ymlFeedUrl);

    catalogCache = {
      products,
      lastUpdated: now
    };

    console.log(`Каталог загружен: ${products.length} товаров`);
    return products;
  } catch (error) {
    console.error('Ошибка загрузки каталога:', error.message);

    // Возвращаем старый кэш если есть
    if (catalogCache.products.length > 0) {
      return catalogCache.products;
    }

    throw error;
  }
}

/**
 * Поиск товаров по запросу
 * @param {string} query - Поисковый запрос
 * @param {number} limit - Максимум результатов
 * @returns {Promise<Array>}
 */
export async function searchProducts(query, limit = 5) {
  const products = await loadCatalog();

  if (!query || query.trim().length < 2) {
    // Возвращаем случайные товары если запрос пустой
    return shuffleArray([...products]).slice(0, limit);
  }

  const queryLower = query.toLowerCase().trim();
  const queryWords = queryLower.split(/\s+/);

  // Оценка релевантности товара
  const scored = products.map(product => {
    let score = 0;
    const titleLower = product.title.toLowerCase();
    const fullNameLower = product.fullName.toLowerCase();
    const descLower = product.description.toLowerCase();

    // Точное совпадение в названии
    if (titleLower.includes(queryLower)) {
      score += 100;
    }

    // Совпадение слов в названии
    for (const word of queryWords) {
      if (word.length < 2) continue;

      if (titleLower.includes(word)) {
        score += 30;
      }
      if (fullNameLower.includes(word)) {
        score += 20;
      }
      if (descLower.includes(word)) {
        score += 10;
      }
    }

    // Специальные ключевые слова
    const keywords = {
      'роз': ['роза', 'розы', 'розовый'],
      'гортенз': ['гортензия', 'гортензии'],
      'пион': ['пион', 'пионы', 'пионовидный'],
      'тюльпан': ['тюльпан', 'тюльпаны'],
      'хризантем': ['хризантема', 'хризантемы'],
      'свадеб': ['свадебный', 'свадьба', 'невеста'],
      'день рожден': ['день рождения', 'др'],
      'букет': ['букет', 'композиция']
    };

    for (const [key, variants] of Object.entries(keywords)) {
      if (queryLower.includes(key)) {
        for (const variant of variants) {
          if (titleLower.includes(variant) || fullNameLower.includes(variant)) {
            score += 50;
            break;
          }
        }
      }
    }

    return { ...product, score };
  });

  // Фильтруем и сортируем по релевантности
  return scored
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Получить товар по ID
 */
export async function getProductById(id) {
  const products = await loadCatalog();
  return products.find(p => p.id === id || p.offerId === id);
}

/**
 * Перемешать массив (Fisher-Yates)
 */
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Принудительное обновление каталога
 */
export async function refreshCatalog() {
  catalogCache.lastUpdated = null;
  return loadCatalog();
}
