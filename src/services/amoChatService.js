/**
 * Сервис для работы с API чатов amoCRM (amojo)
 * Синхронизация переписки MAX <-> amoCRM
 */

import axios from 'axios';
import { config } from '../config.js';
import { generateAmoHeaders } from '../utils/amoSignature.js';
import * as amoService from './amoService.js';

const AMOJO_BASE_URL = 'https://amojo.amocrm.ru';

// Хранилище соответствий chatId MAX -> conversation_id amoCRM
// В production рекомендуется использовать БД
const chatMapping = new Map();

// Хранилище userId MAX -> contactId amoCRM (для точного поиска контакта)
const userContactMapping = new Map();

// Множество userId для которых уже установлен источник трафика (чтобы не делать лишние запросы)
const trafficSourceSet = new Set();

// Хранилище userId MAX -> данные пользователя
const userCache = new Map();

/**
 * Проверка, настроен ли сервис чатов
 */
export function isConfigured() {
  return Boolean(config.amoChannelId && config.amoChannelSecret && config.amoScopeId);
}

/**
 * Инициализация сервиса
 */
export async function init() {
  if (!config.amoChannelId || !config.amoChannelSecret) {
    console.log('amoCRM Chat: не настроены channel_id и secret_key (ожидается одобрение от техподдержки)');
    return false;
  }

  if (!config.amoScopeId) {
    console.log('amoCRM Chat: scope_id не настроен. Выполните connectAccount() после получения данных от техподдержки.');
    return false;
  }

  console.log('amoCRM Chat API: инициализирован');
  return true;
}

/**
 * Выполнение запроса к amojo API с подписью
 */
async function amojoRequest(method, path, body = {}) {
  const headers = generateAmoHeaders(method, path, body, config.amoChannelSecret);

  try {
    const response = await axios({
      method,
      url: `${AMOJO_BASE_URL}${path}`,
      data: body,
      headers
    });

    return response.data;
  } catch (error) {
    const errorData = error.response?.data || error.message;
    console.error(`amoCRM Chat API Error [${method} ${path}]:`, errorData);
    throw error;
  }
}

/**
 * Подключение аккаунта amoCRM к каналу
 * Вызывается один раз при первоначальной настройке
 * @param {string} accountId - amojo_id аккаунта (получить через amoService.getAccountInfo())
 * @returns {string} scope_id для дальнейшей работы
 */
export async function connectAccount(accountId) {
  if (!config.amoChannelId || !config.amoChannelSecret) {
    throw new Error('amoCRM Chat: channel_id и secret_key не настроены');
  }

  const path = `/v2/origin/custom/${config.amoChannelId}/connect`;
  // Webhook URL должен содержать scope_id для правильной маршрутизации
  const hookUrl = `${config.webBaseUrl}/api/amo/webhook/${config.amoChannelId}_${accountId}`;

  const body = {
    account_id: accountId,
    title: 'MAX Messenger Bot Orange',
    hook_api_version: 'v2',
    hook_url: hookUrl
  };

  console.log(`amoCRM Chat: Подключаем канал с hook_url: ${hookUrl}`);
  const result = await amojoRequest('POST', path, body);

  console.log(`amoCRM Chat: Аккаунт подключен, scope_id: ${result.scope_id}`);
  console.log('ВАЖНО: Добавьте AMO_SCOPE_ID=' + result.scope_id + ' в .env файл');

  return result.scope_id;
}

/**
 * Отключение аккаунта от канала
 */
export async function disconnectAccount() {
  if (!config.amoChannelId) {
    throw new Error('amoCRM Chat: channel_id не настроен');
  }

  const path = `/v2/origin/custom/${config.amoChannelId}/disconnect`;
  const body = { account_id: config.amoAccountId };

  await amojoRequest('DELETE', path, body);
  console.log('amoCRM Chat: Аккаунт отключен');
}

/**
 * Создание или получение чата в amoCRM
 * @param {string} chatId - ID чата в MAX
 * @param {string} userId - ID пользователя в MAX
 * @param {string} userName - Имя пользователя из MAX API (first_name + last_name)
 * @returns {string} conversation_id
 */
