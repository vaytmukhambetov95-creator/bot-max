import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config.js';

const API_BASE = 'https://platform-api.max.ru';

/**
 * Создание axios instance с авторизацией
 */
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Authorization': config.maxBotToken,
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

/**
 * Получить информацию о боте
 */
export async function getMe() {
  const response = await api.get('/me');
  return response.data;
}

/**
 * Получить обновления (long polling)
 * @param {number} marker - Маркер последнего обновления
 * @param {number} timeout - Таймаут ожидания (секунды)
 */
export async function getUpdates(marker = null, timeout = 30) {
  const params = {
    timeout,
    limit: 100
  };

  if (marker) {
    params.marker = marker;
  }

  const response = await api.get('/updates', {
    params,
    timeout: (timeout + 10) * 1000 // HTTP timeout больше чем long polling timeout
  });

  return response.data;
}

/**
 * Отправить текстовое сообщение
 * @param {Object} options
 * @param {number} options.chatId - ID чата
 * @param {number} options.userId - ID пользователя (для личных сообщений)
 * @param {string} options.text - Текст сообщения
 */
export async function sendMessage({ chatId, userId, text }) {
  const params = {};
  if (chatId) params.chat_id = chatId;
  if (userId) params.user_id = userId;

  const response = await api.post('/messages', {
    text,
    notify: true
  }, { params });

  return response.data;
}

/**
 * Получить URL для загрузки файла
 * @param {string} type - Тип файла (image, video, audio, file)
 */
export async function getUploadUrl(type = 'image') {
  const response = await api.post('/uploads', null, {
    params: { type }
  });

  return response.data;
}

/**
 * Загрузить изображение
 * @param {Buffer} imageBuffer - Буфер изображения
 * @param {string} filename - Имя файла
 */
export async function uploadImage(imageBuffer, filename = 'image.jpg') {
  // Получаем URL для загрузки
  const uploadUrlResponse = await getUploadUrl('image');
  console.log('Upload URL response:', JSON.stringify(uploadUrlResponse));

  const uploadUrl = uploadUrlResponse.url;

  // Создаём form-data
  const form = new FormData();
  form.append('data', imageBuffer, {
    filename,
    contentType: 'image/jpeg'
  });

  // Загружаем файл
  const response = await axios.post(uploadUrl, form, {
    headers: form.getHeaders(),
    timeout: 30000
  });

  console.log('Upload result:', JSON.stringify(response.data));

  return response.data;
}

/**
 * Отправить сообщение с изображением
 * @param {Object} options
 * @param {number} options.chatId - ID чата
 * @param {number} options.userId - ID пользователя
 * @param {Buffer} options.imageBuffer - Буфер изображения
 * @param {string} options.filename - Имя файла
 * @param {string} options.caption - Подпись к изображению
 */
export async function sendImage({ chatId, userId, imageBuffer, filename = 'image.jpg', caption = '' }) {
  // Загружаем изображение
  const uploadResult = await uploadImage(imageBuffer, filename);

  // Извлекаем токен из разных возможных форматов ответа
  // Формат: { photos: { "photoId": { token: "..." } } }
  let token = uploadResult.token
    || uploadResult.photoToken
    || uploadResult.photo?.token;

  // Если токен в photos объекте с динамическим ключом
  if (!token && uploadResult.photos) {
    const photoKeys = Object.keys(uploadResult.photos);
    if (photoKeys.length > 0) {
      token = uploadResult.photos[photoKeys[0]]?.token;
    }
  }

  if (!token) {
    console.error('Не удалось получить токен изображения:', uploadResult);
    throw new Error('No image token in upload response');
  }

  console.log('Using token:', token.substring(0, 50) + '...');

  const params = {};
  if (chatId) params.chat_id = chatId;
  if (userId) params.user_id = userId;

  // Отправляем сообщение с вложением
  const messageBody = {
    attachments: [{
      type: 'image',
      payload: {
        token: token
      }
    }],
    notify: true
  };

  // Добавляем текст только если есть
  if (caption) {
    messageBody.text = caption;
  }

  console.log('Sending message:', JSON.stringify(messageBody));

  const response = await api.post('/messages', messageBody, { params });

  return response.data;
}

