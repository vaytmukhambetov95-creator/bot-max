/**
 * Сервис для работы с amoCRM REST API
 * Создание контактов, сделок, управление токенами OAuth
 */

import axios from 'axios';
import { config } from '../config.js';

// ID кастомного поля "Max ID" в контактах amoCRM
const MAX_ID_FIELD_ID = 3031503;

// ID поля "Способ реализации" (enum) в сделках amoCRM
const FULFILLMENT_METHOD_FIELD_ID = 2952799;
const FULFILLMENT_DELIVERY_ENUM_ID = 1490019;  // Доставка по городу
const FULFILLMENT_PICKUP_ENUM_ID = 1490021;    // Самовывоз

// ID поля "Источник трафика" (enum) в сделках amoCRM
const TRAFFIC_SOURCE_FIELD_ID = 2952895;
const TRAFFIC_SOURCE_MAX_ENUM_ID = 1807553;    // MAX

// ID поля "Филиал" (enum) в сделках amoCRM
const BRANCH_FIELD_ID = 3023309;

// Статусы закрытых сделок
const LEAD_CLOSED_STATUSES = [142, 143]; // 142 = успешно, 143 = не реализована

// Хранилище токенов (в production лучше использовать БД)
let tokens = {
  access_token: null,
  refresh_token: null,
  expires_at: null
};

// API клиент
let api = null;

/**
 * Инициализация сервиса
 */