export async function getOrCreateChat(chatId, userId, userName = null) {
  if (!isConfigured()) return null;

  // Проверяем кеш
  if (chatMapping.has(chatId)) {
    return chatMapping.get(chatId);
  }

  const path = `/v2/origin/custom/${config.amoScopeId}/chats`;
  const conversationId = `max_${chatId}`;

  // Используем реальное имя из MAX если есть, иначе fallback
  const displayName = userName || `Пользователь MAX #${userId}`;

  // Сохраняем имя в кеш для последующих сообщений
  if (userName) {
    userCache.set(userId, { name: userName });
  }

  const body = {
    conversation_id: conversationId,
    source: {
      external_id: config.amoSourceExternalId
    },
    user: {
      id: `max_user_${userId}`,
      name: displayName,
      profile: {
        phone: '',
        email: ''
      }
    }
  };

  try {
    const response = await amojoRequest('POST', path, body);
    chatMapping.set(chatId, conversationId);

    // Сохраняем contact_id если он вернулся в ответе
    if (response?.contact?.id) {
      userContactMapping.set(userId, response.contact.id);
      console.log(`amoCRM Chat: Создан чат ${conversationId}, контакт #${response.contact.id}, имя: ${displayName}`);

      // Асинхронно устанавливаем источник трафика "MAX" для сделки
      setTrafficSourceForContact(response.contact.id, userId).catch(err => {
        console.error('amoCRM Chat: Ошибка установки источника трафика:', err.message);
      });
    } else {
      console.log(`amoCRM Chat: Создан чат ${conversationId}, имя: ${displayName}`);

      // contact_id не вернулся — устанавливаем источник через поиск по userId
      setTrafficSourceForUser(userId).catch(err => {
        console.error('amoCRM Chat: Ошибка установки источника трафика:', err.message);
      });
    }

    return conversationId;
  } catch (error) {
    // Чат может уже существовать (код 409)
    if (error.response?.status === 409) {
      chatMapping.set(chatId, conversationId);
      console.log(`amoCRM Chat: Чат ${conversationId} уже существует (409)`);

      // Асинхронно устанавливаем источник трафика (может быть новая сделка)
      setTrafficSourceForUser(userId).catch(err => {
        console.error('amoCRM Chat: Ошибка установки источника трафика:', err.message);
      });

      return conversationId;
    }
    throw error;
  }
}

/**
 * Установить источник трафика "MAX" для сделки по контакту
 * С повторными попытками для обработки race condition
 * @param {number} contactId - ID контакта
 * @param {string} userId - ID пользователя MAX (для кеширования)
 */
async function setTrafficSourceForContact(contactId, userId) {
  // Проверяем, не установлен ли уже источник для этого пользователя
  if (trafficSourceSet.has(userId)) {
    return;
  }

  console.log(`amoCRM Chat: Устанавливаем источник трафика для контакта #${contactId}...`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    // Задержка перед каждой попыткой — даём время amoCRM создать сделку
    const delay = attempt === 1 ? 1500 : 2000;
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const lead = await amoService.findLeadByContact(contactId);
      if (lead) {
        await amoService.setLeadTrafficSource(lead.id);
        trafficSourceSet.add(userId);
        console.log(`amoCRM Chat: ✅ Источник трафика "MAX" установлен для сделки #${lead.id}`);
        return;
      } else {
        console.log(`amoCRM Chat: Сделка для контакта #${contactId} не найдена (попытка ${attempt})`);
      }
    } catch (error) {
      console.error(`amoCRM Chat: Ошибка поиска сделки (попытка ${attempt}):`, error.message);
    }
  }

  console.log(`amoCRM Chat: Не удалось установить источник для контакта #${contactId} после 3 попыток`);
}

/**
 * Установить источник трафика "MAX" для сделки по userId
 * Используется для существующих чатов
 * С повторными попытками для обработки race condition (сделка может ещё не создаться)
 * @param {string} userId - ID пользователя MAX
 * @param {number} retries - Количество попыток (по умолчанию 3)
 */
