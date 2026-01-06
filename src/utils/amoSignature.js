/**
 * Утилиты для работы с подписями amoCRM API
 */

import crypto from 'crypto';

/**
 * Генерация заголовков с HMAC-SHA1 подписью для amojo API
 * @param {string} method - HTTP метод (POST, GET, etc.)
 * @param {string} path - Путь запроса (/v2/origin/custom/...)
 * @param {object|string} body - Тело запроса
 * @param {string} secretKey - Секретный ключ канала
 * @returns {object} Заголовки для запроса
 */
export function generateAmoHeaders(method, path, body, secretKey) {
  const date = new Date().toUTCString();
  const contentType = 'application/json';
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const contentMd5 = crypto.createHash('md5').update(bodyStr).digest('hex');

  // Строка для подписи согласно документации amoCRM
  const signString = [
    method.toUpperCase(),
    contentMd5,
    contentType,
    date,
    path
  ].join('\n');

  const signature = crypto
    .createHmac('sha1', secretKey)
    .update(signString)
    .digest('hex');

  return {
    'Date': date,
    'Content-Type': contentType,
    'Content-MD5': contentMd5,
    'X-Signature': signature
  };
}

/**
 * Верификация входящей подписи webhook от amoCRM
 * @param {object|string} body - Тело запроса
 * @param {string} signature - Подпись из заголовка X-Signature
 * @param {string} secretKey - Секретный ключ канала
 * @returns {boolean} Валидна ли подпись
 */
export function verifyWebhookSignature(body, signature, secretKey) {
  if (!signature || !secretKey) {
    return false;
  }

  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  const expectedSignature = crypto
    .createHmac('sha1', secretKey)
    .update(bodyStr)
    .digest('hex');

  // Безопасное сравнение для защиты от timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export default {
  generateAmoHeaders,
  verifyWebhookSignature
};
