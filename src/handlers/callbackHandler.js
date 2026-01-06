import maxApi from '../services/maxApi.js';
import { getProductById } from '../services/catalogService.js';
import { createProductImage } from '../services/imageService.js';
import { MESSAGES, BUTTONS } from '../config/messages.js';
import orderService from '../services/orderService.js';
import { generateOrderUrl } from '../utils/orderToken.js';
import amoService from '../services/amoService.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const productsConfig = require('../config/products.json');

/**
 * Обработчик callback от кнопок
 * Payload формат: "action:value" или "action:value:param"
 */
export async function handleCallback({ callbackId, payload, chatId, userId, message }) {
  try {
    // Сначала отвечаем на callback чтобы убрать "loading"
    await maxApi.answerCallback(callbackId);

    // Парсим payload
    const [action, value, param] = payload.split(':');

    console.log(`[Callback] Action: ${action}, Value: ${value}, Param: ${param}`);

    switch (action) {
      case 'menu':
        await handleMenu(chatId, value);
        break;

      case 'category':
        await handleCategory(chatId, userId, value, 0);
        break;

      case 'more':
        const offset = parseInt(param) || 0;
        await handleCategory(chatId, userId, value, offset);
        break;

      case 'order':
        await handleOrderStart(chatId, userId);
        break;

      case 'order_time':
        await handleOrderTime(chatId, value);
        break;

      case 'order_skip':
        await handleOrderSkip(chatId, value);
        break;

      case 'order_ask_address':
        await handleOrderAskAddress(chatId);
        break;

      case 'order_confirm':
        await handleOrderConfirm(chatId, userId);
        break;

      case 'order_cancel':
        await handleOrderCancel(chatId);
        break;

      case 'contact_manager':
        await handleContactManager(chatId, userId);
        break;

      case 'back':
        await handleBack(chatId, value);
        break;

      default:
        console.warn(`Неизвестный callback action: ${action}`);
    }
  } catch (error) {
    console.error('Ошибка обработки callback:', error);
    await maxApi.sendMessage({ chatId, text: MESSAGES.error });
  }
}

/**
 * Обработка меню
 */
async function handleMenu(chatId, menuType) {
  switch (menuType) {
    case 'catalog':
      await showCategories(chatId);
      break;

    default:
      await showMainMenu(chatId);
  }
}

/**
 * Показать главное меню
 */
async function showMainMenu(chatId) {
  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.greeting,
    buttons: BUTTONS.mainMenu
  });
}

/**
 * Показать категории
 */
async function showCategories(chatId) {
  const buttons = BUTTONS.categories(productsConfig.categories);

  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.categories,
    buttons
  });
}

/**
 * Обработка выбора категории - показать товары
 */
async function handleCategory(chatId, userId, categoryKey, offset = 0) {
  const category = productsConfig.categories[categoryKey];

  if (!category) {
    console.error(`Категория не найдена: ${categoryKey}`);
    await showCategories(chatId);
    return;
  }

  const productIds = category.productIds || [];
  const perPage = productsConfig.productsPerPage || 3;

  // Если нет товаров в категории
  if (productIds.length === 0) {
    const buttons = BUTTONS.categories(productsConfig.categories);
    await maxApi.sendMessageWithButtons({
      chatId,
      text: MESSAGES.noProducts,
      buttons
    });
    return;
  }

  // Получаем товары для текущей страницы
  const pageProductIds = productIds.slice(offset, offset + perPage);
  const hasMore = offset + perPage < productIds.length;
  const newOffset = offset + perPage;

  // Отправляем сообщение о категории
  await maxApi.sendMessage({
    chatId,
    text: `${category.emoji} ${category.name}₽`
  });

  // Отправляем фото товаров
  let sentCount = 0;
  for (const productId of pageProductIds) {
    try {
      const product = await getProductById(productId);

      if (!product) {
        console.warn(`Товар не найден: ${productId}`);
        continue;
      }

      // Создаём изображение с ценой
      const imageBuffer = await createProductImage(product);

      // Отправляем
      await maxApi.sendImage({
        chatId,
        imageBuffer,
        filename: `${product.title}.jpg`
      });

      sentCount++;

      // Небольшая задержка между отправками
      await sleep(500);
    } catch (error) {
      console.error(`Ошибка отправки товара ${productId}:`, error.message);
    }
  }

  // Если не удалось отправить ни одного товара
  if (sentCount === 0) {
    await maxApi.sendMessage({
      chatId,
      text: 'Не удалось загрузить букеты. Попробуйте позже.'
    });
  }

  // Генерируем URL для веб-формы заказа
  const orderUrl = generateOrderUrl(chatId, userId, { category: categoryKey });

  // Кнопки после товаров
  const afterText = hasMore
    ? `Показано ${offset + sentCount} из ${productIds.length}`
    : MESSAGES.noMoreProducts;

  const buttons = BUTTONS.afterProducts(categoryKey, hasMore, newOffset, orderUrl);

  await maxApi.sendMessageWithButtons({
    chatId,
    text: afterText,
    buttons
  });
}

