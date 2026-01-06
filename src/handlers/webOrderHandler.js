/**
 * Обработчик заказов с веб-формы
 */

import maxApi from '../services/maxApi.js';
import { config } from '../config.js';
import { BUTTONS } from '../config/messages.js';
import amoChatService from '../services/amoChatService.js';
import amoService from '../services/amoService.js';
import { detectBranch } from '../services/geocodeService.js';

/**
 * Обрабатывает заказ, полученный с веб-формы
 * @param {object} orderData - Данные заказа
 */
export async function processWebOrder(orderData) {
  const { chatId, userId, ...formData } = orderData;

  console.log('=== НОВЫЙ ЗАКАЗ (веб-форма) ===');

  // Формируем красивую сводку
  const summary = formatOrderSummary(formData);
  const managerSummary = formatOrderForManager(formData, chatId, userId);

  console.log(managerSummary);

  // Отправляем подтверждение пользователю в MAX
  try {
    await maxApi.sendMessageWithButtons({
      chatId,
      text: `🎉 *Заказ принят!*

${summary}

Наш менеджер свяжется с вами для подтверждения.

Спасибо, что выбрали нас! 🌸`,
      buttons: BUTTONS.mainMenu
    });
  } catch (error) {
    console.error('Ошибка отправки подтверждения пользователю:', error);
  }

  // Отправляем уведомление администратору
  if (config.adminUserId) {
    try {
      await maxApi.sendMessage({
        userId: config.adminUserId,
        text: managerSummary
      });
    } catch (error) {
      console.error('Ошибка отправки уведомления админу:', error);
    }
  }

  // Отправляем заказ в существующий чат amoCRM (от имени пользователя, чтобы попало в ту же сделку)
  // Передаём имя и телефон заказчика — они обновятся в контакте через Chat API
  try {
    const orderMessage = formatOrderForAmoChat(formData);
    await amoChatService.sendMessageToAmo(chatId, userId, orderMessage, formData.yourName, formData.yourPhone);
  } catch (error) {
    console.error('Ошибка отправки в amoCRM чат:', error.message);
  }

  // Определяем филиал по адресу (для доставки)
  let branchEnumId = null;
  if (formData.orderType === 'delivery' && formData.address && formData.address !== 'Узнать у получателя') {
    try {
      branchEnumId = await detectBranch(formData.address);
      if (branchEnumId) {
        console.log(`Геокодирование: адрес "${formData.address}" → филиал enum_id ${branchEnumId}`);
      }
    } catch (error) {
      console.error('Ошибка геокодирования:', error.message);
    }
  }

  // Обновляем поля сделки в amoCRM (контакт от Chat API нельзя редактировать)
  try {
    await amoService.updateDealFromWebOrder(formData, userId, branchEnumId);
  } catch (error) {
    console.error('Ошибка обновления сделки в amoCRM:', error.message);
  }

  return { success: true };
}

/**
 * Форматирует сводку заказа для клиента
 */
function formatOrderSummary(data) {
  const isPickup = data.orderType === 'pickup';
  const typeLabel = isPickup ? 'Самовывоз' : 'Доставка';
  const locationLabel = isPickup ? 'Филиал' : 'Адрес';

  let summary = `📦 *Способ:* ${typeLabel}
📅 *Дата:* ${data.date}
🕐 *Время:* ${data.time}
📍 *${locationLabel}:* ${data.address}
💌 *Открытка:* ${data.cardText}

👤 *Заказчик:* ${data.yourName}
📱 *Телефон:* ${data.yourPhone}`;

  // Для доставки добавляем получателя (если указан)
  if (!isPickup && (data.recipientName || data.recipientPhone)) {
    summary += `

🎁 *Получатель:* ${data.recipientName || 'Не указан'}
📱 *Телефон:* ${data.recipientPhone || 'Не указан'}`;
  }

  return summary;
}

/**
 * Форматирует заказ для менеджера
 */