async function setTrafficSourceForUser(userId, retries = 3) {
  // Проверяем, не установлен ли уже источник для этого пользователя
  if (trafficSourceSet.has(userId)) {
    return;
  }

  console.log(`amoCRM Chat: Устанавливаем источник трафика для MAX #${userId}...`);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Задержка перед попыткой (кроме первой) — даём время Chat API создать сделку
      if (attempt > 1) {
        console.log(`amoCRM Chat: Попытка ${attempt}/${retries}, ждём 2 сек...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        // Небольшая задержка даже для первой попытки
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Ищем контакт по Max ID
      let contact = await amoService.findContactByMaxId(userId);

      // Если не нашли по Max ID - ищем по имени
      if (!contact) {
        contact = await amoService.findContactByName(`Пользователь MAX #${userId}`);
      }

      if (!contact) {
        console.log(`amoCRM Chat: Контакт для MAX #${userId} не найден (попытка ${attempt})`);
        continue;
      }

      const lead = await amoService.findLeadByContact(contact.id);
      if (lead) {
        console.log(`amoCRM Chat: Найдена сделка #${lead.id} для контакта #${contact.id}`);
        await amoService.setLeadTrafficSource(lead.id);
        trafficSourceSet.add(userId);
        console.log(`amoCRM Chat: ✅ Источник трафика "MAX" установлен для сделки #${lead.id}`);
        return; // Успех!
      } else {
        console.log(`amoCRM Chat: Сделка для контакта #${contact.id} не найдена (попытка ${attempt})`);
      }
    } catch (error) {
      console.error(`amoCRM Chat: Ошибка установки источника (попытка ${attempt}):`, error.message);
    }
  }

  console.log(`amoCRM Chat: Не удалось установить источник трафика для MAX #${userId} после ${retries} попыток`);
}

/**
 * Отправка сообщения пользователя в amoCRM
 * @param {string} chatId - ID чата MAX
 * @param {string} userId - ID пользователя MAX
 * @param {string} messageText - Текст сообщения
 * @param {string} userName - Имя пользователя из MAX API (опционально)
 * @param {string} userPhone - Телефон пользователя (опционально, обновляет контакт)
 * @returns {string|null} msgid отправленного сообщения
 */
export async function sendMessageToAmo(chatId, userId, messageText, userName = null, userPhone = null) {
  if (!isConfigured()) {
    return null;
  }

  try {
    const conversationId = await getOrCreateChat(chatId, userId, userName);
    if (!conversationId) return null;

    // Асинхронно устанавливаем источник трафика (если ещё не установлен)
    setTrafficSourceForUser(userId).catch(err => {
      console.error('amoCRM Chat: Ошибка установки источника трафика:', err.message);
    });

    // Получаем данные из кеша или используем переданные
    const cachedData = userCache.get(userId) || {};

    // Обновляем кеш если передано новое имя
    if (userName && userName !== cachedData.name) {
      cachedData.name = userName;
      userCache.set(userId, cachedData);
    }

    // Обновляем кеш если передан телефон
    if (userPhone) {
      cachedData.phone = userPhone;
      userCache.set(userId, cachedData);
    }

    // Используем данные: переданные > кешированные > fallback
    const displayName = userName || cachedData.name || `Пользователь MAX #${userId}`;
    const displayPhone = userPhone || cachedData.phone || '';

    const path = `/v2/origin/custom/${config.amoScopeId}`;
    const msgId = `max_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const body = {
      event_type: 'new_message',
      payload: {
        timestamp: Math.floor(Date.now() / 1000),
        msgid: msgId,
        conversation_id: conversationId,
        source: {
          external_id: config.amoSourceExternalId
        },
        sender: {
          id: `max_user_${userId}`,
          name: displayName,
          profile: {
            phone: displayPhone,
            email: ''
          }
        },
        message: {
          type: 'text',
          text: messageText
        },
        silent: false
      }
    };

    await amojoRequest('POST', path, body);

    if (displayPhone) {
      console.log(`amoCRM Chat: Сообщение отправлено в чат ${conversationId} (${displayName}, тел: ${displayPhone})`);
    } else {
      console.log(`amoCRM Chat: Сообщение отправлено в чат ${conversationId} (${displayName})`);
    }

    return msgId;
  } catch (error) {
    console.error('amoCRM Chat: Ошибка отправки сообщения:', error.message);
    return null;
  }
}

/**
 * Отправка ответа бота в amoCRM (чтобы ответы бота тоже отображались)
 * @param {string} chatId - ID чата MAX
 * @param {string} messageText - Текст сообщения бота
 * @returns {string|null} msgid
 */
export async function sendBotMessageToAmo(chatId, messageText) {
  if (!isConfigured()) {
    return null;
  }

  try {
    // Используем формат conversationId напрямую (не зависим от кеша)
    const conversationId = chatMapping.get(chatId) || `max_${chatId}`;

    const path = `/v2/origin/custom/${config.amoScopeId}`;
    const msgId = `max_bot_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const body = {
      event_type: 'new_message',
      payload: {
        timestamp: Math.floor(Date.now() / 1000),
        msgid: msgId,
        conversation_id: conversationId,
        source: {
          external_id: config.amoSourceExternalId
        },
        sender: {
          id: 'bot_orange',
          name: 'Бот Orange',
          profile: {
            phone: '',
            email: ''
          }
        },
        message: {
          type: 'text',
          text: messageText
        },
        silent: false
      }
    };

    await amojoRequest('POST', path, body);
    return msgId;
  } catch (error) {
    console.error('amoCRM Chat: Ошибка отправки сообщения бота:', error.message);
    return null;
  }
}

