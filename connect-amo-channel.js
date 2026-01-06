/**
 * Скрипт для подключения канала чатов amoCRM
 * Выполнить один раз после получения channel_id от техподдержки
 *
 * Использование: node connect-amo-channel.js
 */

import 'dotenv/config';
import amoService from './src/services/amoService.js';
import amoChatService from './src/services/amoChatService.js';

async function main() {
  console.log('=== Подключение канала чатов amoCRM ===\n');

  // 1. Инициализируем REST API
  console.log('1. Инициализация amoCRM REST API...');
  await amoService.init();

  // 2. Получаем информацию об аккаунте
  console.log('2. Получение amojo_id аккаунта...');
  const accountInfo = await amoService.getAccountInfo();

  if (!accountInfo) {
    console.error('Ошибка: не удалось получить информацию об аккаунте');
    process.exit(1);
  }

  console.log(`   Аккаунт: ${accountInfo.name} (ID: ${accountInfo.id})`);
  console.log(`   amojo_id: ${accountInfo.amojo_id}`);

  if (!accountInfo.amojo_id) {
    console.error('Ошибка: amojo_id не найден. Убедитесь, что чаты включены в аккаунте.');
    process.exit(1);
  }

  // 3. Подключаем канал
  console.log('\n3. Подключение канала к аккаунту...');

  try {
    const scopeId = await amoChatService.connectAccount(accountInfo.amojo_id);

    console.log('\n=== УСПЕХ! ===');
    console.log(`\nДобавьте в .env:`);
    console.log(`AMO_SCOPE_ID=${scopeId}`);
    console.log(`\nЗатем перезапустите бота: pm2 restart bot-max --update-env`);
  } catch (error) {
    if (error.response?.data) {
      console.error('Ошибка подключения:', error.response.data);
    } else {
      console.error('Ошибка подключения:', error.message);
    }
    process.exit(1);
  }
}

main().catch(console.error);
