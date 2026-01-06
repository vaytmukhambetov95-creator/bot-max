/**
 * Проверка полей конкретной сделки
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

const leadId = process.argv[2] || 31051293;  // Последняя сделка

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

async function main() {
  const response = await api.get(`/api/v4/leads/${leadId}`, {
    params: { with: 'custom_fields_values,contacts' }
  });

  const lead = response.data;
  console.log(`Сделка #${lead.id} "${lead.name}"`);
  console.log(`Создана: ${new Date(lead.created_at * 1000).toLocaleString()}`);
  console.log(`Контакты: ${lead._embedded?.contacts?.map(c => '#' + c.id).join(', ')}`);
  console.log('');
  console.log('Поля заказа:');

  const fields = lead.custom_fields_values || [];
  let emptyCount = 0;

  for (const [id, name] of Object.entries(fieldMap)) {
    const field = fields.find(f => f.field_id === parseInt(id));
    let value = field?.values?.[0]?.value || field?.values?.[0]?.enum_id;

    if (parseInt(id) === 2551383 && value) {
      value = `${value} (${new Date(value * 1000).toLocaleString()})`;
    }

    if (value) {
      console.log(`  ✅ ${name}: ${value}`);
    } else {
      console.log(`  ❌ ${name}: ПУСТО`);
      emptyCount++;
    }
  }

  console.log('');
  if (emptyCount === Object.keys(fieldMap).length) {
    console.log('⚠️  ВСЕ ПОЛЯ ПУСТЫЕ - данные не записываются!');
  } else if (emptyCount > 0) {
    console.log(`⚠️  ${emptyCount} полей пустых`);
  } else {
    console.log('✅ Все поля заполнены');
  }
}

main().catch(e => console.error(e.response?.data || e.message));
