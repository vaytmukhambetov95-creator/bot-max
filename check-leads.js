/**
 * Скрипт для проверки сделок и контактов
 */

import 'dotenv/config';
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.AMO_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AMO_ACCESS_TOKEN}`
  }
});

async function getLeadInfo(leadId) {
  console.log(`\nИнформация о сделке #${leadId}...\n`);

  try {
    const response = await api.get(`/api/v4/leads/${leadId}`, {
      params: { with: 'contacts' }
    });

    const lead = response.data;
    console.log(`Сделка #${lead.id}`);
    console.log(`Название: ${lead.name}`);
    console.log(`Создана: ${new Date(lead.created_at * 1000).toLocaleString()}`);

    const contacts = lead._embedded?.contacts || [];
    if (contacts.length > 0) {
      console.log(`\nКонтакты:`);
      contacts.forEach(c => {
        console.log(`  - Контакт #${c.id} (main: ${c.is_main})`);
      });
    } else {
      console.log('\nКонтакты: не привязаны');
    }
  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

async function getContactLeads(contactId) {
  console.log(`\nПоиск сделок для контакта #${contactId}...\n`);

  try {
    const response = await api.get('/api/v4/leads', {
      params: {
        filter: { contacts: [contactId] },
        order: { id: 'desc' },
        limit: 10
      }
    });

    const leads = response.data?._embedded?.leads || [];

    if (leads.length === 0) {
      console.log('Сделки не найдены');
    } else {
      console.log(`Найдено ${leads.length} сделок:\n`);
      leads.forEach((lead, i) => {
        console.log(`[${i + 1}] Сделка #${lead.id} - ${lead.name}`);
      });
    }
  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

async function testFilterSerialization(contactId) {
  console.log(`\nТест фильтра для контакта #${contactId}...\n`);

  // Проверяем как сериализуется filter
  const params = {
    filter: { contacts: [contactId] },
    order: { id: 'desc' },
    limit: 5
  };

  // Логируем что отправляется
  const urlSearchParams = new URLSearchParams();

  function serialize(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const paramKey = prefix ? `${prefix}[${key}]` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        serialize(value, paramKey);
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => urlSearchParams.append(`${paramKey}[${i}]`, v));
      } else {
        urlSearchParams.append(paramKey, value);
      }
    }
  }

  serialize(params);
  console.log('Ожидаемые параметры:', urlSearchParams.toString());

  try {
    // Тест 1: Стандартный axios params (как в amoService.js)
    console.log('\nТест 1: axios с вложенным объектом...');
    const response1 = await api.get('/api/v4/leads', { params });
    const leads1 = response1.data?._embedded?.leads || [];
    console.log(`Результат: ${leads1.length} сделок`);
    leads1.forEach(l => console.log(`  - #${l.id}`));

    // Тест 2: С форматом filter[contacts][0]
    console.log('\nТест 2: filter[contacts][0]...');
    const response2 = await api.get('/api/v4/leads', {
      params: {
        'filter[contacts][0]': contactId,
        'order[id]': 'desc',
        limit: 5
      }
    });
    const leads2 = response2.data?._embedded?.leads || [];
    console.log(`Результат: ${leads2.length} сделок`);
    leads2.forEach(l => console.log(`  - #${l.id}`));

    // Тест 3: С форматом filter[contacts][] (amoCRM docs)
    console.log('\nТест 3: filter[contacts][] (формат из документации)...');
    const response3 = await api.get('/api/v4/leads', {
      params: {
        'filter[contacts][]': contactId,
        'order[id]': 'desc',
        limit: 5
      }
    });
    const leads3 = response3.data?._embedded?.leads || [];
    console.log(`Результат: ${leads3.length} сделок`);
    leads3.forEach(l => console.log(`  - #${l.id}`));

    // Тест 4: Прямой URL с query string
    console.log('\nТест 4: Прямой URL...');
    const response4 = await api.get(`/api/v4/leads?filter[contacts][]=${contactId}&order[id]=desc&limit=5`);
    const leads4 = response4.data?._embedded?.leads || [];
    console.log(`Результат: ${leads4.length} сделок`);
    leads4.forEach(l => console.log(`  - #${l.id}`));

    // Тест 5: Через contacts/{id}/links
    console.log('\nТест 5: Через contacts/{id}/links...');
    const response5 = await api.get(`/api/v4/contacts/${contactId}/links`);
    const links = response5.data?._embedded?.links || [];
    const leadLinks = links.filter(l => l.to_entity_type === 'leads');
    console.log(`Результат: ${leadLinks.length} связей с leads`);
    leadLinks.forEach(l => console.log(`  - Сделка #${l.to_entity_id}`));

    // Тест 6: Получаем детали сделок через links
    if (leadLinks.length > 0) {
      console.log('\nТест 6: Детали сделок из links...');
      const leadIds = leadLinks.map(l => l.to_entity_id).sort((a, b) => b - a);
      console.log(`ID сделок (по убыванию): ${leadIds.slice(0, 5).join(', ')}...`);
      console.log(`Новейшая сделка: #${leadIds[0]}`);
    }

    // Тест 7: Проверяем новую функцию findLeadByContact (имитация)
    console.log('\n=== РЕЗУЛЬТАТ ИСПРАВЛЕНИЯ ===');
    const newestLeadId = Math.max(...leadLinks.map(l => l.to_entity_id));
    console.log(`findLeadByContact(${contactId}) теперь вернёт: #${newestLeadId}`);

    // Проверяем что сделка действительно принадлежит этому контакту
    const verifyResponse = await api.get(`/api/v4/leads/${newestLeadId}`, { params: { with: 'contacts' } });
    const verifyLead = verifyResponse.data;
    const verifyContacts = verifyLead._embedded?.contacts || [];
    const correctContact = verifyContacts.some(c => c.id === parseInt(contactId));
    console.log(`Сделка #${newestLeadId} привязана к контакту #${contactId}: ${correctContact ? '✅ ДА' : '❌ НЕТ'}`);

  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

async function getRecentLeads(limit = 10) {
  console.log(`\nПоследние ${limit} сделок...\n`);

  try {
    const response = await api.get('/api/v4/leads', {
      params: {
        order: { id: 'desc' },
        limit,
        with: 'contacts'
      }
    });

    const leads = response.data?._embedded?.leads || [];

    if (leads.length === 0) {
      console.log('Сделки не найдены');
    } else {
      leads.forEach((lead, i) => {
        const contacts = lead._embedded?.contacts || [];
        const contactInfo = contacts.length > 0
          ? contacts.map(c => `#${c.id}`).join(', ')
          : 'нет';
        console.log(`[${i + 1}] Сделка #${lead.id} - ${lead.name}`);
        console.log(`    Контакты: ${contactInfo}`);
        console.log(`    Создана: ${new Date(lead.created_at * 1000).toLocaleString()}`);
        console.log('');
      });
    }
  } catch (error) {
    console.error('Ошибка:', error.response?.data || error.message);
  }
}

async function main() {
  const arg = process.argv[2];

  if (arg?.startsWith('lead:')) {
    await getLeadInfo(arg.replace('lead:', ''));
  } else if (arg === 'recent') {
    await getRecentLeads(15);
  } else if (arg?.startsWith('test:')) {
    await testFilterSerialization(arg.replace('test:', ''));
  } else {
    await getContactLeads(arg || '35378425');
  }

  process.exit(0);
}

main();
