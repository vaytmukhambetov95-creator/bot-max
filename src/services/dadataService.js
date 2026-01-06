/**
 * Сервис для работы с DaData Suggestions API
 * Автодополнение адресов
 */

import axios from 'axios';
import { config } from '../config.js';

const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

/**
 * Получить подсказки адресов
 * @param {string} query - Начало адреса
 * @param {number} count - Количество подсказок (по умолчанию 5)
 * @returns {Promise<Array>} Массив подсказок
 */
export async function suggestAddress(query, count = 5) {
  if (!config.dadataApiKey) {
    console.warn('DADATA_API_KEY не настроен. Автодополнение адресов отключено.');
    return [];
  }

  if (!query || query.length < 3) {
    return [];
  }

  try {
    const response = await axios.post(
      DADATA_URL,
      {
        query: query,
        count: count,
        locations: [{ country: 'Россия' }] // Только российские адреса
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Token ${config.dadataApiKey}`
        },
        timeout: 5000
      }
    );

    if (response.data && response.data.suggestions) {
      return response.data.suggestions.map(s => ({
        value: s.value,
        unrestricted_value: s.unrestricted_value,
        data: {
          city: s.data.city,
          street: s.data.street,
          house: s.data.house,
          flat: s.data.flat,
          postal_code: s.data.postal_code,
          geo_lat: s.data.geo_lat,
          geo_lon: s.data.geo_lon
        }
      }));
    }

    return [];
  } catch (error) {
    console.error('Ошибка DaData API:', error.message);
    return [];
  }
}

export default {
  suggestAddress
};
