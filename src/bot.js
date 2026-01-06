import maxApi from './services/maxApi.js';
import { config } from './config.js';
import { handleMessage, handleBotStarted } from './handlers/messageHandler.js';
import { handleCommand, isCommand } from './handlers/commandHandler.js';
import { handleCallback } from './handlers/callbackHandler.js';
import { initDatabase, isBotDisabled } from './services/analyticsService.js';
import { loadCatalog } from './services/catalogService.js';
import amoService from './services/amoService.js';
import amoChatService from './services/amoChatService.js';

let botInfo = null;
let isRunning = false;
let currentMarker = null;

/**
 * Инициализация бота
 */
export async function initBot() {
  // Инициализируем базу данных
  initDatabase();

  // Загружаем каталог при старте
  try {
    await loadCatalog();
  } catch (error) {
    console.warn('Не удалось загрузить каталог при старте:', error.message);
  }

  // Инициализируем amoCRM сервисы
  try {
    await amoService.init();
    await amoChatService.init();
  } catch (error) {
    console.warn('amoCRM: Сервисы не инициализированы:', error.message);
  }

  // Получаем информацию о боте
  try {
    botInfo = await maxApi.getMe();
    console.log(`Бот инициализирован: ${botInfo.name} (ID: ${botInfo.user_id})`);
  } catch (error) {
    console.error('Ошибка получения информации о боте:', error.message);
    throw error;
  }

  return botInfo;
}

/**
 * Обработка одного обновления
 */
async function processUpdate(update) {
  const updateType = update.update_type;

  console.log(`[Update] Тип: ${updateType}`);

  try {
    switch (updateType) {
      case 'bot_started':
        await handleBotStartedEvent(update);
        break;

      case 'message_created':
        await handleMessageCreatedEvent(update);
        break;

      case 'message_callback':
        await handleMessageCallbackEvent(update);
        break;

      default:
        console.log(`Неизвестный тип обновления: ${updateType}`);
    }
  } catch (error) {
    console.error(`Ошибка обработки ${updateType}:`, error);
  }
}

/**
 * Обработка события bot_started
 */
async function handleBotStartedEvent(update) {
  const chatId = update.chat_id?.toString() || update.message?.recipient?.chat_id?.toString();
  const userId = update.user?.user_id?.toString();

  // Извлекаем имя пользователя из MAX API
  const firstName = update.user?.first_name || '';
  const lastName = update.user?.last_name || '';
  const userName = [firstName, lastName].filter(Boolean).join(' ') || null;

  if (!chatId) {
    console.warn('bot_started без chat_id');
    return;
  }

  // Проверяем, не отключён ли бот
  if (isBotDisabled(chatId)) {
    console.log(`Бот отключён для чата ${chatId}, пропускаем bot_started`);
    return;
  }

  console.log(`[${chatId}] Bot started от ${userId} (${userName || 'без имени'})`);
  await handleBotStarted({ chatId, userId, userName });
}

/**
 * Обработка события message_created
 */
async function handleMessageCreatedEvent(update) {
  const message = update.message;
  if (!message) return;

  const messageText = message.body?.text || '';
  const chatId = message.recipient?.chat_id?.toString();
  const userId = message.sender?.user_id?.toString();

  // Извлекаем имя пользователя из MAX API
  const firstName = message.sender?.first_name || '';
  const lastName = message.sender?.last_name || '';
  const userName = [firstName, lastName].filter(Boolean).join(' ') || null;

  if (!chatId) {
    console.warn('message_created без chat_id');
    return;
  }

  console.log(`[${chatId}] От ${userId} (${userName || 'без имени'}): ${messageText.substring(0, 50)}`);

  // Игнорируем сообщения от самого бота
  if (botInfo && userId === botInfo.user_id?.toString()) {
    return;
  }

  // Проверяем команды
  if (isCommand(messageText)) {
    const handled = await handleCommand({ chatId, userId, messageText });
    if (handled) return;
  }

  // Проверяем, не отключён ли бот
  if (isBotDisabled(chatId)) {
    console.log(`Бот отключён для чата ${chatId}`);
    return;
  }

  // Обрабатываем обычное сообщение (передаём имя пользователя для amoCRM)
  await handleMessage({ chatId, userId, messageText, userName });
}

/**
 * Обработка события message_callback (нажатие на кнопку)
 */
async function handleMessageCallbackEvent(update) {
  const callback = update.callback;
  if (!callback) {
    console.warn('message_callback без callback данных');
    return;
  }

  const callbackId = callback.callback_id;
  const payload = callback.payload;
  const user = callback.user;
  const message = update.message;

  const chatId = message?.recipient?.chat_id?.toString();
  const userId = user?.user_id?.toString();

  console.log(`[Callback] От ${userId} в чате ${chatId}: ${payload}`);

  // Проверяем, не отключён ли бот
  if (chatId && isBotDisabled(chatId)) {
    console.log(`Бот отключён для чата ${chatId}, пропускаем callback`);
    return;
  }

  await handleCallback({ callbackId, payload, chatId, userId, message });
}

/**
 * Цикл long polling
 */
async function pollUpdates() {
  while (isRunning) {
    try {
      const result = await maxApi.getUpdates(currentMarker, 30);

      if (result.updates && result.updates.length > 0) {
        for (const update of result.updates) {
          await processUpdate(update);
        }
      }

      // Обновляем маркер для следующего запроса
      if (result.marker) {
        currentMarker = result.marker;
      }
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        // Таймаут - это нормально для long polling
        continue;
      }

      console.error('Ошибка polling:', error.message);

      // Ждём перед повторной попыткой
      await sleep(5000);
    }
  }
}

/**
 * Запуск бота
 */
export async function startBot() {
  console.log('Запуск бота Orange...');

  if (isRunning) {
    console.warn('Бот уже запущен');
    return;
  }

  isRunning = true;
  console.log('Long polling запущен. Ожидание сообщений...');

  await pollUpdates();
}

/**
 * Остановка бота
 */
export function stopBot() {
  console.log('Остановка бота...');
  isRunning = false;
}

/**
 * Получить информацию о боте
 */
export function getBotInfo() {
  return botInfo;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