/**
 * Отправка статуса доставки сообщения
 * @param {string} msgId - ID сообщения
 * @param {string} status - Статус: 'sent', 'delivered', 'read', 'failed'
 */
export async function sendDeliveryStatus(msgId, status = 'delivered') {
  if (!isConfigured()) return;

  const path = `/v2/origin/custom/${config.amoScopeId}/${msgId}/delivery_status`;
  const body = { status };

  try {
    await amojoRequest('POST', path, body);
  } catch (error) {
    // Не критичная ошибка
    console.warn('amoCRM Chat: Ошибка отправки статуса доставки:', error.message);
  }
}

/**
 * Отправка индикатора "печатает"
 * @param {string} chatId - ID чата MAX
 */
export async function sendTypingIndicator(chatId) {
  if (!isConfigured()) return;

  const conversationId = chatMapping.get(chatId);
  if (!conversationId) return;

  const path = `/v2/origin/custom/${config.amoScopeId}/typing`;
  const body = {
    conversation_id: conversationId,
    sender: {
      id: 'bot_orange',
      name: 'Бот Orange'
    }
  };

  try {
    await amojoRequest('POST', path, body);
  } catch (error) {
    // Игнорируем ошибки typing
  }
}

/**
 * Получить MAX chatId по conversation_id amoCRM
 * @param {string} conversationId - ID разговора в amoCRM
 * @returns {string|null} chatId MAX
 */
export function getMaxChatId(conversationId) {
  // Ищем в кеше
  for (const [maxChatId, amoConvId] of chatMapping.entries()) {
    if (amoConvId === conversationId) {
      return maxChatId;
    }
  }

  // Если не в кеше, парсим из ID (формат: max_{chatId})
  if (conversationId && conversationId.startsWith('max_')) {
    return conversationId.replace('max_', '');
  }

  return null;
}

/**
 * Сохранить маппинг chatId -> conversationId (для восстановления после перезапуска)
 * В production следует использовать БД
 */
export function setChatMapping(chatId, conversationId) {
  chatMapping.set(chatId, conversationId);
}

/**
 * Получить contactId amoCRM по userId MAX
 * @param {string} userId - ID пользователя MAX
 * @returns {number|null} contactId или null
 */
export function getContactIdByUserId(userId) {
  return userContactMapping.get(userId) || null;
}

/**
 * Сохранить маппинг userId -> contactId
 * @param {string} userId - ID пользователя MAX
 * @param {number} contactId - ID контакта amoCRM
 */
export function setUserContactMapping(userId, contactId) {
  userContactMapping.set(userId, contactId);
}

export default {
  init,
  isConfigured,
  connectAccount,
  disconnectAccount,
  getOrCreateChat,
  sendMessageToAmo,
  sendBotMessageToAmo,
  sendDeliveryStatus,
  sendTypingIndicator,
  getMaxChatId,
  setChatMapping,
  getContactIdByUserId,
  setUserContactMapping
};