/**
 * Отправить несколько изображений
 */
export async function sendImages({ chatId, userId, images }) {
  const results = [];

  for (const { buffer, filename, caption } of images) {
    try {
      const result = await sendImage({
        chatId,
        userId,
        imageBuffer: buffer,
        filename,
        caption
      });
      results.push(result);

      // Небольшая задержка между отправками
      await sleep(300);
    } catch (error) {
      console.error('Ошибка отправки изображения:', error.message);
    }
  }

  return results;
}

/**
 * Установить команды бота
 */
export async function setMyCommands(commands) {
  // MAX API может не поддерживать этот метод
  // Оставляем для совместимости
  try {
    const response = await api.post('/me/commands', { commands });
    return response.data;
  } catch (error) {
    console.warn('setMyCommands не поддерживается:', error.message);
    return null;
  }
}

/**
 * Отправить действие "печатает"
 */
export async function sendTypingAction(chatId) {
  try {
    await api.post(`/chats/${chatId}/actions`, {
      action: 'typing_on'
    });
  } catch (error) {
    // Игнорируем ошибки typing action
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Отправить сообщение с inline-кнопками
 * @param {Object} options
 * @param {number} options.chatId - ID чата
 * @param {number} options.userId - ID пользователя
 * @param {string} options.text - Текст сообщения
 * @param {Array} options.buttons - Массив кнопок [[{type, text, payload/url}]]
 */
export async function sendMessageWithButtons({ chatId, userId, text, buttons }) {
  const params = {};
  if (chatId) params.chat_id = chatId;
  if (userId) params.user_id = userId;

  const messageBody = {
    text,
    attachments: [{
      type: 'inline_keyboard',
      payload: {
        buttons
      }
    }],
    notify: true
  };

  const response = await api.post('/messages', messageBody, { params });
  return response.data;
}

/**
 * Отправить изображение с кнопками
 * @param {Object} options
 * @param {number} options.chatId - ID чата
 * @param {number} options.userId - ID пользователя
 * @param {Buffer} options.imageBuffer - Буфер изображения
 * @param {string} options.filename - Имя файла
 * @param {string} options.caption - Подпись
 * @param {Array} options.buttons - Кнопки
 */
export async function sendImageWithButtons({ chatId, userId, imageBuffer, filename = 'image.jpg', caption = '', buttons }) {
  // Загружаем изображение
  const uploadResult = await uploadImage(imageBuffer, filename);

  let token = uploadResult.token
    || uploadResult.photoToken
    || uploadResult.photo?.token;

  if (!token && uploadResult.photos) {
    const photoKeys = Object.keys(uploadResult.photos);
    if (photoKeys.length > 0) {
      token = uploadResult.photos[photoKeys[0]]?.token;
    }
  }

  if (!token) {
    throw new Error('No image token in upload response');
  }

  const params = {};
  if (chatId) params.chat_id = chatId;
  if (userId) params.user_id = userId;

  const attachments = [
    {
      type: 'image',
      payload: { token }
    }
  ];

  // Добавляем кнопки если есть
  if (buttons && buttons.length > 0) {
    attachments.push({
      type: 'inline_keyboard',
      payload: { buttons }
    });
  }

  const messageBody = {
    attachments,
    notify: true
  };

  if (caption) {
    messageBody.text = caption;
  }

  const response = await api.post('/messages', messageBody, { params });
  return response.data;
}

/**
 * Ответить на callback от кнопки
 * @param {string} callbackId - ID callback
 * @param {string} notification - Текст уведомления (опционально)
 */
export async function answerCallback(callbackId, notification = '') {
  const params = {
    callback_id: callbackId
  };

  // API требует notification (можно пустую строку)
  const body = {
    notification: notification || ''
  };

  const response = await api.post('/answers', body, { params });
  return response.data;
}

export default {
  getMe,
  getUpdates,
  sendMessage,
  sendMessageWithButtons,
  sendImage,
  sendImageWithButtons,
  sendImages,
  uploadImage,
  getUploadUrl,
  setMyCommands,
  sendTypingAction,
  answerCallback
};
