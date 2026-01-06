/**
 * Express веб-сервер для формы заказа
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { verifyOrderToken } from '../utils/orderToken.js';
import { suggestAddress } from '../services/dadataService.js';
import { processWebOrder, processAmoOrder } from '../handlers/webOrderHandler.js';
import { verifyAmoWebhook, handleAmoWebhook, handleTypingWebhook } from '../handlers/amoWebhookHandler.js';
import { verifyLeadWebhook, handleLeadStatusWebhook } from '../handlers/amoLeadWebhookHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware для сохранения raw body (нужно для проверки подписи amoCRM webhook)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// ROUTES
// ============================================

/**
 * GET /order - Страница формы заказа
 */
app.get('/order', (req, res) => {
  const token = req.query.t;

  if (!token) {
    return res.redirect('/expired.html');
  }

  const tokenData = verifyOrderToken(token);

  if (!tokenData) {
    return res.redirect('/expired.html');
  }

  // Отправляем HTML форму
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * GET /api/address-suggest - Прокси для DaData
 */
app.get('/api/address-suggest', async (req, res) => {
  const query = req.query.q;

  if (!query || query.length < 3) {
    return res.json({ suggestions: [] });
  }

  try {
    const suggestions = await suggestAddress(query);
    res.json({ suggestions });
  } catch (error) {
    console.error('Ошибка автодополнения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/**
 * POST /api/order - Отправка заказа
 * Поддерживает два типа токенов:
 * - type: 'max' — заказ из бота MAX (содержит chatId, userId)
 * - type: 'amo' — заказ из amoCRM (содержит leadId)
 */
app.post('/api/order', async (req, res) => {
  try {
    const { token, ...formData } = req.body;

    // Проверяем токен
    const tokenData = verifyOrderToken(token);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        error: 'Ссылка устарела. Пожалуйста, запросите новую.'
      });
    }

    // Определяем тип заказа
    const orderType = formData.orderType || 'delivery';

    // Обязательные поля в зависимости от типа
    let requiredFields;
    if (orderType === 'delivery') {
      requiredFields = ['date', 'time', 'yourName', 'yourPhone'];
    } else {
      // Для самовывоза: нет получателя, но нужен филиал
      requiredFields = ['date', 'time', 'yourName', 'yourPhone', 'branch'];
    }

    const missingFields = requiredFields.filter(field => !formData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Заполните обязательные поля: ${missingFields.join(', ')}`
      });
    }

    // Проверяем адрес (только для доставки, если не выбрано "узнать у получателя")
    if (orderType === 'delivery' && !formData.askRecipientAddress && !formData.address) {
      return res.status(400).json({
        success: false,
        error: 'Укажите адрес доставки'
      });
    }

    // Формируем базовые данные заказа
    const baseOrderData = {
      orderType: orderType,
      date: formData.date,
      time: formData.time,
      address: orderType === 'pickup'
        ? formData.branch
        : (formData.askRecipientAddress ? 'Узнать у получателя' : formData.address),
      cardText: formData.cardText || 'Без подписи',
      yourName: formData.yourName,
      yourPhone: formData.yourPhone,
      recipientName: orderType === 'pickup' ? formData.yourName : formData.recipientName,
      recipientPhone: orderType === 'pickup' ? formData.yourPhone : formData.recipientPhone
    };

    // Обрабатываем в зависимости от типа токена
    if (tokenData.type === 'amo') {
      // Токен из amoCRM — обрабатываем по leadId
      await processAmoOrder({
        leadId: tokenData.leadId,
        ...baseOrderData
      });
    } else {
      // Токен из бота MAX — обрабатываем по chatId/userId
      await processWebOrder({
        chatId: tokenData.chatId,
        userId: tokenData.userId,
        productInfo: tokenData.productInfo,
        ...baseOrderData
      });
    }

    res.json({
      success: true,
      message: 'Заказ успешно отправлен!'
    });

  } catch (error) {
    console.error('Ошибка обработки заказа:', error);
    res.status(500).json({
      success: false,
      error: 'Произошла ошибка. Попробуйте позже.'
    });
  }
});

/**
 * GET /success - Страница успешного заказа
 */
app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// ============================================
// amoCRM WEBHOOKS
// ============================================

/**
 * POST /api/amo/webhook - Webhook от amoCRM (ответы менеджеров)
 * URL для регистрации канала: https://your-domain.com/api/amo/webhook/:scope_id
 */
app.post('/api/amo/webhook', verifyAmoWebhook, handleAmoWebhook);
app.post('/api/amo/webhook/:scope_id', verifyAmoWebhook, handleAmoWebhook);

/**
 * POST /api/amo/typing - Webhook "печатает" от amoCRM
 */
app.post('/api/amo/typing', verifyAmoWebhook, handleTypingWebhook);
app.post('/api/amo/typing/:scope_id', verifyAmoWebhook, handleTypingWebhook);

/**
 * POST /api/amo/lead-status - Webhook смены статуса сделки
 * При переходе сделки в статус "Новая заявка" генерирует ссылку на форму
 * URL для настройки в amoCRM: https://maxsrezanobot.ru/api/amo/lead-status?secret=XXX
 */
app.post('/api/amo/lead-status', verifyLeadWebhook, handleLeadStatusWebhook);

/**
 * Запуск сервера
 */
export function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(config.webPort, () => {
      console.log(`🌐 Веб-сервер запущен: ${config.webBaseUrl}`);
      resolve(server);
    });

    server.on('error', (error) => {
      console.error('Ошибка запуска веб-сервера:', error);
      reject(error);
    });
  });
}

export default { startWebServer };
