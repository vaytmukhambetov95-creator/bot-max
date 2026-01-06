/**
 * Скрипт для переподключения канала amoCRM Chat API
 * Используется для обновления webhook URL после смены домена
 *
 * Запуск: node scripts/reconnect-channel.js
 */

import '../src/config.js';
import amoChatService from '../src/services/amoChatService.js';
import { config } from '../src/config.js';

async function reconnectChannel() {
  console.log('=== Переподключение канала amoCRM Chat API ===\n');

  if (!config.amoAccountId) {
    console.error('Ошибка: AMO_ACCOUNT_ID не настроен в .env');
    process.exit(1);
  }

  console.log('Текущие настройки:');
  console.log(`  AMO_CHANNEL_ID: ${config.amoChannelId}`);
  console.log(`  AMO_ACCOUNT_ID: ${config.amoAccountId}`);
  console.log(`  AMO_SCOPE_ID: ${config.amoScopeId}`);
  console.log(`  WEB_BASE_URL: ${config.webBaseUrl}`);
  console.log('');

  try {
    // Сначала отключаем старый канал
    console.log('1. Отключаем старый канал...');
    try {
      await amoChatService.disconnectAccount();
      console.log('   Старый канал отключен\n');
    } catch (error) {
      console.log(`   Не удалось отключить (возможно уже отключен): ${error.message}\n`);
    }

    // Небольшая задержка
    await new Promise(r => setTimeout(r, 2000));

    // Подключаем заново с новым webhook URL
    console.log('2. Подключаем канал с новым webhook URL...');
    const newScopeId = await amoChatService.connectAccount(config.amoAccountId);

    console.log('\n=== УСПЕХ ===');
    console.log(`Новый scope_id: ${newScopeId}`);

    if (newScopeId !== config.amoScopeId) {
      console.log('\n⚠️  ВАЖНО: scope_id изменился!');
      console.log(`Обновите AMO_SCOPE_ID в .env файле на сервере:`);
      console.log(`AMO_SCOPE_ID=${newScopeId}`);
    }

  } catch (error) {
    console.error('\nОшибка:', error.message);
    if (error.response?.data) {
      console.error('Детали:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

reconnectChannel();
