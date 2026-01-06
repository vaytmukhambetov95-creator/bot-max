/**
 * Обработчик webhook смены статуса сделки amoCRM
 * При переходе сделки в статус "Новая заявка" генерирует ссылку на форму заказа
 */

import { config } from '../config.js';
import { generateLeadOrderUrl } from '../utils/orderToken.js';
import amoService from '../services/amoService.js';

/**
 * Middleware для проверки подлинности webhook
 */
export function verifyLeadWebhook(req, res, next) {
  // Проверка секрета в query параметре
  const secret = req.query.secret;

  if (config.amoWebhookSecret && secret !== config.amoWebhookSecret) {
    console.warn('amoCRM Lead Webhook: Неверный секрет');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * Основной обработчик webhook смены статуса сделки
 */
export async function handleLeadStatusWebhook(req, res) {
  console.log('=== amoCRM Lead Status Webhook ===');
  console.log('Body:', JSON.stringify(req.body, null, 2));

  try {
    const leads = req.body.leads;

    if (!leads) {
      console.log('amoCRM Webhook: Нет данных о сделках');
      return res.status(200).json({ ok: true, message: 'No leads data' });
    }

    // amoCRM может отправить update или status события
    const updatedLeads = leads.update || leads.status || leads.add || [];

    for (const lead of updatedLeads) {
      const leadId = parseInt(lead.id);
      const statusId = parseInt(lead.status_id);
      const pipelineId = parseInt(lead.pipeline_id);

      console.log(`amoCRM Webhook: Сделка #${leadId}, status=${statusId}, pipeline=${pipelineId}`);

      // Проверяем что это нужный статус и воронка
      if (statusId === config.amoTargetStatusId && pipelineId === config.amoTargetPipelineId) {
        console.log(`amoCRM: Сделка #${leadId} перешла в статус "Новая заявка"`);

        // Генерируем ссылку на форму
        const orderFormUrl = generateLeadOrderUrl(leadId);
        console.log(`amoCRM: Сгенерирована ссылка: ${orderFormUrl}`);

        // Записываем ссылку в поле сделки
        try {
          await amoService.updateLead(leadId, [{
            field_id: config.amoOrderFormLinkFieldId,
            values: [{ value: orderFormUrl }]
          }]);
          console.log(`amoCRM: Ссылка записана в сделку #${leadId}`);
        } catch (updateError) {
          console.error(`amoCRM: Ошибка записи ссылки в сделку #${leadId}:`, updateError.message);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('amoCRM Lead Webhook Error:', error);
    // Возвращаем 200 чтобы amoCRM не повторяла запрос
    res.status(200).json({ ok: false, error: error.message });
  }
}

export default {
  verifyLeadWebhook,
  handleLeadStatusWebhook
};
