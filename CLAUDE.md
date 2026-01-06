# CLAUDE.md

Бот Orange для MAX Messenger — бот-консультант цветочного магазина с каталогом товаров, ИИ-консультацией (Grok), веб-формой заказа и интеграцией с amoCRM.

## Команды

```bash
npm install      # Установка зависимостей
npm start        # Запуск бота
npm run dev      # Запуск с hot reload
```

**Требования:** Node.js >= 18.0.0

## Архитектура

```
src/
├── index.js, bot.js, config.js    # Точка входа, polling, конфиг
├── handlers/                       # Обработчики событий
│   ├── messageHandler.js           # Текстовые сообщения
│   ├── callbackHandler.js          # Inline-кнопки
│   ├── commandHandler.js           # /start, /stats, /broadcast
│   ├── webOrderHandler.js          # Заказы из веб-формы
│   └── amoWebhookHandler.js        # Webhooks amoCRM
├── services/                       # Бизнес-логика
│   ├── maxApi.js                   # MAX API клиент
│   ├── aiService.js                # OpenRouter/Grok
│   ├── catalogService.js           # YML каталог
│   ├── geocodeService.js           # Яндекс геокодер + зоны доставки
│   ├── amoService.js               # amoCRM REST API
│   └── amoChatService.js           # amoCRM Chat API (amojo)
├── web/                            # Express сервер + веб-форма
└── utils/                          # Вспомогательные функции
```

## Настройки (.env)

```env
# MAX Bot
MAX_BOT_TOKEN=...
ADMIN_USER_ID=...

# OpenRouter AI
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=x-ai/grok-4.1-fast

# Каталог
YML_FEED_URL=...

# Веб-форма
WEB_PORT=3000
WEB_BASE_URL=https://anketa-zakaz.ru
WEB_FORM_SECRET=...

# DaData + Яндекс Геокодер
DADATA_API_KEY=...
YANDEX_GEOCODER_API_KEY=...

# amoCRM REST API
AMO_BASE_URL=https://SUBDOMAIN.amocrm.ru
AMO_CLIENT_ID=...
AMO_CLIENT_SECRET=...
AMO_ACCESS_TOKEN=...
AMO_PIPELINE_ID=...
AMO_STATUS_ID=...

# amoCRM Chats API (amojo)
AMO_CHANNEL_ID=...
AMO_CHANNEL_SECRET=...
AMO_SCOPE_ID=...
AMO_ACCOUNT_ID=...

# amoCRM Webhook
AMO_WEBHOOK_SECRET=...
```

---

## amoCRM: ID полей

### Поля сделки

| Поле | ID | Тип |
|------|-----|-----|
| План дата отгрузки | 2551383 | timestamp |
| Время доставки | 2952511 | текст |
| Адрес | 2553145 | текст |
| Подпись в открытке | 2551395 | текст |
| Имя получателя | 2952773 | текст |
| Телефон получателя | 2952771 | текст |
| Имя заказчика | 3031541 | текст |
| Телефон заказчика | 3031543 | текст |
| Способ реализации | 2952799 | enum |
| Источник трафика | 2952895 | enum |
| Филиал | 3023309 | enum |
| Ссылка на форму | 3031591 | url |

### Enum значения

| Поле | Значение | enum_id |
|------|----------|---------|
| Способ реализации | Доставка | 1490019 |
| Способ реализации | Самовывоз | 1490021 |
| Источник трафика | MAX | 1807553 |
| Филиал | Гагарина 98 | 1783963 |
| Филиал | Волгарь | 1783965 |
| Филиал | Новая Самара | 1804061 |

### Поле контакта

| Поле | ID | Код |
|------|-----|-----|
| Max ID | 3031503 | MAXID |

### Статусы сделок

- Воронка ID: `6015049`
- Статус "Новая заявка": `57290354`
- Статус "Квалифицирован": `61597534` (автоматически после заполнения формы)
- Закрытые статусы: `142` (успешно), `143` (не реализована)

---

## Ключевые особенности

### Поиск сделки по пользователю
```
1. findContactByMaxId(userId) → findLeadByContact(contactId)
2. findContactByName("Пользователь MAX #userId") → findLeadByContact(contactId)
```
**Важно:** `findLeadByContact()` использует `/contacts/{id}/links`, а не фильтр по контактам (он не работает в amoCRM API).

### Автоопределение филиала (геокодирование)
- При доставке адрес геокодируется через Яндекс API
- Координаты проверяются на попадание в полигоны зон (ray-casting)
- Зоны: волгарь, гагарина, офис (→ Гагарина 98), новая самара
- Филиал записывается в поле сделки автоматически

### Автосоздание сделок
- `ensureOpenLeadExists()` проверяет есть ли открытая сделка
- Если все закрыты — создаёт новую через REST API
- Источник трафика "MAX" устанавливается автоматически

