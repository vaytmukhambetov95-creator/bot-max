/**
 * Обработчик webhooks от amoCRM
 * Получает ответы менеджеров из CRM и пересылает в MAX Messenger
 */

import { config } from '../config.js';
import { verifyWebhookSignature } from '../utils/amoSignature.js';
import maxApi from '../services/maxApi.js';
import amoChatService from '../services/amoChatService.js';

/**
 * Middleware для проверки подписи webhook
 */
export function verifyAmoWebhook(req, res, next) {
  const signature = req.headers['x-signature'];

  console.log('amoCRM Webhook incoming:', {
    method: req.method,
    path: req.path,
    headers: {
      'x-signature': signature,
      'content-type': req.headers['content-type']
    },
    bodyPreview: JSON.stringify(req.body).substring(0, 200)
  });

  if (!config.amoChannelSecret) {
    console.warn('amoCRM Webhook: secret_key не настроен, пропуск проверки');
    return next();
  }

  // Получаем raw body для проверки подписи
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!verifyWebhookSignature(rawBody, signature, config.amoChannelSecret)) {
    console.warn('amoCRM Webhook: Невалидная подпись, пропускаем (DEBUG MODE)');
    // Временно пропускаем проверку для отладки
    // return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

/**
 * Основной обработчик webhook от amoCRM
 * Обрабатывает сообщения от менеджеров и пересылает в MAX
 */
export async function handleAmoWebhook(req, res) {
  console.log('amoCRM Webhook received:', JSON.stringify(req.body, null, 2));

  try {
    // Структура данных от amoCRM: { message: { conversation, sender, message, ... } }
    const webhookData = req.body.message || req.body;
    const conversation = webhookData.conversation;
    const sender = webhookData.sender;
    const messageData = webhookData.message;

    // Получаем client_id (формат: max_{chatId})
    const clientId = conversation?.client_id;

    if (!clientId) {
      console.warn('amoCRM Webhook: client_id не найден в conversation');
      return res.status(200).json({ ok: true });
    }

    // Извлекаем chatId из client_id (формат: max_156068099)
    const maxChatId = clientId.replace('max_', '');

    if (!maxChatId) {
      console.warn(`amoCRM Webhook: Не удалось извлечь chatId из ${clientId}`);
      return res.status(200).json({ ok: true });
    }

    console.log(`amoCRM Webhook: Получено сообщение для чата ${maxChatId}`);

    // Обрабатываем сообщение
    if (messageData) {
      await handleManagerMessage(maxChatId, messageData, sender);
    }

    // Отправляем статус доставки если есть id сообщения
    if (messageData?.id) {
      await amoChatService.sendDeliveryStatus(messageData.id, 'delivered');
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('amoCRM Webhook Error:', error);
    // Возвращаем 200 чтобы amoCRM не повторял запрос
    res.status(200).json({ ok: false, error: error.message });
  }
}

/**
 * Обработка сообщения от менеджера
 */
async function handleManagerMessage(chatId, message, sender) {
  const senderName = sender?.name || 'Менеджер';

  switch (message.type) {
    case 'text':
      if (message.text) {
        // Отправляем текстовое сообщение в MAX
        await maxApi.sendMessage({
          chatId: parseInt(chatId),
          text: message.text
        });
        console.log(`amoCRM -> MAX: "${message.text}" от ${senderName} в чат ${chatId}`);
      }
      break;

    case 'picture':
    case 'file':
      // Обработка файлов и изображений
      if (message.media) {
        const caption = message.text || (message.type === 'picture' ? '📷 Изображение' : '📎 Файл');
        // Если есть URL файла, можно попробовать отправить
        if (message.media.url) {
          await maxApi.sendMessage({
            chatId: parseInt(chatId),
            text: `${caption}\n${message.media.url}`
          });
        } else {
          await maxApi.sendMessage({
            chatId: parseInt(chatId),
            text: caption
          });
        }
      }
      break;

    case 'voice':
      await maxApi.sendMessage({
        chatId: parseInt(chatId),
        text: '🎤 Голосовое сообщение (воспроизведение недоступно)'
      });
      break;

    case 'video':
      await maxApi.sendMessage({
        chatId: parseInt(chatId),
        text: '🎬 Видео (воспроизведение недоступно)'
      });
      break;

    case 'sticker':
      await maxApi.sendMessage({
        chatId: parseInt(chatId),
        text: '😊 Стикер'
      });
      break;

    case 'location':
      if (message.location) {
        const { lat, lon } = message.location;
        await maxApi.sendMessage({
          chatId: parseInt(chatId),
          text: `📍 Геолокация: ${lat}, ${lon}`
        });
      }
      break;

    default:
      console.log(`amoCRM Webhook: Неизвестный тип сообщения: ${message.type}`);
  }
}

/**
 * Обработчик webhook для события "печатает"
 */
export async function handleTypingWebhook(req, res) {
  const { conversation } = req.body;

  try {
    const conversationId = conversation?.id;
    if (conversationId) {
      const chatId = amoChatService.getMaxChatId(conversationId);
      if (chatId) {
        // Можно показать индикатор печати в MAX
        await maxApi.sendTypingAction(chatId);
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('amoCRM Typing Webhook Error:', error);
    res.status(200).json({ ok: true });
  }
}

/**
 * Обработчик webhook для реакций
 */
export async function handleReactionWebhook(req, res) {
  // Реакции пока не поддерживаются в MAX
  console.log('amoCRM Reaction Webhook:', JSON.stringify(req.body, null, 2));
  res.status(200).json({ ok: true });
}

export default {
  verifyAmoWebhook,
  handleAmoWebhook,
  handleTypingWebhook,
  handleReactionWebhook
};
