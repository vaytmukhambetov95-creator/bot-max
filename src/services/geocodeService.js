/**
 * Сервис геокодирования и определения филиала по адресу
 * Использует Яндекс Геокодер API и полигоны зон доставки
 */

import { config } from '../config.js';

// ============================================
// ЗОНЫ ДОСТАВКИ (полигоны координат)
// ============================================

const DELIVERY_ZONES = {
  'волгарь': [
    { lat: 53.210638, lng: 50.116733 },
    { lat: 53.199608, lng: 50.130994 },
    { lat: 53.199893, lng: 50.131768 },
    { lat: 53.191756, lng: 50.142221 },
    { lat: 53.185773, lng: 50.146686 },
    { lat: 53.180631, lng: 50.158019 },
    { lat: 53.170265, lng: 50.148065 },
    { lat: 53.167572, lng: 50.199779 },
    { lat: 53.124124, lng: 50.201410 },
    { lat: 53.089610, lng: 50.175535 },
    { lat: 53.088532, lng: 50.154286 },
    { lat: 53.097931, lng: 50.072598 },
    { lat: 53.095119, lng: 50.027259 },
    { lat: 53.097196, lng: 50.021798 },
    { lat: 53.103339, lng: 50.030215 },
    { lat: 53.128907, lng: 50.015585 },
    { lat: 53.133776, lng: 50.001750 },
    { lat: 53.124374, lng: 49.974612 },
    { lat: 53.125592, lng: 49.962977 },
    { lat: 53.134398, lng: 49.966374 },
    { lat: 53.142628, lng: 49.985087 },
    { lat: 53.146349, lng: 49.981268 },
    { lat: 53.153985, lng: 49.978937 },
    { lat: 53.210785, lng: 50.116563 }
  ],
  'гагарина': [
    { lat: 53.281805, lng: 50.187939 },
    { lat: 53.269917, lng: 50.221532 },
    { lat: 53.263032, lng: 50.235203 },
    { lat: 53.257053, lng: 50.245683 },
    { lat: 53.250493, lng: 50.247636 },
    { lat: 53.244821, lng: 50.251465 },
    { lat: 53.224682, lng: 50.280117 },
    { lat: 53.223210, lng: 50.289050 },
    { lat: 53.220373, lng: 50.288809 },
    { lat: 53.201078, lng: 50.312149 },
    { lat: 53.187555, lng: 50.281952 },
    { lat: 53.168020, lng: 50.195796 },
    { lat: 53.172657, lng: 50.150414 },
    { lat: 53.180983, lng: 50.157836 },
    { lat: 53.185694, lng: 50.146954 },
    { lat: 53.192065, lng: 50.141979 },
    { lat: 53.199927, lng: 50.131908 },
    { lat: 53.199717, lng: 50.130926 },
    { lat: 53.211995, lng: 50.115185 },
    { lat: 53.281838, lng: 50.187805 }
  ],
  'офис': [
    { lat: 53.220567, lng: 50.289242 },
    { lat: 53.253195, lng: 50.367179 },
    { lat: 53.267538, lng: 50.333363 },
    { lat: 53.291595, lng: 50.333352 },
    { lat: 53.288164, lng: 50.352716 },
    { lat: 53.283958, lng: 50.352766 },
    { lat: 53.285163, lng: 50.375691 },
    { lat: 53.289384, lng: 50.390165 },
    { lat: 53.283208, lng: 50.402263 },
    { lat: 53.284495, lng: 50.459341 },
    { lat: 53.252900, lng: 50.475719 },
    { lat: 53.233407, lng: 50.487450 },
    { lat: 53.181351, lng: 50.335931 },
    { lat: 53.220420, lng: 50.289410 }
  ],
  'новая самара': [
    { lat: 53.372307, lng: 50.176981 },
    { lat: 53.376795, lng: 50.182747 },
    { lat: 53.376783, lng: 50.188482 },
    { lat: 53.370222, lng: 50.196998 },
    { lat: 53.366867, lng: 50.212789 },
    { lat: 53.360664, lng: 50.218781 },
    { lat: 53.356225, lng: 50.230003 },
    { lat: 53.353185, lng: 50.228899 },
    { lat: 53.349226, lng: 50.233231 },
    { lat: 53.344928, lng: 50.264629 },
    { lat: 53.348226, lng: 50.286181 },
    { lat: 53.344696, lng: 50.293054 },
    { lat: 53.345119, lng: 50.303940 },
    { lat: 53.349491, lng: 50.315491 },
    { lat: 53.360619, lng: 50.315908 },
    { lat: 53.352477, lng: 50.327423 },
    { lat: 53.356408, lng: 50.327264 },
    { lat: 53.354803, lng: 50.336386 },
    { lat: 53.357984, lng: 50.339048 },
    { lat: 53.358570, lng: 50.342615 },
    { lat: 53.356305, lng: 50.345074 },
    { lat: 53.358269, lng: 50.352176 },
    { lat: 53.339987, lng: 50.355334 },
    { lat: 53.340443, lng: 50.365928 },
    { lat: 53.338755, lng: 50.369129 },
    { lat: 53.332715, lng: 50.361703 },
    { lat: 53.325456, lng: 50.378079 },
    { lat: 53.320014, lng: 50.370292 },
    { lat: 53.318814, lng: 50.345386 },
    { lat: 53.312589, lng: 50.345386 },
    { lat: 53.308468, lng: 50.357357 },
    { lat: 53.303124, lng: 50.359161 },
    { lat: 53.302296, lng: 50.375472 },
    { lat: 53.288767, lng: 50.384052 },
    { lat: 53.284372, lng: 50.353186 },
    { lat: 53.288028, lng: 50.353720 },
    { lat: 53.291126, lng: 50.345474 },
    { lat: 53.292072, lng: 50.333523 },
    { lat: 53.268084, lng: 50.333122 },
    { lat: 53.253211, lng: 50.366790 },
    { lat: 53.220462, lng: 50.288576 },
    { lat: 53.223157, lng: 50.289251 },
    { lat: 53.224532, lng: 50.285277 },
    { lat: 53.224831, lng: 50.280203 },
    { lat: 53.231092, lng: 50.270885 },
    { lat: 53.244988, lng: 50.251701 },
    { lat: 53.250634, lng: 50.247459 },
    { lat: 53.257386, lng: 50.246271 },
    { lat: 53.269815, lng: 50.221880 },
    { lat: 53.282085, lng: 50.187943 },
    { lat: 53.306696, lng: 50.194171 },
    { lat: 53.306750, lng: 50.195355 },
    { lat: 53.343850, lng: 50.194028 },
    { lat: 53.361757, lng: 50.186755 },
    { lat: 53.372082, lng: 50.177111 }
  ]
};

