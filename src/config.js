import 'dotenv/config';

export const config = {
  // MAX Bot
  maxBotToken: process.env.MAX_BOT_TOKEN,

  // OpenRouter AI
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL || 'x-ai/grok-4.1-fast',
  openRouterBaseUrl: 'https://openrouter.ai/api/v1',

  // Каталог
  ymlFeedUrl: process.env.YML_FEED_URL,
  catalogCacheMinutes: 30, // Обновление каталога каждые 30 минут

  // Админ
  adminUserId: process.env.ADMIN_USER_ID,

  // Настройки бота
  maxProductsToShow: 5, // Максимум товаров в ответе

  // MAX API
  maxApiBaseUrl: 'https://platform-api.max.ru',

  // Веб-форма заказа
  webPort: parseInt(process.env.WEB_PORT) || 3000,
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',
  webFormSecret: process.env.WEB_FORM_SECRET || 'change-me-in-production',

  // DaData (автодополнение адресов)
  dadataApiKey: process.env.DADATA_API_KEY,

  // Яндекс Геокодер (определение филиала по адресу)
  yandexGeocoderApiKey: process.env.YANDEX_GEOCODER_API_KEY,
  amoBranchFieldId: 3023309,

  // ==========================================
  // amoCRM REST API (контакты, сделки)
  // ==========================================
  amoBaseUrl: process.env.AMO_BASE_URL, // https://SUBDOMAIN.amocrm.ru
  amoClientId: process.env.AMO_CLIENT_ID,
  amoClientSecret: process.env.AMO_CLIENT_SECRET,
  amoRedirectUri: process.env.AMO_REDIRECT_URI,
  amoAccessToken: process.env.AMO_ACCESS_TOKEN,
  amoRefreshToken: process.env.AMO_REFRESH_TOKEN,

  // Воронка продаж
  amoPipelineId: process.env.AMO_PIPELINE_ID, // ID воронки
  amoStatusId: process.env.AMO_STATUS_ID, // ID статуса (этап воронки)

  // ==========================================
  // amoCRM Chats API (amojo) - интеграция чатов
  // ==========================================
  amoChannelId: process.env.AMO_CHANNEL_ID, // UUID канала от техподдержки
  amoChannelSecret: process.env.AMO_CHANNEL_SECRET, // Секретный ключ канала
  amoScopeId: process.env.AMO_SCOPE_ID, // scope_id после подключения аккаунта
  amoAccountId: process.env.AMO_ACCOUNT_ID, // ID аккаунта amoCRM (для connect)

  // Источник сделок для Chat API (по умолчанию используем channel_id)
  amoSourceExternalId: process.env.AMO_SOURCE_EXTERNAL_ID || process.env.AMO_CHANNEL_ID || 'max_bot_orange',

  // ==========================================
  // amoCRM Webhook (смена статуса сделки)
  // ==========================================
  amoWebhookSecret: process.env.AMO_WEBHOOK_SECRET,
  amoOrderFormLinkFieldId: 3031591,       // Поле для ссылки на форму заказа (тип: url)
  amoTargetStatusId: 57290354,            // Статус "Новая заявка"
  amoTargetPipelineId: 6015049            // ID воронки
};
