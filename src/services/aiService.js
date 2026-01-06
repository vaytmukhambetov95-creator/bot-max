import axios from 'axios';
import { config } from '../config.js';
import { generateShopContext } from '../data/shop-info.js';

// Хранилище истории диалогов (в памяти, можно расширить до БД)
const conversationHistory = new Map();

// Системный промпт для нейроквалификатора
const SYSTEM_PROMPT = `Ты — консультант цветочного магазина Orange в Самаре. Твоя задача:
1. Приветствовать клиентов и выяснять их запросы
2. Отвечать на вопросы о магазине, доставке, оплате
3. Помогать с выбором букетов, предлагая посмотреть каталог
4. Быть вежливым, дружелюбным, но лаконичным

ВАЖНЫЕ ОГРАНИЧЕНИЯ:
- НЕ отвечай на вопросы о НАЛИЧИИ конкретных товаров (есть ли красные розы, есть ли гортензии и т.д.)
- Если клиент спрашивает о наличии — скажи что уточнишь у менеджера
- НЕ выдумывай информацию о товарах, ценах, которых нет в контексте
- Если не знаешь ответ — честно скажи что передашь вопрос менеджеру

КОГДА ПЕРЕДАВАТЬ МЕНЕДЖЕРУ:
- Вопросы о наличии конкретных товаров
- Сложные индивидуальные заказы
- Жалобы и претензии
- Вопросы, на которые ты не знаешь ответа

СТИЛЬ ОБЩЕНИЯ:
- Короткие, понятные ответы (2-4 предложения максимум)
- Без излишних эмодзи (максимум 1-2 уместных)
- Деловой, но дружелюбный тон

${generateShopContext()}`;

/**
 * Получить ответ от ИИ
 * @param {string} chatId - ID чата
 * @param {string} userMessage - Сообщение пользователя
 * @returns {Promise<{response: string, needsManager: boolean}>}
 */
export async function getAIResponse(chatId, userMessage) {
  // Получаем или создаём историю диалога
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }

  const history = conversationHistory.get(chatId);

  // Добавляем сообщение пользователя в историю
  history.push({ role: 'user', content: userMessage });

  // Ограничиваем историю последними 10 сообщениями
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  try {
    const response = await axios.post(
      `${config.openRouterBaseUrl}/chat/completions`,
      {
        model: config.openRouterModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history
        ],
        max_tokens: 500,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://orangesmr.ru',
          'X-Title': 'Orange Bot'
        }
      }
    );

    const aiMessage = response.data.choices[0]?.message?.content || '';

    // Добавляем ответ ИИ в историю
    history.push({ role: 'assistant', content: aiMessage });

    // Проверяем, нужен ли менеджер
    const needsManager = checkIfNeedsManager(userMessage, aiMessage);

    return {
      response: aiMessage,
      needsManager
    };
  } catch (error) {
    console.error('Ошибка OpenRouter API:', error.response?.data || error.message);

    return {
      response: 'Извините, произошла техническая ошибка. Сейчас подключу менеджера для помощи.',
      needsManager: true
    };
  }
}

/**
 * Проверка, нужен ли менеджер
 */
function checkIfNeedsManager(userMessage, aiResponse) {
  const userLower = userMessage.toLowerCase();
  const aiLower = aiResponse.toLowerCase();

  // Ключевые слова, указывающие на необходимость менеджера
  const managerTriggers = [
    'в наличии', 'есть ли', 'имеется', 'остались',
    'жалоба', 'претензия', 'возврат', 'обмен',
    'менеджер', 'оператор', 'человек'
  ];

  // Проверяем сообщение пользователя
  for (const trigger of managerTriggers) {
    if (userLower.includes(trigger)) {
      return true;
    }
  }

  // Проверяем, упоминает ли ИИ менеджера в своём ответе
  if (aiLower.includes('менеджер') || aiLower.includes('уточн')) {
    return true;
  }

  return false;
}

/**
 * Очистить историю диалога
 */
export function clearHistory(chatId) {
  conversationHistory.delete(chatId);
}

/**
 * Получить приветственное сообщение
 */
export function getGreeting() {
  return `Здравствуйте! Я консультант магазина Orange.

Чем могу помочь? Могу подобрать букет, рассказать о доставке или ответить на вопросы.`;
}
