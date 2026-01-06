/**
 * Генерация и проверка токенов для веб-формы заказа
 * Токен содержит chatId, userId и timestamp с HMAC подписью
 */

import crypto from 'crypto';
import { config } from '../config.js';

/**
 * Генерирует подписанный токен для URL формы заказа
 * @param {string} chatId - ID чата
 * @param {string} userId - ID пользователя
 * @param {object} productInfo - Информация о выбранном товаре (опционально)
 * @returns {string} Подписанный токен
 */
export function generateOrderToken(chatId, userId, productInfo = null) {
  const data = {
    c: chatId,       // chat_id
    u: userId,       // user_id
    p: productInfo,  // выбранный товар (опционально)
    t: Date.now()    // timestamp
  };

  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', config.webFormSecret)
    .update(payload)
    .digest('base64url')
    .slice(0, 16); // Короткая подпись для URL

  return `${payload}.${signature}`;
}

/**
 * Генерирует подписанный токен для сделки amoCRM (по leadId)
 * Компактный формат: a.{leadId}.{timestamp_base36}.{signature}
 * @param {number} leadId - ID сделки в amoCRM
 * @returns {string} Подписанный токен
 */
export function generateLeadOrderToken(leadId) {
  // Компактный формат: a.leadId.timestamp(base36)
  const ts = Date.now().toString(36); // timestamp в base36 (короче)
  const payload = `a.${leadId}.${ts}`;

  const signature = crypto
    .createHmac('sha256', config.webFormSecret)
    .update(payload)
    .digest('base64url')
    .slice(0, 12); // Ещё короче подпись (12 символов достаточно)

  return `${payload}.${signature}`;
}

/**
 * Генерирует полный URL формы заказа для сделки amoCRM
 * @param {number} leadId - ID сделки
 * @returns {string} Полный URL формы
 */
export function generateLeadOrderUrl(leadId) {
  const token = generateLeadOrderToken(leadId);
  return `${config.webBaseUrl}/order?t=${token}`;
}

/**
 * Проверяет и декодирует токен (поддерживает оба типа: max и amo)
 * @param {string} token - Токен из URL
 * @returns {object|null} Данные токена или null если невалидный
 */
export function verifyOrderToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');

  // Новый компактный формат amoCRM: a.leadId.timestamp.signature (4 части)
  if (parts.length === 4 && parts[0] === 'a') {
    const [, leadIdStr, tsBase36, signature] = parts;
    const payload = `a.${leadIdStr}.${tsBase36}`;

    // Проверяем подпись (12 символов для компактного формата)
    const expectedSig = crypto
      .createHmac('sha256', config.webFormSecret)
      .update(payload)
      .digest('base64url')
      .slice(0, 12);

    if (signature !== expectedSig) {
      console.log('Невалидная подпись токена (компактный формат)');
      return null;
    }

    const timestamp = parseInt(tsBase36, 36);
    const TOKEN_TTL = 24 * 60 * 60 * 1000;

    if (Date.now() - timestamp > TOKEN_TTL) {
      console.log('Токен истёк');
      return null;
    }

    return {
      type: 'amo',
      leadId: parseInt(leadIdStr),
      createdAt: new Date(timestamp)
    };
  }

  // Старый формат: payload.signature (2 части)
  if (parts.length !== 2) {
    return null;
  }

  const [payload, signature] = parts;

  // Проверяем подпись
  const expectedSig = crypto
    .createHmac('sha256', config.webFormSecret)
    .update(payload)
    .digest('base64url')
    .slice(0, 16);

  if (signature !== expectedSig) {
    console.log('Невалидная подпись токена');
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());

    // Проверка времени жизни (24 часа)
    const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
    if (Date.now() - data.t > TOKEN_TTL) {
      console.log('Токен истёк');
      return null;
    }

    // Определяем тип токена
    const tokenType = data.type || 'max'; // обратная совместимость

    if (tokenType === 'amo') {
      // Токен от amoCRM (содержит leadId)
      return {
        type: 'amo',
        leadId: data.l,
        createdAt: new Date(data.t)
      };
    }

    // Токен от бота MAX (содержит chatId, userId)
    return {
      type: 'max',
      chatId: data.c,
      userId: data.u,
      productInfo: data.p,
      createdAt: new Date(data.t)
    };
  } catch (error) {
    console.error('Ошибка декодирования токена:', error);
    return null;
  }
}

/**
 * Генерирует полный URL формы заказа
 * @param {string} chatId - ID чата
 * @param {string} userId - ID пользователя
 * @param {object} productInfo - Информация о товаре
 * @returns {string} Полный URL формы
 */
export function generateOrderUrl(chatId, userId, productInfo = null) {
  const token = generateOrderToken(chatId, userId, productInfo);
  return `${config.webBaseUrl}/order?t=${token}`;
}

export default {
  generateOrderToken,
  verifyOrderToken,
  generateOrderUrl,
  generateLeadOrderToken,
  generateLeadOrderUrl
};
