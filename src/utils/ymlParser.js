import axios from 'axios';
import { parseStringPromise } from 'xml2js';

/**
 * Загрузить и распарсить YML фид
 * @param {string} url - URL YML фида
 * @returns {Promise<Array>} - Массив товаров
 */
export async function parseYMLFeed(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 30000
    });

    const result = await parseStringPromise(response.data, {
      explicitArray: false,
      ignoreAttrs: false
    });

    const offers = result?.yml_catalog?.shop?.offers?.offer || [];
    const offersArray = Array.isArray(offers) ? offers : [offers];

    // Группируем по group_id для удаления дублей
    const groupedProducts = new Map();

    for (const offer of offersArray) {
      const id = offer.$?.id || offer.$.id;
      const groupId = offer.$?.group_id || offer.$.group_id || id;

      // Извлекаем данные
      const name = offer.name || '';
      const vendorCode = offer.vendorCode || '';
      const price = parseFloat(offer.price) || 0;
      const description = offer.description || '';
      const url = offer.url || '';

      // Изображения могут быть строкой или массивом
      let pictures = offer.picture || [];
      if (!Array.isArray(pictures)) {
        pictures = [pictures];
      }

      // Очищаем название
      const cleanedTitle = cleanProductTitle(vendorCode || name);

      // Пропускаем товары без изображений или цены
      if (pictures.length === 0 || price <= 0) {
        continue;
      }

      const product = {
        id: groupId,
        offerId: id,
        title: cleanedTitle,
        fullName: name,
        price,
        pictures,
        description: description.substring(0, 200),
        url
      };

      // Если группа уже есть - берём версию с минимальной ценой (базовая)
      if (groupedProducts.has(groupId)) {
        const existing = groupedProducts.get(groupId);
        if (product.price < existing.price) {
          groupedProducts.set(groupId, product);
        }
      } else {
        groupedProducts.set(groupId, product);
      }
    }

    return Array.from(groupedProducts.values());
  } catch (error) {
    console.error('Ошибка парсинга YML:', error.message);
    throw error;
  }
}

/**
 * Очистка названия товара от суффиксов
 */
function cleanProductTitle(title) {
  if (!title) return '';

  let cleanTitle = title;

  // Убираем "Как на фото"
  cleanTitle = cleanTitle.replace(/\s*[\/\-]\s*Как на фото\s*/gi, '');

  // Убираем VIP варианты
  cleanTitle = cleanTitle.replace(/\s*-?\s*VIP\s*\(на \d+% (больше )?цветов( больше)?\)\s*/gi, '');

  // Убираем "Роскошный" варианты
  cleanTitle = cleanTitle.replace(/\s*-?\s*Роскошный\s*\(на \d+% (больше )?цветов( больше)?\)\s*/gi, '');

  // Убираем размеры в скобках
  cleanTitle = cleanTitle.replace(/\s*\(\d+\s*см\)\s*/gi, '');

  // Убираем лишние пробелы
  cleanTitle = cleanTitle.replace(/\s+/g, ' ').trim();

  return cleanTitle;
}