// ==========================================
// ФОРМА ЗАКАЗА
// ==========================================

/**
 * Начать оформление заказа
 */
async function handleOrderStart(chatId, userId) {
  // Создаём новый заказ
  orderService.startOrder(chatId);

  // Отправляем приветствие формы
  await maxApi.sendMessage({
    chatId,
    text: MESSAGES.order.start
  });

  // Спрашиваем дату
  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.order.askDate,
    buttons: BUTTONS.orderCancel
  });
}

/**
 * Обработка выбора времени
 */
async function handleOrderTime(chatId, timeValue) {
  const order = orderService.getOrder(chatId);
  if (!order) return;

  const timeLabels = {
    morning: 'Утро (9:00-12:00)',
    afternoon: 'День (12:00-17:00)',
    evening: 'Вечер (17:00-21:00)'
  };

  if (timeValue === 'exact') {
    // Пользователь хочет точное время
    orderService.saveData(chatId, 'exactTime', true);
    orderService.setStep(chatId, orderService.ORDER_STEPS.EXACT_TIME);

    await maxApi.sendMessageWithButtons({
      chatId,
      text: MESSAGES.order.askExactTime,
      buttons: BUTTONS.orderCancel
    });
  } else {
    // Выбран диапазон времени
    orderService.saveData(chatId, 'time', timeLabels[timeValue] || timeValue);
    orderService.nextStep(chatId); // Переходим к адресу

    // Спрашиваем адрес
    await maxApi.sendMessageWithButtons({
      chatId,
      text: MESSAGES.order.askAddress,
      buttons: BUTTONS.orderAddress
    });
  }
}

/**
 * Обработка "Узнать адрес у получателя"
 */
async function handleOrderAskAddress(chatId) {
  const order = orderService.getOrder(chatId);
  if (!order) return;

  orderService.saveData(chatId, 'address', 'Узнать у получателя');
  orderService.saveData(chatId, 'askRecipientAddress', true);
  orderService.nextStep(chatId);

  // Спрашиваем подпись в открытке
  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.order.askCardText,
    buttons: BUTTONS.orderSkipCard
  });
}

/**
 * Обработка пропуска поля
 */
async function handleOrderSkip(chatId, field) {
  const order = orderService.getOrder(chatId);
  if (!order) return;

  if (field === 'cardText') {
    orderService.saveData(chatId, 'cardText', 'Без подписи');
    orderService.nextStep(chatId);

    // Спрашиваем имя заказчика
    await maxApi.sendMessageWithButtons({
      chatId,
      text: MESSAGES.order.askYourName,
      buttons: BUTTONS.orderCancel
    });
  }
}

/**
 * Подтверждение заказа
 */
