/**
 * Клиентская логика формы заказа
 */

document.addEventListener('DOMContentLoaded', function() {
  // Получаем токен из URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('t');

  if (!token) {
    window.location.href = '/expired.html';
    return;
  }

  // Устанавливаем токен в скрытое поле
  document.getElementById('token-input').value = token;

  // Инициализация компонентов
  initOrderTypeSwitch();
  initDatePicker();
  initAddressAutocomplete();
  initAskRecipientAddress();
  initCustomerIsRecipient();
  initFormSubmit();
  initPhoneMask();
});


/**
 * Переключение между доставкой и самовывозом
 */
function initOrderTypeSwitch() {
  const orderTypeRadios = document.querySelectorAll('input[name="orderType"]');

  // Элементы для переключения
  const deliverySectionTitle = document.getElementById('delivery-section-title');
  const dateLabel = document.getElementById('date-label');
  const timeLabel = document.getElementById('time-label');
  const addressGroup = document.getElementById('address-group');
  const branchGroup = document.getElementById('branch-group');
  const recipientSection = document.getElementById('recipient-section');
  const askRecipientLabel = document.getElementById('ask-recipient-label');

  // Поля ввода
  const addressInput = document.getElementById('address');
  const branchSelect = document.getElementById('branch');
  const askRecipientCheckbox = document.getElementById('ask-recipient-address');
  const recipientNameInput = document.getElementById('recipientName');
  const recipientPhoneInput = document.getElementById('recipientPhone');

  function switchOrderType(type) {
    const isDelivery = type === 'delivery';

    // Обновляем заголовок секции
    if (deliverySectionTitle) {
      deliverySectionTitle.textContent = isDelivery ? 'Доставка' : 'Самовывоз';
    }

    // Обновляем лейбл даты
    if (dateLabel) {
      dateLabel.innerHTML = isDelivery
        ? 'Дата доставки <span class="required">*</span>'
        : 'Дата самовывоза <span class="required">*</span>';
    }

    // Обновляем лейбл времени
    if (timeLabel) {
      timeLabel.innerHTML = isDelivery
        ? 'Время доставки <span class="required">*</span>'
        : 'Время самовывоза <span class="required">*</span>';
    }

    // Переключаем адрес (доставка) / филиал (самовывоз)
    if (addressGroup) {
      addressGroup.style.display = isDelivery ? 'block' : 'none';

      // Сбрасываем чекбокс
      if (askRecipientCheckbox) {
        askRecipientCheckbox.checked = false;
      }

      if (addressInput) {
        if (isDelivery) {
          // Для доставки: включаем поле адреса
          addressInput.disabled = false;
          addressInput.placeholder = 'Начните вводить адрес...';
        } else {
          // Для самовывоза: отключаем и очищаем
          addressInput.disabled = true;
          addressInput.value = '';
        }
      }

      const addressRequired = document.getElementById('address-required');
      if (addressRequired) {
        addressRequired.style.display = isDelivery ? 'inline' : 'none';
      }
    }

    if (branchGroup) {
      branchGroup.style.display = isDelivery ? 'none' : 'block';
      if (branchSelect) {
        if (isDelivery) {
          branchSelect.selectedIndex = 0;
        }
      }
    }

    // Переключаем секцию получателя
    if (recipientSection) {
      recipientSection.style.display = isDelivery ? 'block' : 'none';
      if (recipientNameInput) {
        recipientNameInput.required = false; // Поля больше не обязательны
      }
      if (recipientPhoneInput) {
        recipientPhoneInput.required = false; // Поля больше не обязательны
      }
    }

    // Скрываем чекбокс "Заказчик = получатель" при самовывозе
    const customerIsRecipientLabel = document.getElementById('customer-is-recipient-label');
    const customerIsRecipientCheckbox = document.getElementById('customer-is-recipient');
    if (customerIsRecipientLabel) {
      customerIsRecipientLabel.style.display = isDelivery ? 'flex' : 'none';
    }
    if (customerIsRecipientCheckbox && !isDelivery) {
      customerIsRecipientCheckbox.checked = false;
      // Разблокируем поля получателя
      if (recipientNameInput) recipientNameInput.disabled = false;
      if (recipientPhoneInput) recipientPhoneInput.disabled = false;
    }
  }

  // Добавляем обработчики
  orderTypeRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      switchOrderType(this.value);
    });
  });

  // Инициализация с выбранным значением (по умолчанию доставка)
  const checkedRadio = document.querySelector('input[name="orderType"]:checked');
  if (checkedRadio) {
    switchOrderType(checkedRadio.value);
  }
}


