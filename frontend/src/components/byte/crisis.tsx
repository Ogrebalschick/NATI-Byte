import { Message } from './byte';

// Список ключевых слов (для быстрой проверки на клиенте)
export const crisisKeywords = [
  'самоубийство', 'суицид', 'покончить с собой', 'убить себя',
  'не хочу жить', 'свести счеты', 'свести счёты', 'жизнь не имеет смысла',
  'нет сил жить', 'хочу умереть', 'умру', 'покончу с собой',
  'спрыгнуть', 'выброситься', 'сброситься', 'кинуться', 'спрыгну',
  'повешусь', 'повеситься', 'застрелюсь', 'перережу вены'
];

/**
 * Проверяет, содержит ли текст пользователя кризисные ключевые слова.
 */
export const isCrisisMessage = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  return crisisKeywords.some(keyword => lower.includes(keyword));
};

/**
 * Создает объект сообщения с контактами психологической поддержки.
 */
export const createCrisisMessage = (id: number): Message => {
  return {
    id,
    who: 'agent',
    message: `Я понимаю, как тебе сейчас тяжело. Пожалуйста, не оставайся один на один с этой болью.

❤️ **Служба психологической поддержки НГТУ** всегда готова помочь:
*   **Телефон:** (383) 315-31-72
*   **Email:** spp@corp.nstu.ru
*   **Личный кабинет:** 1 корпус, 3 этаж, кабинет №330
*   **Запись на консультацию:** [https://events.ciu.nstu.ru/event/149](https://events.ciu.nstu.ru/event/149)

Также ты можешь обратиться к психологу напрямую:
*   **Евгений Владимирович Петрушкин:** 8 952 902 14 39
*   **WhatsApp:** 8 913 162 58 79

Помни, что обращаться за помощью — это нормально и правильно. Ты не один.`,
    isCrisis: true,
  };
};

/**
 * Пытается извлечь из текста ответа JSON-объект с полями answer и risk_score.
 * Возвращает { answer, riskScore } или null, если не удалось.
 */
export const extractRiskFromResponse = (response: string): { answer: string; riskScore: number } | null => {
  try {
    // Ищем JSON-блок в фигурных скобках (может быть с пробелами и переносами)
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const json = JSON.parse(match[0]);
    if (typeof json.answer === 'string' && typeof json.risk_score === 'number') {
      return { answer: json.answer, riskScore: json.risk_score };
    }
    return null;
  } catch (e) {
    return null;
  }
};