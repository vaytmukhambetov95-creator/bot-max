/**
 * Проверка контакта и его сделок
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

const contactId = process.argv[2] || 36676909;

async function main() {
  // 1. Получаем контакт
  console.log(`\n=== КОНТАКТ #${contactId} ===\n`);

  const contactRes = await api.get(`/api/v4/contacts/${contactId}`, {
    params: { with: 'custom_fields_values' }
  });

  const contact = contactRes.data;
  console.log(`Имя: ${contact.name}`);
  console.log(`Создан: ${new Date(contact.created_at * 1000).toLocaleString()}`);

  // Ищем Max ID
  const maxIdField = contact.custom_fields_values?.find(f => f.field_id === MAX_ID_FIELD_ID);
  const maxIdValue = maxIdField?.values?.[0]?.value;
  console.log(`Max ID: ${maxIdValue || 'НЕ УСТАНОВЛЕН'}`);

  // 2. Получаем связи контакта
  console.log(`\n=== СДЕЛКИ КОНТАКТА ===\n`);

  const linksRes = await api.get(`/api/v4/contacts/${contactId}/links`);
  const links = linksRes.data?._embedded?.links || [];
  const leadLinks = links.filter(l => l.to_entity_type === 'leads');

  console.log(`Всего сделок: ${leadLinks.length}`);

  if (leadLinks.length > 0) {
    const leadIds = leadLinks.map(l => l.to_entity_id).sort((a, b) => b - a);
    console.log(`ID (новые сверху): ${leadIds.join(', ')}`);

    // Показываем детали каждой сделки
    for (const leadId of leadIds.slice(0, 5)) {
      const leadRes = await api.get(`/api/v4/leads/${leadId}`);
      const lead = leadRes.data;
      console.log(`\n  Сделка #${lead.id} "${lead.name}"`);
      console.log(`    Создана: ${new Date(lead.created_at * 1000).toLocaleString()}`);
      console.log(`    Статус: ${lead.status_id}`);
    }
  }

  // 3. Что вернёт наша функция findLeadByContact
  console.log(`\n=== РЕЗУЛЬТАТ findLeadByContact() ===\n`);

  if (leadLinks.length > 0) {
    const newestLeadId = Math.max(...leadLinks.map(l => l.to_entity_id));
    console.log(`Будет выбрана сделка: #${newestLeadId}`);
  } else {
    console.log('Сделок нет — вернёт null');
  }

  // 4. Проверяем — можем ли найти этот контакт по Max ID
  if (maxIdValue) {
    console.log(`\n=== ТЕСТ ПОИСКА ПО MAX ID "${maxIdValue}" ===\n`);

    const searchRes = await api.get('/api/v4/contacts', {
      params: { query: maxIdValue, with: 'custom_fields_values' }
    });

    const contacts = searchRes.data?._embedded?.contacts || [];
    console.log(`Найдено контактов: ${contacts.length}`);

    for (const c of contacts) {
      const mf = c.custom_fields_values?.find(f => f.field_id === MAX_ID_FIELD_ID);
      console.log(`  #${c.id} "${c.name}" — Max ID: ${mf?.values?.[0]?.value || 'нет'}`);
    }
  }
}

main().catch(e => console.error(e.response?.data || e.message));