function formatOrderForManager(data, chatId, userId) {
  const isPickup = data.orderType === 'pickup';
  const typeLabel = isPickup ? 'Самовывоз' : 'Доставка';
  const locationLabel = isPickup ? 'Филиал' : 'Адрес';

  let message = `🌸 *НОВЫЙ ЗАКАЗ (веб-форма)*

📦 Способ: ${typeLabel}
📅 Дата: ${data.date}
🕐 Время: ${data.time}
📍 ${locationLabel}: ${data.address}
💌 Открытка: ${data.cardText}

👤 Заказчик: ${data.yourName}
📱 Телефон: ${data.yourPhone}`;

  // Для доставки добавляем получателя (если указан)
  if (!isPickup && (data.recipientName || data.recipientPhone)) {
    message += `

🎁 Получатель: ${data.recipientName || 'Не указан'}
📱 Телефон: ${data.recipientPhone || 'Не указан'}`;
  }

  message += `

---
Chat ID: ${chatId}
User ID: ${userId}`;

  return message;
}

/**
 * Обрабатывает заказ из amoCRM (по leadId)
 * Используется когда ссылка на форму была сгенерирована из amoCRM
 * @param {object} orderData - Данные заказа с leadId
 */
export async function processAmoOrder(orderData) {
  const { leadId, ...formData } = orderData;

  console.log('=== НОВЫЙ ЗАКАЗ (amoCRM форма) ===');
  console.log(`Lead ID: ${leadId}`);
  console.log(JSON.stringify(formData, null, 2));

  // Определяем филиал по адресу (для доставки)
  let branchEnumId = null;
  if (formData.orderType === 'delivery' && formData.address && formData.address !== 'Узнать у получателя') {
    try {
      branchEnumId = await detectBranch(formData.address);
      if (branchEnumId) {
        console.log(`Геокодирование: адрес "${formData.address}" → филиал enum_id ${branchEnumId}`);
      }
    } catch (error) {
      console.error('Ошибка геокодирования:', error.message);
    }
  }

  // Обновляем поля сделки напрямую по leadId
  try {
    await amoService.updateDealFromAmoForm(formData, leadId, branchEnumId);
    console.log(`amoCRM: Сделка #${leadId} обновлена из формы`);
  } catch (error) {
    console.error('Ошибка обновления сделки в amoCRM:', error.message);
    throw error;
  }

  // ВАЖНО: Уведомление в MAX чат НЕ отправляется
  // потому что у нас нет chatId (ссылка создана в amoCRM, не из бота)

  // Уведомление администратору (опционально)
  if (config.adminUserId) {
    try {
      const message = `🌸 *ЗАКАЗ ИЗ amoCRM ФОРМЫ*

📦 Способ: ${formData.orderType === 'pickup' ? 'Самовывоз' : 'Доставка'}
📅 Дата: ${formData.date}
🕐 Время: ${formData.time}
📍 Адрес: ${formData.address}
💌 Открытка: ${formData.cardText || 'Без подписи'}

👤 Заказчик: ${formData.yourName}
📱 Телефон: ${formData.yourPhone}

---
Сделка amoCRM: #${leadId}`;

      await maxApi.sendMessage({
        userId: config.adminUserId,
        text: message
      });
    } catch (error) {
      console.error('Ошибка отправки уведомления админу:', error);
    }
  }

  return { success: true };
}

/**
 * Форматирует заказ для отправки в чат amoCRM
 */
function formatOrderForAmoChat(data) {
  const isPickup = data.orderType === 'pickup';
  const typeLabel = isPickup ? 'Самовывоз' : 'Доставка';
  const locationLabel = isPickup ? 'Филиал' : 'Адрес';

  let message = `🌸 НОВЫЙ ЗАКАЗ (веб-форма)

📦 Способ: ${typeLabel}
📅 Дата: ${data.date}
🕐 Время: ${data.time}
📍 ${locationLabel}: ${data.address}
💌 Открытка: ${data.cardText || 'Без подписи'}

👤 Заказчик: ${data.yourName}
📱 Телефон: ${data.yourPhone}`;

  // Для доставки добавляем получателя (если указан)
  if (!isPickup && (data.recipientName || data.recipientPhone)) {
    message += `

🎁 Получатель: ${data.recipientName || 'Не указан'}
📱 Телефон: ${data.recipientPhone || 'Не указан'}`;
  }

  return message;
}

export default { processWebOrder, processAmoOrder };
