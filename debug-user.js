/**
 * Диагностический скрипт для проверки пользователя MAX
 * Эмулирует логику updateDealFromWebOrder()
 *
 * Использование:
 *   node debug-user.js <userId>
 *   node debug-user.js 123456789
 */

import 'dotenv/config';
import axios from 'axios';

const MAX_ID_FIELD_ID = 3031503;

const api = axios.create({
  baseURL: process.env.AMO_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AMO_ACCESS_TOKEN}`
  }
});

async function findContactByMaxId(maxUserId) {
  console.log(`\n🔍 Шаг 1: Поиск контакта по Max ID "${maxUserId}"...`);

  try {
    const response = await api.get('/api/v4/contacts', {
      params: {
        query: String(maxUserId),
        with: 'custom_fields_values'
      }
    });

    const contacts = response.data?._embedded?.contacts || [];
    console.log(`   Найдено контактов по query: ${contacts.length}`);

    for (const contact of contacts) {
      const maxIdField = contact.custom_fields_values?.find(f => f.field_id === MAX_ID_FIELD_ID);
      const maxIdValue = maxIdField?.values?.[0]?.value;
      console.log(`   - Контакт #${contact.id} "${contact.name}", Max ID: ${maxIdValue || 'не установлен'}`);

      if (maxIdValue === String(maxUserId)) {
        console.log(`   ✅ Найден контакт #${contact.id} по Max ID!`);
        return contact;
      }
    }

    console.log(`   ❌ Контакт с точным Max ID не найден`);
    return null;
  } catch (error) {
    if (error.response?.status === 204) {
      console.log(`   ❌ Ничего не найдено (204)`);
      return null;
    }
    console.error(`   ❌ Ошибка:`, error.response?.data || error.message);
    return null;
  }
}

async function findContactByName(name) {
  console.log(`\n🔍 Шаг 2: Поиск контакта по имени "${name}"...`);

  try {
    const response = await api.get('/api/v4/contacts', {
      params: { query: name, limit: 5 }
    });

    const contacts = response.data?._embedded?.contacts || [];
    console.log(`   Найдено контактов: ${contacts.length}`);

    for (const contact of contacts) {
      console.log(`   - Контакт #${contact.id} "${contact.name}"`);
    }

    if (contacts.length > 0) {
      console.log(`   ✅ Используем первый контакт #${contacts[0].id}`);
      return contacts[0];
    }

    console.log(`   ❌ Контакт не найден`);
    return null;
  } catch (error) {
    if (error.response?.status === 204) {
      console.log(`   ❌ Ничего не найдено (204)`);
      return null;
    }
    console.error(`   ❌ Ошибка:`, error.response?.data || error.message);
    return null;
  }
}

async function findLeadByContact(contactId) {
  console.log(`\n🔍 Шаг 3: Поиск сделки для контакта #${contactId}...`);

  try {
    // Получаем связи контакта через /links endpoint
    const linksResponse = await api.get(`/api/v4/contacts/${contactId}/links`);
    const links = linksResponse.data?._embedded?.links || [];

    console.log(`   Всего связей: ${links.length}`);

    // Фильтруем только сделки
    const leadLinks = links.filter(l => l.to_entity_type === 'leads');
    console.log(`   Связей с leads: ${leadLinks.length}`);

    if (leadLinks.length === 0) {
      console.log(`   ❌ Сделки не найдены`);
      return null;
    }

    // Показываем все сделки
    const leadIds = leadLinks.map(l => l.to_entity_id).sort((a, b) => b - a);
    console.log(`   Сделки (новые сверху): ${leadIds.join(', ')}`);

    // Находим ID самой новой сделки (максимальный ID)
    const newestLeadId = Math.max(...leadIds);
    console.log(`   Будет выбрана сделка #${newestLeadId}`);

    // Получаем детали сделки
    const leadResponse = await api.get(`/api/v4/leads/${newestLeadId}`, {
      params: { with: 'contacts' }
    });
    const lead = leadResponse.data;

    console.log(`   ✅ Сделка #${lead.id} "${lead.name}"`);
    console.log(`   Создана: ${new Date(lead.created_at * 1000).toLocaleString()}`);
    console.log(`   Статус: ${lead.status_id}`);
    console.log(`   Ответственный: ${lead.responsible_user_id}`);

    return lead;
  } catch (error) {
    if (error.response?.status === 204) {
      console.log(`   ❌ Связи не найдены (204)`);
      return null;
    }
    console.error(`   ❌ Ошибка:`, error.response?.data || error.message);
    return null;
  }
}

