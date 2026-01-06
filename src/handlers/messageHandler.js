import maxApi from '../services/maxApi.js';
import { logMessage, isBotDisabled } from '../services/analyticsService.js';
import { MESSAGES, BUTTONS } from '../config/messages.js';
import orderService from '../services/orderService.js';
import { sendNextOrderQuestion } from './callbackHandler.js';
import amoChatService from '../services/amoChatService.js';
import amoService from '../services/amoService.js';

/**
 * Главный обработчик входящих сообщений
 * В хардкодном боте текстовые сообщения обрабатываются минимально -
 * основная логика через кнопки
 * @param {string} userName - Имя пользователя из MAX API (first_name + last_name)
 */
export async function handleMessage({ chatId, userId, messageText, userName }) {
  if (!chatId || !messageText) {
    return;
  }

  // Проверяем, не отключён ли бот для этого чата
  if (isBotDisabled(chatId)) {
    console.log(`Бот отключён для чата ${chatId}, пропускаем сообщение`);
    return;
  }

  console.log(`[${chatId}] Текстовое сообщение: ${messageText}`);

  // Логируем входящее сообщение
  logMessage(chatId, userId, messageText, false);

  // Отправляем сообщение в amoCRM с реальным именем пользователя из MAX
  amoChatService.sendMessageToAmo(chatId, userId, messageText, userName).catch(err => {
    console.warn('amoCRM Chat: не удалось отправить сообщение:', err.message);
  });

  // Показываем "печатает"
  await maxApi.sendTypingAction(chatId);

  try {
    // Проверяем, есть ли активный заказ
    if (orderService.hasActiveOrder(chatId)) {
      await handleOrderInput(chatId, userId, messageText);
    } else {
      // Нет активного заказа - показываем меню
      await showMenu(chatId, userId);
    }
  } catch (error) {
    console.error('Ошибка обработки сообщения:', error);
    await maxApi.sendMessage({
      chatId: parseInt(chatId),
      text: MESSAGES.error
    });
  }
}

/**
 * Обработка ввода в форме заказа
 */
async function handleOrderInput(chatId, userId, text) {
  const order = orderService.getOrder(chatId);
  if (!order) return;

  const { ORDER_STEPS } = orderService;

  console.log(`[Order] Шаг: ${order.step}, Ввод: ${text}`);

  switch (order.step) {
    case ORDER_STEPS.DATE:
      orderService.saveAnswer(chatId, text);
      // После даты спрашиваем время (кнопками)
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askTime,
        buttons: BUTTONS.orderTime
      });
      break;

    case ORDER_STEPS.TIME:
      // Время обычно выбирается кнопками, но если ввели текстом
      orderService.saveData(chatId, 'time', text);
      orderService.nextStep(chatId);
      await sendNextOrderQuestion(chatId);
      break;

    case ORDER_STEPS.EXACT_TIME:
      // Сохраняем точное время
      orderService.saveData(chatId, 'exactTimeValue', text);
      orderService.saveData(chatId, 'time', `Точно в ${text}`);
      orderService.setStep(chatId, ORDER_STEPS.ADDRESS);
      // Спрашиваем адрес
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askAddress,
        buttons: BUTTONS.orderAddress
      });
      break;

    case ORDER_STEPS.ADDRESS:
      orderService.saveAnswer(chatId, text);
      await sendNextOrderQuestion(chatId);
      break;

    case ORDER_STEPS.CARD_TEXT:
      orderService.saveAnswer(chatId, text);
      await sendNextOrderQuestion(chatId);
      break;

    case ORDER_STEPS.YOUR_NAME:
      orderService.saveAnswer(chatId, text);
      await sendNextOrderQuestion(chatId);
      break;

    case ORDER_STEPS.YOUR_PHONE:
      // Валидация телефона (простая)
      const phone = text.replace(/\D/g, '');
      if (phone.length < 10) {
        await maxApi.sendMessageWithButtons({
          chatId,
          text: '⚠️ Введите корректный номер телефона (минимум 10 цифр)',
          buttons: BUTTONS.orderCancel
        });
        return;
      }
      orderService.saveAnswer(chatId, text);
      await sendNextOrderQuestion(chatId);
      break;

    case ORDER_STEPS.RECIPIENT_NAME:
      orderService.saveAnswer(chatId, text);
      await sendNextOrderQuestion(chatId);
      break;

    case ORDER_STEPS.RECIPIENT_PHONE:
      // Валидация телефона
      const recipientPhone = text.replace(/\D/g, '');
      if (recipientPhone.length < 10) {
        await maxApi.sendMessageWithButtons({
          chatId,
          text: '⚠️ Введите корректный номер телефона (минимум 10 цифр)',
          buttons: BUTTONS.orderCancel
        });
        return;
      }
      orderService.saveAnswer(chatId, text);
      await sendNextOrderQuestion(chatId);
      break;

    default:
      // Неизвестный шаг - показываем текущий вопрос заново
      await sendNextOrderQuestion(chatId);
  }
}

/**
 * Показать меню с кнопками
 */
async function showMenu(chatId, userId) {
  const text = MESSAGES.greeting;

  await maxApi.sendMessageWithButtons({
    chatId: parseInt(chatId),
    text,
    buttons: BUTTONS.mainMenu
  });

  logMessage(chatId, userId, text, true);
}

/**
 * Обработчик первого сообщения (bot_started)
 * @param {string} userName - Имя пользователя из MAX API
 */
export async function handleBotStarted({ chatId, userId, userName }) {
  if (!chatId) return;

  // Проверяем, не отключён ли бот
  if (isBotDisabled(chatId)) {
    return;
  }

  // Создаём чат в amoCRM с реальным именем пользователя из MAX
  amoChatService.getOrCreateChat(chatId, userId, userName).catch(err => {
    console.warn('amoCRM Chat: не удалось создать чат:', err.message);
  });

  // Проверяем наличие открытой сделки, создаём если нет
  amoService.ensureOpenLeadExists(userId, userName).catch(err => {
    console.warn('amoCRM: не удалось создать/найти сделку:', err.message);
  });

  try {
    // Отправляем приветствие с кнопками
    await maxApi.sendMessageWithButtons({
      chatId: parseInt(chatId),
      text: MESSAGES.greeting,
      buttons: BUTTONS.mainMenu
    });

    logMessage(chatId, userId, MESSAGES.greeting, true);
  } catch (error) {
    console.error('Ошибка отправки приветствия:', error);

    // Фоллбэк без кнопок
    await maxApi.sendMessage({
      chatId: parseInt(chatId),
      text: MESSAGES.greeting
    });
  }
}

export default { handleMessage, handleBotStarted };