/**
 * Календарь для выбора даты доставки
 */
function initDatePicker() {
  const dateInput = document.getElementById('date');
  const calendar = document.getElementById('calendar');
  const calendarDays = document.getElementById('calendar-days');
  const monthYearLabel = document.getElementById('calendar-month-year');
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');

  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const monthsGenitive = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];

  let currentDate = new Date();
  let selectedDate = null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Показать/скрыть календарь
  dateInput.addEventListener('click', function(e) {
    e.stopPropagation();
    calendar.classList.toggle('active');
    if (calendar.classList.contains('active')) {
      renderCalendar();
    }
  });

  // Скрыть при клике вне
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.date-picker-wrapper')) {
      calendar.classList.remove('active');
    }
  });

  // Навигация по месяцам
  prevBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  // Отрисовка календаря
  function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Заголовок
    monthYearLabel.textContent = `${months[month]} ${year}`;

    // Блокировка кнопки "назад" если текущий месяц
    const todayMonth = today.getFullYear() * 12 + today.getMonth();
    const currentMonth = year * 12 + month;
    prevBtn.disabled = currentMonth <= todayMonth;

    // Первый день месяца
    const firstDay = new Date(year, month, 1);
    // День недели первого дня (0 = Вс, переводим в Пн = 0)
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;

    // Количество дней в месяце
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Количество дней в предыдущем месяце
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    calendarDays.innerHTML = '';

    // Дни предыдущего месяца
    for (let i = startDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const btn = createDayButton(day, 'other-month disabled');
      calendarDays.appendChild(btn);
    }

    // Дни текущего месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      date.setHours(0, 0, 0, 0);

      let classes = '';

      // Прошедшие дни
      if (date < today) {
        classes = 'disabled';
      }

      // Сегодня
      if (date.getTime() === today.getTime()) {
        classes += ' today';
      }

      // Выбранная дата
      if (selectedDate && date.getTime() === selectedDate.getTime()) {
        classes += ' selected';
      }

      const btn = createDayButton(day, classes, date);
      calendarDays.appendChild(btn);
    }

    // Дни следующего месяца (заполняем до 42 дней = 6 недель)
    const totalDays = calendarDays.children.length;
    const remaining = 42 - totalDays;
    for (let day = 1; day <= remaining; day++) {
      const btn = createDayButton(day, 'other-month disabled');
      calendarDays.appendChild(btn);
    }
  }

  // Создание кнопки дня
  function createDayButton(day, classes, date) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `calendar-day ${classes}`;
    btn.textContent = day;

    if (date && !classes.includes('disabled')) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        selectDate(date);
      });
    }

    return btn;
  }

  // Выбор даты
  function selectDate(date) {
    selectedDate = date;

    // Форматируем дату: "15.01.2025"
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    dateInput.value = `${day}.${month}.${year}`;

    calendar.classList.remove('active');
    renderCalendar();

    // Обновляем доступные временные слоты
    updateTimeSlots(date);
  }
}


/**
 * Обновление временных слотов в зависимости от выбранной даты
 */
function updateTimeSlots(selectedDate) {
  const timeSelect = document.getElementById('time');
  const allSlots = [
    '08:00 - 09:00',
    '09:00 - 10:00',
    '10:00 - 11:00',
    '11:00 - 12:00',
    '12:00 - 13:00',
    '13:00 - 14:00',
    '14:00 - 15:00',
    '15:00 - 16:00',
    '16:00 - 17:00',
    '17:00 - 18:00',
    '18:00 - 19:00',
    '19:00 - 20:00',
    '20:00 - 21:00',
    '21:00 - 22:00',
    '22:00 - 23:00',
    '23:00 - 00:00',
    '00:00 - 01:00'
  ];

  // Проверяем, является ли выбранная дата 31 декабря
  const isNewYearsEve = selectedDate.getDate() === 31 && selectedDate.getMonth() === 11;

  // Фильтруем слоты для 31 декабря (только до 18:00-19:00)
  const availableSlots = isNewYearsEve
    ? allSlots.filter(slot => {
        const startHour = parseInt(slot.split(':')[0], 10);
        return startHour <= 18; // 18:00 - 19:00 включительно
      })
    : allSlots;

  // Сохраняем текущий выбор
  const currentValue = timeSelect.value;

  // Очищаем и заполняем заново
  timeSelect.innerHTML = '<option value="" disabled selected>Выберите интервал</option>';

  availableSlots.forEach(slot => {
    const option = document.createElement('option');
    option.value = slot;
    option.textContent = slot;
    timeSelect.appendChild(option);
  });

  // Восстанавливаем выбор, если он доступен
  if (availableSlots.includes(currentValue)) {
    timeSelect.value = currentValue;
  }
}


