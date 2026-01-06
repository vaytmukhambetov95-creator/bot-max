/**
 * Сервис управления заказами
 * Хранит состояние пошаговой формы для каждого чата
 */

// Хранилище активных заказов (в памяти)
// chatId -> { step, data }
const activeOrders = new Map();

// Шаги формы заказа
export const ORDER_STEPS = {
  DATE: 'date',           // Дата доставки
  TIME: 'time',           // Время доставки
  EXACT_TIME: 'exactTime', // Точное время (если выбрано)
  ADDRESS: 'address',     // Адрес
  CARD_TEXT: 'cardText',  // Подпись в открытке
  YOUR_NAME: 'yourName',  // Имя заказчика
  YOUR_PHONE: 'yourPhone', // Телефон заказчика
  RECIPIENT_NAME: 'recipientName', // Имя получателя
  RECIPIENT_PHONE: 'recipientPhone', // Телефон получателя
  CONFIRM: 'confirm'      // Подтверждение
};

// Порядок шагов
const STEPS_ORDER = [
  ORDER_STEPS.DATE,
  ORDER_STEPS.TIME,
  ORDER_STEPS.ADDRESS,
  ORDER_STEPS.CARD_TEXT,
  ORDER_STEPS.YOUR_NAME,
  ORDER_STEPS.YOUR_PHONE,
  ORDER_STEPS.RECIPIENT_NAME,
  ORDER_STEPS.RECIPIENT_PHONE,
  ORDER_STEPS.CONFIRM
];

/**
 * Начать новый заказ
 */
export function startOrder(chatId) {
  activeOrders.set(chatId, {
    step: ORDER_STEPS.DATE,
    data: {
      exactTime: false,
      askRecipientAddress: false
    },
    startedAt: new Date()
  });
  return getOrder(chatId);
}

/**
 * Получить текущий заказ
 */
export function getOrder(chatId) {
  return activeOrders.get(chatId) || null;
}

/**
 * Проверить, есть ли активный заказ
 */
export function hasActiveOrder(chatId) {
  return activeOrders.has(chatId);
}

/**
 * Сохранить ответ и перейти к следующему шагу
 */
export function saveAnswer(chatId, value) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  // Сохраняем значение текущего шага
  order.data[order.step] = value;

  // Переходим к следующему шагу
  const currentIndex = STEPS_ORDER.indexOf(order.step);

  if (currentIndex < STEPS_ORDER.length - 1) {
    order.step = STEPS_ORDER[currentIndex + 1];

    // Пропускаем шаг адреса если выбрано "узнать у получателя"
    if (order.step === ORDER_STEPS.ADDRESS && order.data.askRecipientAddress) {
      order.data[ORDER_STEPS.ADDRESS] = 'Узнать у получателя';
      order.step = STEPS_ORDER[currentIndex + 2];
    }
  }

  return order;
}

/**
 * Установить конкретный шаг (для кнопок выбора времени и т.д.)
 */
export function setStep(chatId, step) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  order.step = step;
  return order;
}

/**
 * Сохранить данные без перехода
 */
export function saveData(chatId, key, value) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  order.data[key] = value;
  return order;
}

/**
 * Перейти к следующему шагу вручную
 */
export function nextStep(chatId) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  const currentIndex = STEPS_ORDER.indexOf(order.step);

  if (currentIndex < STEPS_ORDER.length - 1) {
    order.step = STEPS_ORDER[currentIndex + 1];
  }

  return order;
}

/**
 * Завершить заказ
 */
export function completeOrder(chatId) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  order.completedAt = new Date();
  const completedOrder = { ...order };

  // Удаляем из активных
  activeOrders.delete(chatId);

  return completedOrder;
}

/**
 * Отменить заказ
 */
export function cancelOrder(chatId) {
  activeOrders.delete(chatId);
}

/**
 * Получить текст сводки заказа
 */
export function getOrderSummary(chatId) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  const d = order.data;

  let timeText = d.time || '';
  if (d.exactTime && d.exactTimeValue) {
    timeText = `Точно в ${d.exactTimeValue} (+350₽)`;
  }

  return `📋 *Ваш заказ:*

📅 Дата: ${d.date || '—'}
🕐 Время: ${timeText || '—'}
📍 Адрес: ${d.address || '—'}
💌 Открытка: ${d.cardText || 'Без подписи'}

👤 Заказчик: ${d.yourName || '—'}
📱 Телефон: ${d.yourPhone || '—'}

🎁 Получатель: ${d.recipientName || '—'}
📱 Телефон: ${d.recipientPhone || '—'}`;
}

/**
 * Форматирование заказа для отправки менеджеру
 */
export function formatOrderForManager(chatId, userId) {
  const order = activeOrders.get(chatId);
  if (!order) return null;

  const d = order.data;

  let timeText = d.time || '';
  if (d.exactTime && d.exactTimeValue) {
    timeText = `Точно в ${d.exactTimeValue} (+350₽)`;
  }

  return `🌸 *НОВЫЙ ЗАКАЗ*

📅 Дата: ${d.date || '—'}
🕐 Время: ${timeText || '—'}
📍 Адрес: ${d.address || '—'}
💌 Открытка: ${d.cardText || 'Без подписи'}

👤 Заказчик: ${d.yourName || '—'}
📱 Телефон: ${d.yourPhone || '—'}

🎁 Получатель: ${d.recipientName || '—'}
📱 Телефон: ${d.recipientPhone || '—'}

---
Chat ID: ${chatId}
User ID: ${userId}`;
}

export default {
  ORDER_STEPS,
  startOrder,
  getOrder,
  hasActiveOrder,
  saveAnswer,
  setStep,
  saveData,
  nextStep,
  completeOrder,
  cancelOrder,
  getOrderSummary,
  formatOrderForManager
};
