/**
 * Установить Max ID для контакта
 * Использование: node set-maxid.js <contactId> <maxUserId>
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

const contactId = process.argv[2];
const maxUserId = process.argv[3];

if (!contactId || !maxUserId) {
  console.log('Использование: node set-maxid.js <contactId> <maxUserId>');
  process.exit(1);
}

async function main() {
  console.log(`\nУстанавливаем Max ID "${maxUserId}" для контакта #${contactId}...`);

  const payload = {
    id: parseInt(contactId),
    custom_fields_values: [{
      field_id: MAX_ID_FIELD_ID,
      values: [{ value: String(maxUserId) }]
    }]
  };

  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await api.patch('/api/v4/contacts', [payload]);
    console.log('\n✅ Успешно!');
    console.log('Ответ:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('\n❌ Ошибка!');
    console.log('Статус:', error.response?.status);
    console.log('Ответ:', JSON.stringify(error.response?.data, null, 2));
  }

  // Проверяем результат
  console.log('\nПроверка...');
  const checkRes = await api.get(`/api/v4/contacts/${contactId}`, {
    params: { with: 'custom_fields_values' }
  });

  const contact = checkRes.data;
  const maxIdField = contact.custom_fields_values?.find(f => f.field_id === MAX_ID_FIELD_ID);
  console.log(`Контакт #${contactId}: Max ID = ${maxIdField?.values?.[0]?.value || 'НЕ УСТАНОВЛЕН'}`);
}

main().catch(e => console.error(e.response?.data || e.message));