/**
 * Автодополнение адреса через DaData
 */
function initAddressAutocomplete() {
  const addressInput = document.getElementById('address');
  const suggestionsList = document.getElementById('address-suggestions');
  let debounceTimer = null;
  let activeSuggestionIndex = -1;

  // Ввод адреса
  addressInput.addEventListener('input', function() {
    const query = this.value.trim();

    clearTimeout(debounceTimer);

    if (query.length < 3) {
      hideSuggestions();
      return;
    }

    debounceTimer = setTimeout(() => {
      fetchSuggestions(query);
    }, 300);
  });

  // Клавиатурная навигация
  addressInput.addEventListener('keydown', function(e) {
    const items = suggestionsList.querySelectorAll('li');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
      updateActiveSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
      updateActiveSuggestion(items);
    } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(items[activeSuggestionIndex].dataset.value);
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  // Скрытие при клике вне
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.autocomplete-wrapper')) {
      hideSuggestions();
    }
  });

  // Запрос подсказок
  async function fetchSuggestions(query) {
    try {
      const response = await fetch(`/api/address-suggest?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.suggestions && data.suggestions.length > 0) {
        showSuggestions(data.suggestions);
      } else {
        hideSuggestions();
      }
    } catch (error) {
      console.error('Ошибка получения подсказок:', error);
      hideSuggestions();
    }
  }

  // Показать подсказки
  function showSuggestions(suggestions) {
    suggestionsList.innerHTML = '';
    activeSuggestionIndex = -1;

    suggestions.forEach((suggestion, index) => {
      const li = document.createElement('li');
      li.textContent = suggestion.value;
      li.dataset.value = suggestion.value;
      li.addEventListener('click', () => selectSuggestion(suggestion.value));
      suggestionsList.appendChild(li);
    });

    suggestionsList.classList.add('active');
  }

  // Скрыть подсказки
  function hideSuggestions() {
    suggestionsList.classList.remove('active');
    suggestionsList.innerHTML = '';
    activeSuggestionIndex = -1;
  }

  // Выбрать подсказку
  function selectSuggestion(value) {
    addressInput.value = value;
    hideSuggestions();
  }

  // Обновить активную подсказку
  function updateActiveSuggestion(items) {
    items.forEach((item, index) => {
      item.classList.toggle('active', index === activeSuggestionIndex);
    });

    if (activeSuggestionIndex >= 0) {
      items[activeSuggestionIndex].scrollIntoView({ block: 'nearest' });
    }
  }
}

/**
 * Чекбокс "Узнать адрес у получателя"
 */
function initAskRecipientAddress() {
  const checkbox = document.getElementById('ask-recipient-address');
  const addressInput = document.getElementById('address');
  const addressRequired = document.getElementById('address-required');

  checkbox.addEventListener('change', function() {
    if (this.checked) {
      addressInput.disabled = true;
      addressInput.value = '';
      addressInput.placeholder = 'Адрес будет уточнён у получателя';
      addressRequired.style.display = 'none';
    } else {
      addressInput.disabled = false;
      addressInput.placeholder = 'Начните вводить адрес...';
      addressRequired.style.display = 'inline';
    }
  });
}

/**
 * Чекбокс "Заказчик является получателем"
 */
function initCustomerIsRecipient() {
  const checkbox = document.getElementById('customer-is-recipient');
  const yourName = document.getElementById('yourName');
  const yourPhone = document.getElementById('yourPhone');
  const recipientName = document.getElementById('recipientName');
  const recipientPhone = document.getElementById('recipientPhone');

  function syncData() {
    if (checkbox.checked) {
      recipientName.value = yourName.value;
      recipientPhone.value = yourPhone.value;
    }
  }

  checkbox.addEventListener('change', function() {
    if (this.checked) {
      // Копируем данные и блокируем поля
      syncData();
      recipientName.disabled = true;
      recipientPhone.disabled = true;
    } else {
      // Очищаем и разблокируем
      recipientName.value = '';
      recipientPhone.value = '+7';
      recipientName.disabled = false;
      recipientPhone.disabled = false;
    }
  });

  // Синхронизация при изменении данных заказчика
  yourName.addEventListener('input', syncData);
  yourPhone.addEventListener('input', syncData);
}

/**
 * Простая маска для телефона
 */
function initPhoneMask() {
  const phoneInputs = document.querySelectorAll('input[type="tel"]');

  phoneInputs.forEach(input => {
    // Фокус - ставим курсор в конец
    input.addEventListener('focus', function() {
      if (this.value === '+7') {
        setTimeout(() => {
          this.setSelectionRange(this.value.length, this.value.length);
        }, 0);
      }
    });

    input.addEventListener('input', function() {
      // Убираем всё кроме цифр и +
      let value = this.value.replace(/[^\d+]/g, '');

      // Всегда начинаем с +7
      if (!value.startsWith('+7')) {
        // Убираем все + и 7/8 в начале
        value = value.replace(/^\+*[78]?/, '');
        value = '+7' + value;
      }

      // Ограничиваем длину (+7 + 10 цифр = 12 символов)
      if (value.length > 12) {
        value = value.slice(0, 12);
      }

      this.value = value;
    });

    // Не даём удалить +7
    input.addEventListener('keydown', function(e) {
      if ((e.key === 'Backspace' || e.key === 'Delete') && this.value.length <= 2) {
        e.preventDefault();
      }
    });
  });
}

/**
 * Отправка формы
 */
function initFormSubmit() {
  const form = document.getElementById('order-form');
  const submitBtn = document.getElementById('submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoader = submitBtn.querySelector('.btn-loader');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log('Form submit triggered');

    // Валидация
    if (!validateForm()) {
      console.log('Validation failed');
      return;
    }
    console.log('Validation passed');

    // Показываем загрузку
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';

    try {
      // Собираем данные
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      // Тип заказа
      data.orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'delivery';

      // Чекбокс
      data.askRecipientAddress = formData.has('askRecipientAddress');

      // Отправляем
      const response = await fetch('/api/order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        showSuccessModal();
      } else {
        showErrorModal(result.error || 'Произошла ошибка');
      }
    } catch (error) {
      console.error('Ошибка отправки:', error);
      showErrorModal('Не удалось отправить заказ. Проверьте интернет-соединение.');
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'block';
      btnLoader.style.display = 'none';
    }
  });
}

/**
 * Валидация формы
 */
function validateForm() {
  const form = document.getElementById('order-form');
  const orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'delivery';
  console.log('validateForm: orderType =', orderType);

  // Проверка общих обязательных полей
  const date = document.getElementById('date').value.trim();
  const time = document.getElementById('time').value;
  const yourName = document.getElementById('yourName').value.trim();
  const yourPhone = document.getElementById('yourPhone').value.trim();

  if (!date) {
    showErrorModal('Выберите дату');
    return false;
  }

  if (!time) {
    showErrorModal('Выберите время');
    return false;
  }

  if (!yourName) {
    showErrorModal('Укажите ваше имя');
    return false;
  }

  if (!yourPhone || yourPhone === '+7') {
    showErrorModal('Укажите ваш телефон');
    return false;
  }

  if (orderType === 'delivery') {
    // Валидация для доставки
    const askRecipient = document.getElementById('ask-recipient-address').checked;
    const address = document.getElementById('address').value.trim();
    const recipientName = document.getElementById('recipientName').value.trim();
    const recipientPhone = document.getElementById('recipientPhone').value.trim();

    console.log('validateForm: askRecipient =', askRecipient, ', address =', address);

    if (!askRecipient && !address) {
      showErrorModal('Укажите адрес доставки или выберите "Узнать адрес у получателя"');
      return false;
    }
    // Поля получателя необязательны
  } else {
    // Валидация для самовывоза
    const branch = document.getElementById('branch').value;
    console.log('validateForm: branch =', branch);
    if (!branch) {
      showErrorModal('Выберите филиал для самовывоза');
      return false;
    }
  }

  // Проверка согласия на обработку данных
  const privacyConsent = document.getElementById('privacy-consent').checked;
  if (!privacyConsent) {
    showErrorModal('Необходимо согласие на обработку персональных данных');
    return false;
  }

  console.log('validateForm: all passed');
  return true;
}

/**
 * Показать модальное окно успеха
 */
function showSuccessModal() {
  document.getElementById('success-modal').style.display = 'flex';
}

/**
 * Показать модальное окно ошибки
 */
function showErrorModal(message) {
  document.getElementById('error-message').textContent = message;
  document.getElementById('error-modal').style.display = 'flex';
}

/**
 * Закрыть модальное окно ошибки
 */
function closeErrorModal() {
  document.getElementById('error-modal').style.display = 'none';
}
