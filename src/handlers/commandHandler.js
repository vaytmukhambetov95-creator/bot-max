import { config } from '../config.js';
import maxApi from '../services/maxApi.js';
import {
  disableBot,
  enableBot,
  formatStatistics,
  isBotDisabled,
  getAllActiveChatIds
} from '../services/analyticsService.js';
import { refreshCatalog } from '../services/catalogService.js';
import { MESSAGES, BUTTONS } from '../config/messages.js';

/**
 * Отправить сообщение
 */
async function reply(chatId, text) {
  await maxApi.sendMessage({ chatId: parseInt(chatId), text });
}

/**
 * Обработчик команды /stop
 * Отключает бота для текущего чата
 */
async function handleStopCommand(chatId, userId) {
  disableBot(chatId, userId);

  console.log(`[${chatId}] Бот отключён пользователем ${userId}`);

  await reply(chatId, 'Бот отключён для этого диалога. Для включения используйте /start');
}

/**
 * Обработчик команды /start
 * Включает бота обратно
 */
async function handleStartCommand(chatId) {
  // Проверяем, был ли бот отключён
  const wasDisabled = isBotDisabled(chatId);

  if (wasDisabled) {
    enableBot(chatId);
    console.log(`[${chatId}] Бот включён обратно`);
  }

  // Отправляем приветствие с кнопками
  await maxApi.sendMessageWithButtons({
    chatId: parseInt(chatId),
    text: wasDisabled ? MESSAGES.botEnabled : MESSAGES.greeting,
    buttons: BUTTONS.mainMenu
  });
}

/**
 * Обработчик команды /stats
 * Показывает статистику (только для админа)
 */
async function handleStatsCommand(chatId, userId) {
  // Проверяем, является ли пользователь админом
  if (config.adminUserId && userId !== config.adminUserId) {
    await reply(chatId, 'Эта команда доступна только администратору.');
    return;
  }

  const stats = formatStatistics();
  await reply(chatId, stats);
}

/**
 * Обработчик команды /refresh
 * Принудительно обновляет каталог (только для админа)
 */
async function handleRefreshCommand(chatId, userId) {
  // Проверяем, является ли пользователь админом
  if (config.adminUserId && userId !== config.adminUserId) {
    await reply(chatId, 'Эта команда доступна только администратору.');
    return;
  }

  await reply(chatId, 'Обновляю каталог...');

  try {
    const products = await refreshCatalog();
    await reply(chatId, `Каталог обновлён! Загружено ${products.length} товаров.`);
  } catch (error) {
    await reply(chatId, `Ошибка обновления каталога: ${error.message}`);
  }
}

/**
 * Обработчик команды /broadcast
 * Рассылка сообщения всем пользователям (только для админа)
 */
async function handleBroadcastCommand(chatId, userId, messageText) {
  // Проверяем, является ли пользователь админом
  if (config.adminUserId && userId !== config.adminUserId) {
    await reply(chatId, 'Эта команда доступна только администратору.');
    return;
  }

  // Извлекаем текст рассылки (всё после /broadcast )
  const broadcastText = messageText.replace(/^\/broadcast\s*/i, '').trim();

  if (!broadcastText) {
    await reply(chatId, 'Укажите текст рассылки.\n\nПример: /broadcast Акция! Скидка 20% на все букеты!');
    return;
  }

  // Получаем все активные чаты (исключая чат админа)
  const chatIds = getAllActiveChatIds(chatId);

  if (chatIds.length === 0) {
    await reply(chatId, 'Нет пользователей для рассылки.');
    return;
  }

  await reply(chatId, `Рассылка запущена...\nПолучателей: ${chatIds.length}`);

  let sent = 0;
  let errors = 0;

  for (const targetChatId of chatIds) {
    try {
      await maxApi.sendMessage({
        chatId: parseInt(targetChatId),
        text: broadcastText
      });
      sent++;

      // Небольшая задержка чтобы не превысить лимиты API
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      errors++;
      console.error(`[broadcast] Ошибка отправки в чат ${targetChatId}:`, error.message);
    }
  }

  await reply(chatId, `Рассылка завершена!\n\nОтправлено: ${sent}\nОшибок: ${errors}`);

  console.log(`[broadcast] Завершено. Отправлено: ${sent}, ошибок: ${errors}`);
}

/**
 * Обработчик команды /help
 */
async function handleHelpCommand(chatId) {
  const helpText = `Команды бота:

/start - Включить бота
/stop - Отключить бота для этого диалога
/help - Показать справку

Для администратора:
/stats - Показать статистику
/refresh - Обновить каталог товаров
/broadcast текст - Рассылка всем пользователям

Просто напишите что вас интересует, и я помогу подобрать букет или отвечу на вопросы!`;

  await reply(chatId, helpText);
}

/**
 * Проверить, является ли сообщение командой
 */
export function isCommand(text) {
  return text && text.startsWith('/');
}

/**
 * Обработать команду
 */
export async function handleCommand({ chatId, userId, messageText }) {
  const command = messageText.split(' ')[0].toLowerCase();

  switch (command) {
    case '/stop':
      await handleStopCommand(chatId, userId);
      return true;

    case '/start':
      await handleStartCommand(chatId);
      return true;

    case '/stats':
      await handleStatsCommand(chatId, userId);
      return true;

    case '/refresh':
      await handleRefreshCommand(chatId, userId);
      return true;

    case '/broadcast':
      await handleBroadcastCommand(chatId, userId, messageText);
      return true;

    case '/help':
      await handleHelpCommand(chatId);
      return true;

    default:
      return false;
  }
}