export async function init() {
  if (!config.amoBaseUrl) {
    console.log('amoCRM REST API: не настроен (AMO_BASE_URL отсутствует)');
    return false;
  }

  tokens.access_token = config.amoAccessToken;
  tokens.refresh_token = config.amoRefreshToken;

  api = axios.create({
    baseURL: config.amoBaseUrl,
    headers: { 'Content-Type': 'application/json' }
  });

  // Interceptor для добавления токена
  api.interceptors.request.use(async (axiosConfig) => {
    await ensureValidToken();
    if (tokens.access_token) {
      axiosConfig.headers.Authorization = `Bearer ${tokens.access_token}`;
    }
    return axiosConfig;
  });

  // Interceptor для обработки ошибок и refresh токена
  api.interceptors.response.use(
    response => response,
    async (error) => {
      const originalRequest = error.config;

      // Если 401 и еще не пробовали обновить токен
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          await refreshAccessToken();
          originalRequest.headers.Authorization = `Bearer ${tokens.access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          console.error('amoCRM: Не удалось обновить токен:', refreshError.message);
          throw refreshError;
        }
      }

      throw error;
    }
  );

  console.log('amoCRM REST API: инициализирован');
  return true;
}

/**
 * Проверка наличия токена
 */
export function isConfigured() {
  return Boolean(config.amoBaseUrl && tokens.access_token);
}

/**
 * Обновление access_token через refresh_token
 */
async function refreshAccessToken() {
  if (!tokens.refresh_token) {
    throw new Error('amoCRM: refresh_token не настроен');
  }

  const response = await axios.post(`${config.amoBaseUrl}/oauth2/access_token`, {
    client_id: config.amoClientId,
    client_secret: config.amoClientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    redirect_uri: config.amoRedirectUri
  });

  tokens = {
    access_token: response.data.access_token,
    refresh_token: response.data.refresh_token,
    expires_at: Date.now() + (response.data.expires_in * 1000) - 60000 // Минус минута для запаса
  };

  console.log('amoCRM: токены обновлены');

  // TODO: Сохранить новые токены в БД или файл для персистентности
  // await saveTokensToDatabase(tokens);
}

/**
 * Проверка и обновление токена при необходимости
 */
async function ensureValidToken() {
  if (tokens.expires_at && Date.now() >= tokens.expires_at) {
    await refreshAccessToken();
  }
}

/**
 * Поиск контакта по телефону
 * @param {string} phone - Номер телефона
 * @returns {object|null} Контакт или null
 */
export async function findContactByPhone(phone) {
  if (!isConfigured()) return null;

  try {
    // Очищаем телефон от лишних символов
    const cleanPhone = phone.replace(/\D/g, '');

    const response = await api.get('/api/v4/contacts', {
      params: { query: cleanPhone }
    });

    return response.data?._embedded?.contacts?.[0] || null;
  } catch (error) {
    if (error.response?.status === 204) {
      return null; // Нет результатов
    }
    console.error('amoCRM: Ошибка поиска контакта:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Создание контакта
 * @param {object} data - Данные контакта {name, phone, email?}
 * @returns {object} Созданный контакт
 */
export async function createContact(data) {
  if (!isConfigured()) return null;

  const payload = [{
    name: data.name,
    custom_fields_values: [
      {
        field_code: 'PHONE',
        values: [{ value: data.phone, enum_code: 'WORK' }]
      }
    ]
  }];

  // Добавляем email если есть
  if (data.email) {
    payload[0].custom_fields_values.push({
      field_code: 'EMAIL',
      values: [{ value: data.email, enum_code: 'WORK' }]
    });
  }

  try {
    const response = await api.post('/api/v4/contacts', payload);
    const contact = response.data._embedded.contacts[0];
    console.log(`amoCRM: Создан контакт #${contact.id} - ${data.name}`);
    return contact;
  } catch (error) {
    console.error('amoCRM: Ошибка создания контакта:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Получить или создать контакт
 * @param {object} data - Данные {name, phone, email?}
 * @returns {object} Контакт
 */
export async function getOrCreateContact(data) {
  // Сначала ищем по телефону
  const existing = await findContactByPhone(data.phone);
  if (existing) {
    console.log(`amoCRM: Найден существующий контакт #${existing.id}`);
    return existing;
  }

  // Создаём нового
  return await createContact(data);
}

/**
 * Создание сделки
 * @param {object} data - Данные сделки {name, price?, customFields?}
 * @param {number} contactId - ID контакта для привязки
 * @returns {object} Созданная сделка
 */
export async function createLead(data, contactId) {
  if (!isConfigured()) return null;

  const payload = [{
    name: data.name || 'Заказ букета',
    price: data.price || 0,
    custom_fields_values: data.customFields || []
  }];

  // Добавляем воронку и статус если настроены
  if (config.amoPipelineId) {
    payload[0].pipeline_id = parseInt(config.amoPipelineId);
  }
  if (config.amoStatusId) {
    payload[0].status_id = parseInt(config.amoStatusId);
  }

  // Привязываем контакт
  if (contactId) {
    payload[0]._embedded = {
      contacts: [{ id: contactId }]
    };
  }

  try {
    const response = await api.post('/api/v4/leads', payload);
    const lead = response.data._embedded.leads[0];
    console.log(`amoCRM: Создана сделка #${lead.id}`);
    return lead;
  } catch (error) {
    console.error('amoCRM: Ошибка создания сделки:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Добавление примечания к сделке
 * @param {number} leadId - ID сделки
 * @param {string} text - Текст примечания
 */
export async function addNoteToLead(leadId, text) {
  if (!isConfigured()) return;

  try {
    await api.post(`/api/v4/leads/${leadId}/notes`, [{
      note_type: 'common',
      params: { text }
    }]);
  } catch (error) {
    console.error('amoCRM: Ошибка добавления примечания:', error.response?.data || error.message);
  }
}

/**
 * Поиск сделки по запросу
 * @param {string} query - Поисковый запрос
 * @returns {object|null} Сделка или null
 */
export async function findLead(query) {
  if (!isConfigured()) return null;

  try {
    const response = await api.get('/api/v4/leads', {
      params: { query, limit: 1, order: { created_at: 'desc' } }
    });
    return response.data?._embedded?.leads?.[0] || null;
  } catch (error) {
    if (error.response?.status === 204) return null;
    console.error('amoCRM: Ошибка поиска сделки:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Обновление полей сделки
 * @param {number} leadId - ID сделки
 * @param {Array} customFields - Массив кастомных полей
 * @param {number} contactId - ID контакта для привязки (опционально)
 * @param {number} statusId - ID статуса для перехода (опционально)
 */
export async function updateLead(leadId, customFields, contactId = null, statusId = null) {
  if (!isConfigured()) return null;

  const payload = {
    id: leadId,
    custom_fields_values: customFields
  };

  // Устанавливаем статус если указан
  if (statusId) {
    payload.status_id = statusId;
  }

  // Привязываем контакт если указан
  if (contactId) {
    payload._embedded = {
      contacts: [{ id: contactId }]
    };
  }

  try {
    const response = await api.patch('/api/v4/leads', [payload]);
    console.log(`amoCRM: Сделка #${leadId} обновлена`);
    return response.data._embedded.leads[0];
  } catch (error) {
    console.error('amoCRM: Ошибка обновления сделки:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Установить источник трафика "MAX" для сделки
 * @param {number} leadId - ID сделки
 * @returns {object|null} Обновлённая сделка или null
 */
export async function setLeadTrafficSource(leadId) {
  if (!isConfigured()) return null;

  const customFields = [{
    field_id: TRAFFIC_SOURCE_FIELD_ID,
    values: [{ enum_id: TRAFFIC_SOURCE_MAX_ENUM_ID }]
  }];

  try {
    const response = await api.patch('/api/v4/leads', [{
      id: leadId,
      custom_fields_values: customFields
    }]);
    console.log(`amoCRM: Сделка #${leadId} — установлен источник трафика "MAX"`);
    return response.data._embedded.leads[0];
  } catch (error) {
    console.error('amoCRM: Ошибка установки источника трафика:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Обновление контакта
 * @param {number} contactId - ID контакта
 * @param {object} data - Данные {name?, phone?}
 */
// Кэш для field_id телефона контакта
let contactPhoneFieldId = null;

export async function updateContact(contactId, data) {
  if (!isConfigured()) return null;

  // Получаем field_id для телефона при первом вызове
  if (!contactPhoneFieldId) {
    try {
      const fields = await getContactCustomFields();
      const phoneField = fields.find(f => f.code === 'PHONE');
      if (phoneField) {
        contactPhoneFieldId = phoneField.id;
        console.log(`amoCRM: Найден field_id для PHONE: ${contactPhoneFieldId}`);
      }
      // Логируем все поля для отладки
      console.log('amoCRM: Поля контакта:', fields.map(f => ({ id: f.id, code: f.code, name: f.name })));
    } catch (e) {
      console.error('amoCRM: Ошибка получения полей:', e.message);
    }
  }

  const payload = { id: contactId };

  if (data.name) {
    payload.name = data.name;
  }

  if (data.phone && contactPhoneFieldId) {
    payload.custom_fields_values = [{
      field_id: contactPhoneFieldId,
      values: [{ value: data.phone }]
    }];
  }

  console.log('amoCRM: updateContact payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await api.patch('/api/v4/contacts', [payload]);
    const updatedContact = response.data._embedded.contacts[0];
    console.log(`amoCRM: Контакт #${contactId} обновлён успешно. Ответ:`, JSON.stringify(updatedContact, null, 2));
    return updatedContact;
  } catch (error) {
    console.error('amoCRM: Ошибка обновления контакта:', JSON.stringify(error.response?.data, null, 2) || error.message);
    return null;
  }
}

/**
 * Поиск сделок по контакту
 * Использует endpoint /contacts/{id}/links для надёжного поиска
 * Возвращает последнюю ОТКРЫТУЮ сделку (не закрытую)
 * @param {number} contactId - ID контакта
 * @returns {object|null} Последняя открытая сделка или null
 */
export async function findLeadByContact(contactId) {
  if (!isConfigured()) return null;

  try {
    // Получаем связи контакта через /links endpoint
    const linksResponse = await api.get(`/api/v4/contacts/${contactId}/links`);
    const links = linksResponse.data?._embedded?.links || [];

    // Фильтруем только сделки
    const leadLinks = links.filter(l => l.to_entity_type === 'leads');

    if (leadLinks.length === 0) {
      return null;
    }

    // Сортируем по ID убыванию (новые первые)
    const leadIds = leadLinks.map(l => l.to_entity_id).sort((a, b) => b - a);

    // Ищем первую ОТКРЫТУЮ сделку (не закрытую)
    for (const leadId of leadIds) {
      try {
        const leadResponse = await api.get(`/api/v4/leads/${leadId}`);
        const lead = leadResponse.data;

        if (lead && !LEAD_CLOSED_STATUSES.includes(lead.status_id)) {
          console.log(`amoCRM: Найдена открытая сделка #${lead.id} (статус ${lead.status_id})`);
          return lead;
        } else {
          console.log(`amoCRM: Сделка #${leadId} закрыта (статус ${lead?.status_id}), пропускаем`);
        }
      } catch (err) {
        console.warn(`amoCRM: Ошибка получения сделки #${leadId}:`, err.message);
      }
    }

    // Если все сделки закрыты — возвращаем последнюю (для совместимости)
    console.log(`amoCRM: Все сделки контакта #${contactId} закрыты, возвращаем последнюю`);
    const lastLeadId = leadIds[0];
    const lastLeadResponse = await api.get(`/api/v4/leads/${lastLeadId}`);
    return lastLeadResponse.data || null;
  } catch (error) {
    if (error.response?.status === 204) return null;
    console.error('amoCRM: Ошибка поиска сделки по контакту:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Поиск контакта по имени (для MAX пользователей)
 * @param {string} name - Имя контакта
 * @returns {object|null} Контакт или null
 */
export async function findContactByName(name) {
  if (!isConfigured()) return null;

  try {
    const response = await api.get('/api/v4/contacts', {
      params: { query: name, limit: 1 }
    });
    return response.data?._embedded?.contacts?.[0] || null;
  } catch (error) {
    if (error.response?.status === 204) return null;
    console.error('amoCRM: Ошибка поиска контакта:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Поиск контакта по полю Max ID
 * Использует query поиск, затем проверяет значение поля Max ID
 * @param {string} maxUserId - ID пользователя MAX
 * @returns {object|null} Контакт или null
 */
export async function findContactByMaxId(maxUserId) {
  if (!isConfigured()) return null;

  try {
    // amoCRM не поддерживает фильтр по текстовым кастомным полям
    // Используем query поиск и проверяем результат
    const response = await api.get('/api/v4/contacts', {
      params: {
        query: String(maxUserId),
        with: 'custom_fields_values'
      }
    });

    const contacts = response.data?._embedded?.contacts || [];

    // Ищем контакт где поле Max ID точно совпадает
    for (const contact of contacts) {
      const maxIdField = contact.custom_fields_values?.find(f => f.field_id === MAX_ID_FIELD_ID);
      if (maxIdField?.values?.[0]?.value === String(maxUserId)) {
        return contact;
      }
    }

    return null;
  } catch (error) {
    if (error.response?.status === 204) return null;
    console.error('amoCRM: Ошибка поиска контакта по Max ID:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Обновить поле Max ID в контакте
 * @param {number} contactId - ID контакта
 * @param {string} maxUserId - ID пользователя MAX
 */
export async function setContactMaxId(contactId, maxUserId) {
  if (!isConfigured()) return null;

  const payload = {
    id: contactId,
    custom_fields_values: [{
      field_id: MAX_ID_FIELD_ID,
      values: [{ value: String(maxUserId) }]
    }]
  };

  try {
    const response = await api.patch('/api/v4/contacts', [payload]);
    console.log(`amoCRM: Контакту #${contactId} установлен Max ID: ${maxUserId}`);
    return response.data._embedded.contacts[0];
  } catch (error) {
    console.log(`amoCRM: Не удалось установить Max ID для контакта #${contactId}:`, error.response?.data?.detail || error.message);
    return null;
  }
}

/**
 * Обновление сделки из заказа веб-формы
 * @param {object} orderData - Данные заказа
 * @param {string} visitorId - ID пользователя MAX для поиска сделки
 * @param {number|null} branchEnumId - enum_id филиала (определяется геокодированием)
 */
export async function updateDealFromWebOrder(orderData, visitorId, branchEnumId = null) {
  if (!isConfigured()) return null;

  try {
    // Стратегия поиска контакта (в порядке приоритета):
    // 1. По полю Max ID — самый надёжный способ
    // 2. По имени "Пользователь MAX #userId" — исходное имя от Chat API
    // 3. По телефону — резервный вариант

    let contact = null;
    let lead = null;

    // 1. Ищем по полю Max ID (самый надёжный способ)
    console.log(`amoCRM: Ищем контакт по Max ID "${visitorId}"...`);
    contact = await findContactByMaxId(visitorId);
    if (contact) {
      lead = await findLeadByContact(contact.id);
      if (lead) {
        console.log(`amoCRM: Найден контакт #${contact.id} по Max ID, сделка #${lead.id}`);
      } else {
        console.log(`amoCRM: Контакт #${contact.id} найден по Max ID, но сделка не найдена`);
        contact = null;
      }
    }

    // 2. Ищем по имени "Пользователь MAX #userId"
    if (!lead) {
      console.log(`amoCRM: Ищем контакт по имени "Пользователь MAX #${visitorId}"...`);
      contact = await findContactByName(`Пользователь MAX #${visitorId}`);
      if (contact) {
        lead = await findLeadByContact(contact.id);
        if (lead) {
          console.log(`amoCRM: Найден контакт #${contact.id} по имени MAX, сделка #${lead.id}`);
          // Устанавливаем Max ID чтобы в следующий раз найти быстрее
          await setContactMaxId(contact.id, visitorId);
        } else {
          console.log(`amoCRM: Контакт #${contact.id} найден, но сделка не найдена`);
          contact = null;
        }
      }
    }

    // УБРАН поиск по телефону — слишком опасно, может найти чужой контакт
    // и обновить чужую сделку

    if (!contact || !lead) {
      console.log(`amoCRM: Контакт или сделка не найдены (MAX #${visitorId}, телефон: ${orderData.yourPhone})`);
      return null;
    }

    // Конвертируем дату из формата "20.12.2025" в Unix timestamp
    // Время берём из первого числа диапазона времени доставки (например "18:00 - 19:00" -> 18)
    let dateTimestamp = null;
    if (orderData.date) {
      const [day, month, year] = orderData.date.split('.');

      // Извлекаем первый час из диапазона времени
      let hour = 12; // по умолчанию полдень
      if (orderData.time) {
        const hourMatch = orderData.time.match(/^(\d{1,2})/);
        if (hourMatch) {
          hour = parseInt(hourMatch[1], 10);
        }
      }

      // Создаём дату в UTC, корректируя на московский часовой пояс (UTC+3)
      // Чтобы в amoCRM отображалось правильное время, вычитаем 3 часа
      const dateObj = new Date(Date.UTC(year, month - 1, day, hour - 3, 0, 0));
      dateTimestamp = Math.floor(dateObj.getTime() / 1000);
      console.log(`amoCRM: Дата доставки: ${orderData.date} ${hour}:00 MSK -> timestamp ${dateTimestamp}`);
    }

    // Определяем enum_id для способа реализации
    const fulfillmentEnumId = orderData.orderType === 'pickup'
      ? FULFILLMENT_PICKUP_ENUM_ID
      : FULFILLMENT_DELIVERY_ENUM_ID;

    // Формируем кастомные поля сделки (только непустые значения)
    const customFields = [
      { field_id: 2952511, values: [{ value: orderData.time }] },           // Время доставки (текст)
      { field_id: 2551395, values: [{ value: orderData.cardText || 'Без подписи' }] }, // Подпись в открытке
      { field_id: 2553145, values: [{ value: orderData.address }] },        // Адрес (или филиал для самовывоза)
      { field_id: 3031541, values: [{ value: orderData.yourName }] },       // Имя заказчика
      { field_id: 3031543, values: [{ value: orderData.yourPhone }] },      // Телефон заказчика
      { field_id: FULFILLMENT_METHOD_FIELD_ID, values: [{ enum_id: fulfillmentEnumId }] } // Способ реализации
    ];

    // Добавляем поля получателя только если они заполнены
    if (orderData.recipientName) {
      customFields.push({ field_id: 2952773, values: [{ value: orderData.recipientName }] }); // Имя получателя
    }
    if (orderData.recipientPhone && orderData.recipientPhone !== '+7') {
      customFields.push({ field_id: 2952771, values: [{ value: orderData.recipientPhone }] }); // Телефон получателя
    }

    // Добавляем дату только если успешно сконвертировали
    if (dateTimestamp) {
      customFields.push({ field_id: 2551383, values: [{ value: dateTimestamp }] }); // План дата отгрузки
    }

    // Добавляем филиал если определён геокодированием
    if (branchEnumId) {
      customFields.push({ field_id: BRANCH_FIELD_ID, values: [{ enum_id: branchEnumId }] });
      console.log(`amoCRM: Добавлен филиал enum_id ${branchEnumId} в сделку #${lead.id}`);
    }

    // Обновляем сделку и переносим на этап "Квалифицирован"
    await updateLead(lead.id, customFields, null, 61597534);

    // Пробуем обновить контакт (имя и телефон заказчика)
    // ВАЖНО: Контакты созданные через Chat API нельзя обновить через REST API,
    // но если контакт создан иначе — обновление сработает
    try {
      const updatedContact = await updateContact(contact.id, {
        name: orderData.yourName,
        phone: orderData.yourPhone
      });
      if (updatedContact) {
        console.log(`amoCRM: Контакт #${contact.id} обновлён (имя: ${orderData.yourName}, телефон: ${orderData.yourPhone})`);
      }
    } catch (contactError) {
      console.log(`amoCRM: Не удалось обновить контакт #${contact.id} (возможно создан через Chat API):`, contactError.message);
    }

    console.log(`amoCRM: Заказ из веб-формы обработан - Сделка #${lead.id}, Контакт #${contact.id}`);
    return { lead, contact };
  } catch (error) {
    console.error('amoCRM: Ошибка обновления сделки из веб-формы:', error.message);
    return null;
  }
}

/**
 * Обновление сделки из формы amoCRM (по leadId напрямую)
 * Используется когда ссылка на форму была сгенерирована из amoCRM (не из бота MAX)
 * @param {object} orderData - Данные заказа из формы
 * @param {number} leadId - ID сделки
 * @param {number|null} branchEnumId - enum_id филиала (определяется геокодированием)
 */
export async function updateDealFromAmoForm(orderData, leadId, branchEnumId = null) {
  if (!isConfigured()) return null;

  try {
    console.log(`amoCRM: Обновляем сделку #${leadId} из amoCRM формы`);

    // Конвертируем дату из формата "20.12.2025" в Unix timestamp
    let dateTimestamp = null;
    if (orderData.date) {
      const [day, month, year] = orderData.date.split('.');

      // Извлекаем первый час из диапазона времени
      let hour = 12;
      if (orderData.time) {
        const hourMatch = orderData.time.match(/^(\d{1,2})/);
        if (hourMatch) {
          hour = parseInt(hourMatch[1], 10);
        }
      }

      // Корректируем на московский часовой пояс (UTC+3)
      const dateObj = new Date(Date.UTC(year, month - 1, day, hour - 3, 0, 0));
      dateTimestamp = Math.floor(dateObj.getTime() / 1000);
    }

    // Определяем enum_id для способа реализации
    const fulfillmentEnumId = orderData.orderType === 'pickup'
      ? FULFILLMENT_PICKUP_ENUM_ID
      : FULFILLMENT_DELIVERY_ENUM_ID;

    // Формируем кастомные поля сделки
    const customFields = [
      { field_id: 2952511, values: [{ value: orderData.time }] },           // Время доставки
      { field_id: 2551395, values: [{ value: orderData.cardText || 'Без подписи' }] }, // Подпись открытки
      { field_id: 2553145, values: [{ value: orderData.address }] },        // Адрес
      { field_id: 3031541, values: [{ value: orderData.yourName }] },       // Имя заказчика
      { field_id: 3031543, values: [{ value: orderData.yourPhone }] },      // Телефон заказчика
      { field_id: FULFILLMENT_METHOD_FIELD_ID, values: [{ enum_id: fulfillmentEnumId }] } // Способ реализации
    ];

    // Добавляем поля получателя только если заполнены
    if (orderData.recipientName) {
      customFields.push({ field_id: 2952773, values: [{ value: orderData.recipientName }] });
    }
    if (orderData.recipientPhone && orderData.recipientPhone !== '+7') {
      customFields.push({ field_id: 2952771, values: [{ value: orderData.recipientPhone }] });
    }

    // Добавляем дату если успешно сконвертировали
    if (dateTimestamp) {
      customFields.push({ field_id: 2551383, values: [{ value: dateTimestamp }] });
    }

    // Добавляем филиал если определён геокодированием
    if (branchEnumId) {
      customFields.push({ field_id: BRANCH_FIELD_ID, values: [{ enum_id: branchEnumId }] });
      console.log(`amoCRM: Добавлен филиал enum_id ${branchEnumId} в сделку #${leadId}`);
    }

    // Обновляем сделку и переносим на этап "Квалифицирован"
    await updateLead(leadId, customFields, null, 61597534);

    console.log(`amoCRM: Сделка #${leadId} обновлена из amoCRM формы`);
    return { leadId };
  } catch (error) {
    console.error('amoCRM: Ошибка обновления сделки из amoCRM формы:', error.message);
    throw error;
  }
}

/**
 * Получение списка кастомных полей контакта
 */
export async function getContactCustomFields() {
  if (!isConfigured()) return [];

  try {
    const response = await api.get('/api/v4/contacts/custom_fields');
    return response.data._embedded.custom_fields;
  } catch (error) {
    console.error('amoCRM: Ошибка получения полей контакта:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Получение списка кастомных полей сделки
 * Используется для настройки - вызвать один раз для получения ID полей
 */
export async function getLeadCustomFields() {
  if (!isConfigured()) return [];

  try {
    const response = await api.get('/api/v4/leads/custom_fields');
    return response.data._embedded.custom_fields;
  } catch (error) {
    console.error('amoCRM: Ошибка получения полей:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Получение информации об аккаунте (включая amojo_id для чатов)
 */
export async function getAccountInfo() {
  if (!isConfigured()) return null;

  try {
    const response = await api.get('/api/v4/account', {
      params: { with: 'amojo_id' }
    });
    return response.data;
  } catch (error) {
    console.error('amoCRM: Ошибка получения информации об аккаунте:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Получение списка источников сделок
 * @returns {Array} Массив источников
 */
export async function getSources() {
  if (!isConfigured()) return [];

  try {
    const response = await api.get('/api/v4/sources');
    const sources = response.data?._embedded?.sources || [];
    console.log('amoCRM: Источники:', JSON.stringify(sources, null, 2));
    return sources;
  } catch (error) {
    console.error('amoCRM: Ошибка получения источников:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Создание источника сделок
 * @param {string} name - Название источника
 * @param {string} externalId - Внешний идентификатор
 * @param {number} pipelineId - ID воронки (опционально)
 * @returns {object|null} Созданный источник
 */
export async function createSource(name, externalId, pipelineId = null) {
  if (!isConfigured()) return null;

  const payload = [{
    name,
    external_id: externalId
  }];

  if (pipelineId) {
    payload[0].pipeline_id = parseInt(pipelineId);
  }

  try {
    const response = await api.post('/api/v4/sources', payload);
    const source = response.data?._embedded?.sources?.[0];
    console.log('amoCRM: Источник создан:', JSON.stringify(source, null, 2));
    return source;
  } catch (error) {
    console.error('amoCRM: Ошибка создания источника:', error.response?.data || error.message);
    return null;
  }
}

// ==========================================
// РАБОТА С ЗАДАЧАМИ
// ==========================================

// Кэш для типа задачи "Связаться"
let contactTaskTypeId = null;

/**
 * Получение списка типов задач
 * @returns {Array} Массив типов задач
 */
export async function getTaskTypes() {
  if (!isConfigured()) return [];

  try {
    const response = await api.get('/api/v4/task_types');
    return response.data?._embedded?.task_types || [];
  } catch (error) {
    console.error('amoCRM: Ошибка получения типов задач:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Поиск типа задачи по имени
 * @param {string} name - Имя типа задачи
 * @returns {object|null} Тип задачи или null
 */
export async function findTaskTypeByName(name) {
  const types = await getTaskTypes();
  return types.find(t => t.name === name) || null;
}

/**
 * Создание задачи
 * @param {object} options - Параметры задачи
 * @param {number} options.leadId - ID сделки для привязки
 * @param {number} options.responsibleUserId - ID ответственного пользователя
 * @param {string} options.text - Текст задачи
 * @param {number} options.taskTypeId - ID типа задачи
 * @param {number} options.completeTill - Дедлайн (Unix timestamp)
 * @returns {object|null} Созданная задача или null
 */
export async function createTask({ leadId, responsibleUserId, text, taskTypeId, completeTill }) {
  if (!isConfigured()) return null;

  const payload = [{
    text,
    task_type_id: taskTypeId,
    complete_till: completeTill,
    responsible_user_id: responsibleUserId,
    entity_id: leadId,
    entity_type: 'leads'
  }];

  try {
    const response = await api.post('/api/v4/tasks', payload);
    const task = response.data._embedded.tasks[0];
    console.log(`amoCRM: Создана задача #${task.id} для сделки #${leadId}`);
    return task;
  } catch (error) {
    console.error('amoCRM: Ошибка создания задачи:', error.response?.data || error.message);
    return null;
  }
}

/**
 * Создание задачи "Связаться с клиентом" для менеджера
 * Ищет сделку пользователя и создаёт задачу на ответственного менеджера
 * @param {string} userId - ID пользователя MAX
 * @returns {object|null} Созданная задача или null
 */
export async function createContactManagerTask(userId) {
  if (!isConfigured()) return null;

  try {
    // 1. Ищем контакт по Max ID
    let contact = await findContactByMaxId(userId);

    // 2. Если не найден - ищем по имени
    if (!contact) {
      contact = await findContactByName(`Пользователь MAX #${userId}`);
      if (contact) {
        // Устанавливаем Max ID для будущих поисков
        await setContactMaxId(contact.id, userId);
      }
    }

    if (!contact) {
      console.log(`amoCRM: Контакт не найден для MAX #${userId}`);
      return null;
    }

    // 3. Ищем сделку по контакту
    const lead = await findLeadByContact(contact.id);
    if (!lead) {
      console.log(`amoCRM: Сделка не найдена для контакта #${contact.id}`);
      return null;
    }

    // 4. Получаем responsible_user_id из сделки
    const responsibleUserId = lead.responsible_user_id;
    if (!responsibleUserId) {
      console.log(`amoCRM: У сделки #${lead.id} нет ответственного менеджера`);
      return null;
    }

    // 5. Получаем ID типа задачи "Связаться" (с кэшированием)
    if (!contactTaskTypeId) {
      const taskType = await findTaskTypeByName('Связаться');
      contactTaskTypeId = taskType?.id || 1; // fallback на "Звонок"
      console.log(`amoCRM: Тип задачи "Связаться": ${contactTaskTypeId}`);
    }

    // 6. Создаём задачу с дедлайном +2 минуты
    const completeTill = Math.floor(Date.now() / 1000) + 120; // +2 минуты

    const task = await createTask({
      leadId: lead.id,
      responsibleUserId,
      text: 'Клиент запросил связь с менеджером',
      taskTypeId: contactTaskTypeId,
      completeTill
    });

    if (task) {
      console.log(`amoCRM: Задача #${task.id} создана для сделки #${lead.id}, менеджер #${responsibleUserId}`);
    }

    return task;
  } catch (error) {
    console.error('amoCRM: Ошибка создания задачи для менеджера:', error.message);
    return null;
  }
}

/**
 * Форматирование заказа для примечания в сделке
 */
function formatOrderNote(orderData, chatId, userId, source = 'MAX_BOT') {
  return `ЗАКАЗ ИЗ ${source === 'WEB_FORM' ? 'ВЕБ-ФОРМЫ' : 'БОТА MAX'}

📅 Дата доставки: ${orderData.date}
🕐 Время: ${orderData.time}
📍 Адрес: ${orderData.address}
💌 Открытка: ${orderData.cardText || 'Без подписи'}

👤 Заказчик: ${orderData.yourName}
📱 Телефон: ${orderData.yourPhone}

🎁 Получатель: ${orderData.recipientName}
📱 Телефон: ${orderData.recipientPhone}

---
MAX Chat ID: ${chatId}
MAX User ID: ${userId}
Источник: ${source}`;
}

/**
 * Основная функция: создание сделки из заказа
 * @param {object} orderData - Данные заказа
 * @param {string} chatId - ID чата MAX
 * @param {string} userId - ID пользователя MAX
 * @param {string} source - Источник заказа ('MAX_BOT' или 'WEB_FORM')
 * @returns {object|null} {lead, contact} или null при ошибке
 */
export async function createDealFromOrder(orderData, chatId, userId, source = 'MAX_BOT') {
  if (!isConfigured()) {
    console.log('amoCRM: Пропуск создания сделки - сервис не настроен');
    return null;
  }

  try {
    // 1. Получаем или создаём контакт заказчика
    const contact = await getOrCreateContact({
      name: orderData.yourName,
      phone: orderData.yourPhone
    });

    if (!contact) {
      console.error('amoCRM: Не удалось создать контакт');
      return null;
    }

    // 2. Формируем кастомные поля для сделки
    // ВАЖНО: ID полей нужно получить через getLeadCustomFields() и настроить в .env
    const customFields = [];

    // Пример добавления кастомных полей (раскомментировать после настройки):
    // if (config.amoFieldDeliveryDate) {
    //   customFields.push({ field_id: parseInt(config.amoFieldDeliveryDate), values: [{ value: orderData.date }] });
    // }
    // if (config.amoFieldDeliveryTime) {
    //   customFields.push({ field_id: parseInt(config.amoFieldDeliveryTime), values: [{ value: orderData.time }] });
    // }
    // if (config.amoFieldAddress) {
    //   customFields.push({ field_id: parseInt(config.amoFieldAddress), values: [{ value: orderData.address }] });
    // }
    // if (config.amoFieldRecipient) {
    //   customFields.push({ field_id: parseInt(config.amoFieldRecipient), values: [{ value: orderData.recipientName }] });
    // }

    // 3. Создаём сделку
    const lead = await createLead({
      name: `Заказ букета - ${orderData.yourName}`,
      price: 0, // Цену можно добавить из данных о товаре
      customFields
    }, contact.id);

    if (!lead) {
      console.error('amoCRM: Не удалось создать сделку');
      return null;
    }

    // 4. Добавляем примечание с полными данными заказа
    const noteText = formatOrderNote(orderData, chatId, userId, source);
    await addNoteToLead(lead.id, noteText);

    console.log(`amoCRM: Заказ обработан - Сделка #${lead.id}, Контакт #${contact.id}`);

    return { lead, contact };
  } catch (error) {
    console.error('amoCRM: Ошибка создания сделки из заказа:', error.message);
    // Не прерываем выполнение - заказ всё равно обрабатывается
    return null;
  }
}

/**
 * Проверить наличие открытой сделки у клиента, создать если нет
 * Вызывается при /start или bot_started
 * @param {string} userId - ID пользователя MAX
 * @param {string} userName - Имя пользователя из MAX
 * @returns {object|null} {lead, contact, created} или null
 */
export async function ensureOpenLeadExists(userId, userName = null) {
  if (!isConfigured()) return null;

  try {
    // 1. Ищем контакт по Max ID
    let contact = await findContactByMaxId(userId);

    // 2. Если не нашли — ищем по имени "Пользователь MAX #userId"
    if (!contact) {
      contact = await findContactByName(`Пользователь MAX #${userId}`);
      if (contact) {
        // Устанавливаем Max ID для быстрого поиска в будущем
        await setContactMaxId(contact.id, userId);
      }
    }

    // 3. Если контакт не найден — создаём новый
    if (!contact) {
      const displayName = userName || `Пользователь MAX #${userId}`;
      contact = await createContact({
        name: displayName,
        phone: '' // Телефон неизвестен
      });

      if (contact) {
        await setContactMaxId(contact.id, userId);
        console.log(`amoCRM: Создан контакт #${contact.id} для MAX #${userId}`);
      } else {
        console.error(`amoCRM: Не удалось создать контакт для MAX #${userId}`);
        return null;
      }
    }

    // 4. Ищем открытую сделку у контакта
    const existingLead = await findLeadByContact(contact.id);

    // Проверяем что сделка открытая
    if (existingLead && !LEAD_CLOSED_STATUSES.includes(existingLead.status_id)) {
      console.log(`amoCRM: У контакта #${contact.id} уже есть открытая сделка #${existingLead.id}`);
      return { lead: existingLead, contact, created: false };
    }

    // 5. Открытой сделки нет — создаём новую
    const displayName = userName || contact.name || `Пользователь MAX #${userId}`;

    const customFields = [
      // Источник трафика = MAX
      { field_id: TRAFFIC_SOURCE_FIELD_ID, values: [{ enum_id: TRAFFIC_SOURCE_MAX_ENUM_ID }] }
    ];

    const newLead = await createLead({
      name: `Новое обращение - ${displayName}`,
      price: 0,
      customFields
    }, contact.id);

    if (newLead) {
      console.log(`amoCRM: ✅ Создана новая сделка #${newLead.id} для MAX #${userId}`);
      return { lead: newLead, contact, created: true };
    }

    console.error(`amoCRM: Не удалось создать сделку для MAX #${userId}`);
    return null;
  } catch (error) {
    console.error('amoCRM: Ошибка ensureOpenLeadExists:', error.message);
    return null;
  }
}

export default {
  init,
  isConfigured,
  findContactByPhone,
  findContactByName,
  findContactByMaxId,
  setContactMaxId,
  createContact,
  getOrCreateContact,
  createLead,
  addNoteToLead,
  findLead,
  findLeadByContact,
  updateLead,
  setLeadTrafficSource,
  updateContact,
  updateDealFromWebOrder,
  updateDealFromAmoForm,
  getContactCustomFields,
  getLeadCustomFields,
  getAccountInfo,
  getSources,
  createSource,
  createDealFromOrder,
  ensureOpenLeadExists,
  // Работа с задачами
  getTaskTypes,
  findTaskTypeByName,
  createTask,
  createContactManagerTask
};