// ============================================
// МАППИНГ ЗОН → ФИЛИАЛЫ (enum_id в amoCRM)
// ============================================

const ZONE_TO_BRANCH = {
  'волгарь': 1783965,      // Волгарь
  'гагарина': 1783963,     // Гагарина 98
  'офис': 1783963,         // Офис → Гагарина 98
  'новая самара': 1804061  // Новая Самара
};


// ============================================
// ГЕОКОДИРОВАНИЕ
// ============================================

/**
 * Геокодирует адрес через Яндекс API
 * @returns {Object|null} { lat, lng } или null если не удалось
 */
async function geocodeAddress(address) {
  const apiKey = config.yandexGeocoderApiKey;

  if (!apiKey) {
    console.error('[Geocode] API ключ Яндекс Геокодера не настроен');
    return null;
  }

  // Адрес передаётся как есть от DaData (уже содержит "г Самара")
  const url = new URL('https://geocode-maps.yandex.ru/1.x/');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('geocode', address);
  url.searchParams.set('format', 'json');
  url.searchParams.set('lang', 'ru_RU');
  url.searchParams.set('results', '1');

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    const geoObject = data.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;

    if (!geoObject || !geoObject.Point || !geoObject.Point.pos) {
      console.log(`[Geocode] Адрес не найден: ${address}`);
      return null;
    }

    // Проверяем точность геокодирования
    const precision = geoObject.metaDataProperty?.GeocoderMetaData?.precision;
    const validPrecisions = ['exact', 'number', 'near', 'range'];

    if (!validPrecisions.includes(precision)) {
      console.log(`[Geocode] Низкая точность (${precision}) для адреса: ${address}`);
      return null;
    }

    // Извлекаем координаты (формат: "lng lat")
    const coords = geoObject.Point.pos.split(' ');
    const lng = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);

    console.log(`[Geocode] ${address} → ${lat}, ${lng} (precision: ${precision})`);

    return { lat, lng };
  } catch (error) {
    console.error(`[Geocode] Ошибка геокодирования: ${error.message}`);
    return null;
  }
}

// ============================================
// POINT-IN-POLYGON
// ============================================

/**
 * Проверяет находится ли точка внутри полигона
 * Алгоритм ray-casting
 */
function pointInPolygon(point, polygon) {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

    if (intersect) inside = !inside;
  }

  return inside;
}

// ============================================
// ОПРЕДЕЛЕНИЕ ЗОНЫ
// ============================================

/**
 * Определяет зону доставки по координатам
 * @returns {string|null} Название зоны или null
 */
function detectZone(lat, lng) {
  const point = { lat, lng };

  for (const [zoneName, polygon] of Object.entries(DELIVERY_ZONES)) {
    if (pointInPolygon(point, polygon)) {
      return zoneName;
    }
  }

  return null;
}

// ============================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================

/**
 * Определяет филиал по адресу
 * @param {string} address - Адрес доставки
 * @returns {Promise<number|null>} enum_id филиала или null
 */
async function detectBranch(address) {
  if (!address || address === 'Узнать у получателя') {
    return null;
  }

  try {
    console.log(`[Geocode] Адрес: "${address}"`);

    // 1. Геокодируем (адрес передаётся как есть от DaData)
    const coords = await geocodeAddress(address);

    if (!coords) {
      return null;
    }

    // 2. Определяем зону
    const zone = detectZone(coords.lat, coords.lng);

    if (!zone) {
      console.log(`[Geocode] Адрес вне зон доставки: ${address}`);
      return null;
    }

    // 3. Получаем enum_id филиала
    const branchEnumId = ZONE_TO_BRANCH[zone];
    console.log(`[Geocode] Зона: ${zone} → Филиал enum_id: ${branchEnumId}`);

    return branchEnumId;
  } catch (error) {
    console.error(`[Geocode] Ошибка определения филиала: ${error.message}`);
    return null;
  }
}

export {
  detectBranch,
  geocodeAddress,
  detectZone,
  ZONE_TO_BRANCH
};
