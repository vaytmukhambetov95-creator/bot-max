import axios from 'axios';
import sharp from 'sharp';

/**
 * Скачать изображение и наложить текст с ценой
 * @param {Object} product - Товар
 * @returns {Promise<Buffer>} - Изображение в формате Buffer
 */
export async function createProductImage(product) {
  try {
    // Скачиваем изображение
    const imageUrl = product.pictures[0];
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000
    });

    const imageBuffer = Buffer.from(response.data);

    // Получаем размеры изображения
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    // Вычисляем размеры шрифтов пропорционально изображению
    const titleFontSize = Math.max(Math.floor(width / 25), 20);
    const priceFontSize = Math.max(Math.floor(width / 16), 28);
    const deliveryFontSize = Math.max(Math.floor(width / 30), 16);
    const padding = Math.floor(titleFontSize * 0.8);

    // Подготавливаем текст
    const title = product.title.toUpperCase();
    const price = `${product.price.toLocaleString('ru-RU')} р.`;
    const delivery = '+ БЕСПЛАТНАЯ ДОСТАВКА';

    // Позиции текста (от нижнего края)
    const deliveryY = height - padding;
    const priceY = deliveryY - deliveryFontSize - padding * 0.6;
    const titleY = priceY - priceFontSize - padding * 0.6;

    // Создаём SVG с текстом
    const svgText = `
      <svg width="${width}" height="${height}">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.8)"/>
          </filter>
        </defs>
        <style>
          .title {
            fill: white;
            font-size: ${titleFontSize}px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: bold;
            filter: url(#shadow);
          }
          .price {
            fill: white;
            font-size: ${priceFontSize}px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: bold;
            filter: url(#shadow);
          }
          .delivery {
            fill: white;
            font-size: ${deliveryFontSize}px;
            font-family: Arial, Helvetica, sans-serif;
            font-weight: bold;
            filter: url(#shadow);
          }
        </style>
        <text x="${padding}" y="${titleY}" class="title">${escapeXml(title)}</text>
        <text x="${padding}" y="${priceY}" class="price">${escapeXml(price)}</text>
        <text x="${padding}" y="${deliveryY}" class="delivery">${escapeXml(delivery)}</text>
      </svg>
    `;

    // Накладываем текст на изображение
    const result = await sharp(imageBuffer)
      .composite([{
        input: Buffer.from(svgText),
        top: 0,
        left: 0
      }])
      .jpeg({ quality: 90 })
      .toBuffer();

    return result;
  } catch (error) {
    console.error('Ошибка обработки изображения:', error.message);
    throw error;
  }
}

/**
 * Создать несколько изображений товаров
 * @param {Array} products - Массив товаров
 * @returns {Promise<Array<{product: Object, image: Buffer}>>}
 */
export async function createProductImages(products) {
  const results = [];

  for (const product of products) {
    try {
      const image = await createProductImage(product);
      results.push({ product, image });
    } catch (error) {
      console.error(`Ошибка создания изображения для ${product.title}:`, error.message);
      // Продолжаем с другими товарами
    }
  }

  return results;
}

/**
 * Экранирование XML символов
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
