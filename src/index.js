import { initBot, startBot, stopBot } from './bot.js';
import { startWebServer } from './web/server.js';

console.log('=================================');
console.log('  Бот Orange для MAX Messenger  ');
console.log('=================================');
console.log('');

async function main() {
  try {
    // Запускаем веб-сервер для формы заказа
    await startWebServer();

    // Инициализируем бота
    await initBot();

    // Запускаем long polling
    await startBot();
  } catch (error) {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  }
}

// Обработка graceful shutdown
process.on('SIGINT', () => {
  console.log('\nПолучен сигнал SIGINT. Завершение работы...');
  stopBot();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nПолучен сигнал SIGTERM. Завершение работы...');
  stopBot();
  process.exit(0);
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное отклонение промиса:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Необработанное исключение:', error);
  process.exit(1);
});

// Запуск
main();
