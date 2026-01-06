/**
 * Тест установки источника трафика
 */

import 'dotenv/config';
import axios from 'axios';

const TRAFFIC_SOURCE_FIELD_ID = 2952895;
const TRAFFIC_SOURCE_MAX_ENUM_ID = 1807553;  // MAX

const api = axios.create({
  baseURL: process.env.AMO_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.AMO_ACCESS_TOKEN}`
  }
});

const leadId = process.argv[2] || 31051375;

async function main() {
  console.log(`\nУстанавливаем источник трафика "MAX" для сделки #${leadId}...`);

  const customFields = [{
    field_id: TRAFFIC_SOURCE_FIELD_ID,
    values: [{ enum_id: TRAFFIC_SOURCE_MAX_ENUM_ID }]
  }];

  console.log('Payload:', JSON.stringify(customFields, null, 2));

  try {
    const response = await api.patch('/api/v4/leads', [{
      id: parseInt(leadId),
      custom_fields_values: customFields
    }]);

    console.log('\n✅ Успешно!');
    console.log('Ответ:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('\n❌ Ошибка!');
    console.log('Статус:', error.response?.status);
    console.log('Ответ:', JSON.stringify(error.response?.data, null, 2));
  }

  // Проверяем
  console.log('\nПроверка...');
  const checkRes = await api.get(`/api/v4/leads/${leadId}`, {
    params: { with: 'custom_fields_values' }
  });

  const lead = checkRes.data;
  const sourceField = lead.custom_fields_values?.find(f => f.field_id === TRAFFIC_SOURCE_FIELD_ID);
  const value = sourceField?.values?.[0];

  if (value) {
    console.log(`✅ Источник трафика: enum_id=${value.enum_id}, value="${value.value}"`);
  } else {
    console.log('❌ Источник трафика: НЕ УСТАНОВЛЕН');
  }
}

main().catch(e => console.error(e.response?.data || e.message));