async function handleOrderConfirm(chatId, userId) {
  const order = orderService.getOrder(chatId);
  if (!order) return;

  // Получаем данные заказа для менеджера
  const orderText = orderService.formatOrderForManager(chatId, userId);
  const orderData = order.data;

  // Завершаем заказ
  orderService.completeOrder(chatId);

  // Отправляем подтверждение пользователю
  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.order.success,
    buttons: BUTTONS.mainMenu
  });

  // Отправляем заказ в amoCRM
  try {
    await amoService.createDealFromOrder(orderData, chatId, userId, 'MAX_BOT');
  } catch (error) {
    console.error('Ошибка отправки в amoCRM:', error.message);
  }

  console.log('=== НОВЫЙ ЗАКАЗ ===');
  console.log(orderText);
  console.log('===================');
}

/**
 * Отмена заказа
 */
async function handleOrderCancel(chatId) {
  orderService.cancelOrder(chatId);

  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.order.cancelled,
    buttons: BUTTONS.mainMenu
  });
}

/**
 * Обработка кнопки "Связаться с менеджером"
 * Отправляет сообщение пользователю и создаёт задачу в amoCRM
 */
async function handleContactManager(chatId, userId) {
  // 1. Сразу отправляем сообщение пользователю
  await maxApi.sendMessageWithButtons({
    chatId,
    text: MESSAGES.contactManager,
    buttons: BUTTONS.mainMenu
  });

  // 2. Создаём задачу в amoCRM (асинхронно, не блокируем пользователя)
  try {
    const task = await amoService.createContactManagerTask(userId);
    if (task) {
      console.log(`[ContactManager] Задача #${task.id} создана для пользователя ${userId}`);
    } else {
      console.log(`[ContactManager] Не удалось создать задачу для пользователя ${userId}`);
    }
  } catch (error) {
    console.error('[ContactManager] Ошибка создания задачи:', error.message);
  }
}

/**
 * Отправить следующий вопрос формы в зависимости от текущего шага
 */
export async function sendNextOrderQuestion(chatId) {
  const order = orderService.getOrder(chatId);
  if (!order) return false;

  const { ORDER_STEPS } = orderService;

  switch (order.step) {
    case ORDER_STEPS.DATE:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askDate,
        buttons: BUTTONS.orderCancel
      });
      break;

    case ORDER_STEPS.TIME:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askTime,
        buttons: BUTTONS.orderTime
      });
      break;

    case ORDER_STEPS.EXACT_TIME:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askExactTime,
        buttons: BUTTONS.orderCancel
      });
      break;

    case ORDER_STEPS.ADDRESS:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askAddress,
        buttons: BUTTONS.orderAddress
      });
      break;

    case ORDER_STEPS.CARD_TEXT:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askCardText,
        buttons: BUTTONS.orderSkipCard
      });
      break;

    case ORDER_STEPS.YOUR_NAME:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askYourName,
        buttons: BUTTONS.orderCancel
      });
      break;

    case ORDER_STEPS.YOUR_PHONE:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askYourPhone,
        buttons: BUTTONS.orderCancel
      });
      break;

    case ORDER_STEPS.RECIPIENT_NAME:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askRecipientName,
        buttons: BUTTONS.orderCancel
      });
      break;

    case ORDER_STEPS.RECIPIENT_PHONE:
      await maxApi.sendMessageWithButtons({
        chatId,
        text: MESSAGES.order.askRecipientPhone,
        buttons: BUTTONS.orderCancel
      });
      break;

    case ORDER_STEPS.CONFIRM:
      const summary = orderService.getOrderSummary(chatId);
      await maxApi.sendMessageWithButtons({
        chatId,
        text: summary + '\n\n' + MESSAGES.order.confirm,
        buttons: BUTTONS.orderConfirm
      });
      break;

    default:
      return false;
  }

  return true;
}

/**
 * Обработка кнопки "Назад"
 */
async function handleBack(chatId, target) {
  switch (target) {
    case 'main':
      await showMainMenu(chatId);
      break;

    case 'catalog':
      await showCategories(chatId);
      break;

    default:
      await showMainMenu(chatId);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { handleCallback, sendNextOrderQuestion };
