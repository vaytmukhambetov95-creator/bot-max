import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../../database/analytics.db');

let db = null;

/**
 * Инициализация базы данных
 */
export function initDatabase() {
  db = new Database(dbPath);

  // Создаём таблицы
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      chat_id TEXT UNIQUE,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      messages_count INTEGER DEFAULT 0,
      transferred_to_manager INTEGER DEFAULT 0,
      bot_disabled INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      user_id TEXT,
      chat_id TEXT,
      message_text TEXT,
      is_bot_response INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS product_searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      search_query TEXT,
      products_found INTEGER,
      products_shown TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS search_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT UNIQUE,
      count INTEGER DEFAULT 1,
      last_searched DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS disabled_chats (
      chat_id TEXT PRIMARY KEY,
      disabled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      disabled_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_chat_id ON conversations(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query);
  `);

  console.log('База данных аналитики инициализирована');
}

/**
 * Получить или создать диалог
 */
export function getOrCreateConversation(chatId, userId) {
  let conversation = db.prepare('SELECT * FROM conversations WHERE chat_id = ?').get(chatId);

  if (!conversation) {
    const result = db.prepare(
      'INSERT INTO conversations (chat_id, user_id) VALUES (?, ?)'
    ).run(chatId, userId);

    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
  }

  return conversation;
}

/**
 * Записать сообщение
 */
export function logMessage(chatId, userId, messageText, isBotResponse = false) {
  const conversation = getOrCreateConversation(chatId, userId);

  db.prepare(
    'INSERT INTO messages (conversation_id, user_id, chat_id, message_text, is_bot_response) VALUES (?, ?, ?, ?, ?)'
  ).run(conversation.id, userId, chatId, messageText, isBotResponse ? 1 : 0);

  // Обновляем счётчик сообщений
  db.prepare(
    'UPDATE conversations SET messages_count = messages_count + 1 WHERE id = ?'
  ).run(conversation.id);
}

/**
 * Записать поиск товара
 */
export function logProductSearch(chatId, userId, query, productsFound, productsShown) {
  const conversation = getOrCreateConversation(chatId, userId);

  db.prepare(
    'INSERT INTO product_searches (conversation_id, search_query, products_found, products_shown) VALUES (?, ?, ?, ?)'
  ).run(conversation.id, query, productsFound, JSON.stringify(productsShown));

  // Обновляем общую статистику поиска
  db.prepare(`
    INSERT INTO search_analytics (query, count, last_searched)
    VALUES (?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT(query) DO UPDATE SET
      count = count + 1,
      last_searched = CURRENT_TIMESTAMP
  `).run(query.toLowerCase().trim());
}

/**
 * Пометить диалог как переданный менеджеру
 */
export function markTransferredToManager(chatId) {
  db.prepare(
    'UPDATE conversations SET transferred_to_manager = 1 WHERE chat_id = ?'
  ).run(chatId);
}

/**
 * Отключить бота для чата
 */
export function disableBot(chatId, disabledBy) {
  db.prepare(`
    INSERT OR REPLACE INTO disabled_chats (chat_id, disabled_at, disabled_by)
    VALUES (?, CURRENT_TIMESTAMP, ?)
  `).run(chatId, disabledBy);

  db.prepare(
    'UPDATE conversations SET bot_disabled = 1 WHERE chat_id = ?'
  ).run(chatId);
}

/**
 * Включить бота для чата
 */
export function enableBot(chatId) {
  db.prepare('DELETE FROM disabled_chats WHERE chat_id = ?').run(chatId);

  db.prepare(
    'UPDATE conversations SET bot_disabled = 0 WHERE chat_id = ?'
  ).run(chatId);
}

/**
 * Проверить, отключён ли бот для чата
 */
export function isBotDisabled(chatId) {
  const result = db.prepare('SELECT 1 FROM disabled_chats WHERE chat_id = ?').get(chatId);
  return !!result;
}

/**
 * Получить все активные chat_id для рассылки
 * Исключает чаты, где бот отключён
 * @param {string} excludeChatId - chat_id для исключения (например, чат админа)
 */
export function getAllActiveChatIds(excludeChatId = null) {
  let query = `
    SELECT DISTINCT c.chat_id
    FROM conversations c
    LEFT JOIN disabled_chats d ON c.chat_id = d.chat_id
    WHERE d.chat_id IS NULL
  `;

  const params = [];

  if (excludeChatId) {
    query += ' AND c.chat_id != ?';
    params.push(excludeChatId);
  }

  const rows = db.prepare(query).all(...params);
  return rows.map(row => row.chat_id);
}

/**
 * Получить статистику
 */
export function getStatistics() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  // Общая статистика диалогов
  const totalConversations = db.prepare('SELECT COUNT(*) as count FROM conversations').get().count;

  const todayConversations = db.prepare(
    'SELECT COUNT(*) as count FROM conversations WHERE started_at >= ?'
  ).get(today.toISOString()).count;

  const weekConversations = db.prepare(
    'SELECT COUNT(*) as count FROM conversations WHERE started_at >= ?'
  ).get(weekAgo.toISOString()).count;

  const monthConversations = db.prepare(
    'SELECT COUNT(*) as count FROM conversations WHERE started_at >= ?'
  ).get(monthAgo.toISOString()).count;

  // Переданы менеджерам
  const transferredToManager = db.prepare(
    'SELECT COUNT(*) as count FROM conversations WHERE transferred_to_manager = 1'
  ).get().count;

  // Топ поисковых запросов
  const topSearches = db.prepare(
    'SELECT query, count FROM search_analytics ORDER BY count DESC LIMIT 10'
  ).all();

  // Общее количество сообщений
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;

  return {
    conversations: {
      total: totalConversations,
      today: todayConversations,
      week: weekConversations,
      month: monthConversations,
      transferredToManager
    },
    messages: {
      total: totalMessages
    },
    topSearches
  };
}

/**
 * Форматирование статистики для отправки
 */
export function formatStatistics() {
  const stats = getStatistics();

  let text = `Статистика бота Orange\n\n`;

  text += `Диалогов:\n`;
  text += `- Сегодня: ${stats.conversations.today}\n`;
  text += `- За неделю: ${stats.conversations.week}\n`;
  text += `- За месяц: ${stats.conversations.month}\n`;
  text += `- Всего: ${stats.conversations.total}\n\n`;

  text += `Передано менеджерам: ${stats.conversations.transferredToManager}\n`;
  text += `Всего сообщений: ${stats.messages.total}\n\n`;

  if (stats.topSearches.length > 0) {
    text += `Топ запросов:\n`;
    stats.topSearches.forEach((s, i) => {
      text += `${i + 1}. "${s.query}" (${s.count})\n`;
    });
  }

  return text;
}