### Ограничение amoCRM
**Контакты созданные через Chat API нельзя редактировать** — данные заказчика сохраняются в полях сделки.

### Веб-форма: дублирование данных
**Временные слоты указаны в двух файлах:**
- `src/web/public/index.html` — начальные значения в `<select id="time">`
- `src/web/public/js/order-form.js` — массив `allSlots` (обновляется после выбора даты)

При изменении слотов **обязательно обновлять оба файла**, иначе изменения не будут видны до выбора даты.

---

## Сервер (production)

| Параметр | Значение |
|----------|----------|
| IP | `155.212.217.172` |
| Домен | `anketa-zakaz.ru` |
| Путь | `/var/www/bot-max` |
| PM2 | `bot-max` |

### Команды

```bash
ssh root@155.212.217.172
pm2 logs bot-max
pm2 restart bot-max
```

### Деплой

```powershell
scp -r "C:\Users\User\Desktop\задачи амо\Бот MAX\src" root@155.212.217.172:/var/www/bot-max/ && ssh root@155.212.217.172 "pm2 restart bot-max"
```

---

## Что работает

- Бот в MAX Messenger с каталогом товаров (YML)
- ИИ-консультант (Grok через OpenRouter)
- Веб-форма заказа (доставка/самовывоз)
- Автодополнение адресов (DaData)
- Автоопределение филиала по адресу (Яндекс геокодер)
- Синхронизация чатов MAX ↔ amoCRM
- Автозаполнение полей сделки
- Кнопка "Связаться с менеджером" → задача в amoCRM
- Генерация ссылок на форму из amoCRM (webhook)
- Источник трафика "MAX" в сделках
- Автосоздание сделок при повторных обращениях
- Рассылка /broadcast

---

## Вспомогательные скрипты

| Скрипт | Описание |
|--------|----------|
| `debug-user.js <userId>` | Диагностика пользователя |
| `check-leads.js recent` | Последние сделки |
| `check-leads.js lead:ID` | Информация о сделке |

---

## История изменений

### 29.12.2024 — Автоперенос сделки на этап "Квалифицирован"
- После заполнения веб-формы сделка автоматически переносится на этап "Квалифицирован" (ID: 61597534)
- Изменения в `amoService.js`:
  - Функция `updateLead()` — добавлен параметр `statusId`
  - `updateDealFromWebOrder()` — передаёт статус при обновлении сделки (заказ из бота MAX)
  - `updateDealFromAmoForm()` — передаёт статус при обновлении сделки (заказ из amoCRM)

### 30.12.2024 — Исправление временных слотов в веб-форме
- Убраны двухчасовые слоты: `21:00-23:00`, `23:00-01:00`
- Добавлены часовые слоты: `21:00-22:00`, `22:00-23:00`, `23:00-00:00`, `00:00-01:00`
- Изменения в файлах:
  - `src/web/public/index.html` — начальные значения `<select>` (строки 109-128)
  - `src/web/public/js/order-form.js` — массив `allSlots` в функции `updateTimeSlots()` (строки 314-332)
- **Важно:** Временные слоты указаны в **двух местах** — при изменении нужно обновлять оба файла!

### 31.12.2024 — Исправление webhook amoCRM Chat API
- **Проблема:** Сообщения из amoCRM не доходили в MAX ("Внутренняя ошибка сервера")
- **Причина:** Webhook URL зарегистрирован в техподдержке amoCRM на старом домене `maxsrezanobot.ru`
- **Решение:** Настроено проксирование webhook со старого домена на новый:
  - Создан nginx конфиг `/etc/nginx/sites-available/maxsrezanobot.ru`
  - Получен SSL сертификат для старого домена
  - Запросы на `/api/amo/*` проксируются на `anketa-zakaz.ru`
- **Важно:** Webhook URL указывается при регистрации канала в техподдержке amoCRM, не через API!
- **Важно:** Старый домен `maxsrezanobot.ru` должен работать для webhook amoCRM Chat!

### 31.12.2024 — Исправление отправки сообщений админу
- В `webOrderHandler.js` исправлено: `chatId` → `userId` для `config.adminUserId`
- MAX API требует `user_id` для отправки по ID пользователя, `chat_id` для ID чата

### 31.12.2024 — Исправление parseInt для chatId
- В `amoWebhookHandler.js` добавлен `parseInt(chatId)` при отправке в MAX
- MAX API требует числовой `chat_id`

### 29.12.2024 — Смена домена
- Старый домен: `maxsrezanobot.ru`
- Новый домен: `anketa-zakaz.ru`
- Выполнено:
  - Куплен домен на Beget, настроены A-записи
  - Создан nginx конфиг `/etc/nginx/sites-available/anketa-zakaz.ru`
  - Получен SSL сертификат Let's Encrypt (до 29.03.2026)
  - Обновлён `WEB_BASE_URL` в `.env` на сервере
  - Бот перезапущен через PM2
