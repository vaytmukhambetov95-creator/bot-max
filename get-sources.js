/**
 * Скрипт для работы с источниками amoCRM
 *
 * Запуск:
 *   node get-sources.js          - показать список источников
 *   node get-sources.js create   - создать источник "MAX Bot Orange"
 */

import 'dotenv/config';
import * as amoService from './src/services/amoService.js';

const EXTERNAL_ID = process.env.AMO_SOURCE_EXTERNAL_ID || 'max_bot_orange';
const PIPELINE_ID = process.env.AMO_PIPELINE_ID;

async function showSources() {
  console.log('\nПолучение списка источников...\n');
  const sources = await amoService.getSources();

  if (sources.length === 0) {
    console.log('Источники не найдены.');
    console.log('Используйте: node get-sources.js create');
  } else {
    console.log('='.repeat(60));
    console.log('ИСТОЧНИКИ СДЕЛОК В amoCRM:');
    console.log('='.repeat(60));

    sources.forEach((source, i) => {
      console.log(`\n[${i + 1}] ${source.name}`);
      console.log(`    ID: ${source.id}`);
      console.log(`    external_id: ${source.external_id || '(не задан)'}`);
      console.log(`    pipeline_id: ${source.pipeline_id || '(не задан)'}`);
      if (source.origin_code) {
        console.log(`    origin_code: ${source.origin_code}`);
      }
    });
  }
}

async function createSourceCmd() {
  console.log('\nСоздание источника "MAX Bot Orange"...');
  console.log(`  external_id: ${EXTERNAL_ID}`);
  console.log(`  pipeline_id: ${PIPELINE_ID}`);

  const source = await amoService.createSource('MAX Bot Orange', EXTERNAL_ID, PIPELINE_ID);

  if (source) {
    console.log('\n✓ Источник успешно создан!');
    console.log(`  ID: ${source.id}`);
    console.log(`  external_id: ${source.external_id}`);
  } else {
    console.log('\n✗ Не удалось создать источник.');
  }
}

async function main() {
  console.log('Инициализация amoCRM...');
  await amoService.init();

  const command = process.argv[2];

  if (command === 'create') {
    await createSourceCmd();
  } else {
    await showSources();
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