async function getLeadCustomFields(leadId) {
  console.log(`\n📋 Текущие поля сделки #${leadId}:`);

  try {
    const response = await api.get(`/api/v4/leads/${leadId}`, {
      params: { with: 'custom_fields_values' }
    });

    const lead = response.data;
    const fields = lead.custom_fields_values || [];

    // Интересующие нас поля
    const fieldMap = {
      2551383: 'План дата отгрузки',
      2952511: 'Время доставки',
      2952773: 'Имя получателя',
      2952771: 'Телефон получателя',
      2551395: 'Подпись в открытке',
      2553145: 'Адрес',
      3031541: 'Имя заказчика',
      3031543: 'Телефон заказчика',
      2952799: 'Способ реализации',
      2952895: 'Источник трафика'
    };

    for (const field of fields) {
      const fieldName = fieldMap[field.field_id] || `Поле ${field.field_id}`;
      let value = field.values?.[0]?.value;

      // Для enum показываем enum_id
      if (field.values?.[0]?.enum_id) {
        value = `enum_id: ${field.values[0].enum_id}`;
      }

      // Для timestamp конвертируем в дату
      if (field.field_id === 2551383 && value) {
        value = `${value} (${new Date(value * 1000).toLocaleString()})`;
      }

      console.log(`   ${fieldName}: ${value || 'пусто'}`);
    }

    // Проверяем какие поля НЕ заполнены
    const filledFieldIds = fields.map(f => f.field_id);
    const missingFields = Object.entries(fieldMap)
      .filter(([id]) => !filledFieldIds.includes(parseInt(id)))
      .map(([, name]) => name);

    if (missingFields.length > 0) {
      console.log(`\n   ⚠️ Не заполнены: ${missingFields.join(', ')}`);
    }

    return lead;
  } catch (error) {
    console.error(`   ❌ Ошибка:`, error.response?.data || error.message);
    return null;
  }
}

async function main() {
  const userId = process.argv[2];

  if (!userId) {
    console.log('Использование: node debug-user.js <userId>');
    console.log('Пример: node debug-user.js 123456789');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log(`🔧 ДИАГНОСТИКА ПОЛЬЗОВАТЕЛЯ MAX #${userId}`);
  console.log('='.repeat(60));

  // Шаг 1: Ищем контакт по Max ID
  let contact = await findContactByMaxId(userId);

  // Шаг 2: Если не нашли, ищем по имени
  if (!contact) {
    contact = await findContactByName(`Пользователь MAX #${userId}`);
  }

  if (!contact) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ ИТОГ: Контакт не найден!');
    console.log('Возможные причины:');
    console.log('  - Пользователь ещё не писал боту');
    console.log('  - Chat API не создал контакт');
    console.log('  - Max ID не установлен и имя изменилось');
    console.log('='.repeat(60));
    process.exit(1);
  }

  // Шаг 3: Ищем сделку
  const lead = await findLeadByContact(contact.id);

  if (!lead) {
    console.log('\n' + '='.repeat(60));
    console.log(`❌ ИТОГ: Контакт #${contact.id} найден, но сделка не найдена!`);
    console.log('Возможные причины:');
    console.log('  - Chat API не создал сделку автоматически');
    console.log('  - Сделка была удалена или архивирована');
    console.log('='.repeat(60));
    process.exit(1);
  }

  // Шаг 4: Проверяем поля сделки
  await getLeadCustomFields(lead.id);

  console.log('\n' + '='.repeat(60));
  console.log('✅ ИТОГ:');
  console.log(`   Контакт: #${contact.id} "${contact.name}"`);
  console.log(`   Сделка:  #${lead.id} "${lead.name}"`);
  console.log('');
  console.log('Если поля пустые — проблема в updateDealFromWebOrder()');
  console.log('Если поля заполнены — данные записываются, проблема в чём-то другом');
  console.log('='.repeat(60));

  process.exit(0);
}

main();
