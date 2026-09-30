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

export type ParsedAgentReply = {
  answer: string;
  riskScore: number;
  newFacts: string[];
};

function readFactList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const facts: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    const key = text.toLowerCase();
    if (!text || text.length > 400 || seen.has(key)) continue;
    seen.add(key);
    facts.push(text);
    if (facts.length >= 8) break;
  }
  return facts;
}

function readReplyJson(response: string): Record<string, unknown> | null {
  try {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const json = JSON.parse(match[0]);
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    return json as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Новые факты из JSON ответа. Пустой массив, если поля нет или JSON не разобрался.
 */
export const extractNewFactsFromResponse = (response: string): string[] => {
  const json = readReplyJson(response);
  return json ? readFactList(json.new_facts) : [];
};

/**
 * Пытается извлечь из текста ответа JSON-объект с полями answer и risk_score.
 * Возвращает { answer, riskScore, newFacts } или null, если не удалось.
 */
export const extractRiskFromResponse = (response: string): ParsedAgentReply | null => {
  const json = readReplyJson(response);
  if (!json) return null;
  const newFacts = readFactList(json.new_facts);
  if (typeof json.answer === 'string' && typeof json.risk_score === 'number') {
    return { answer: json.answer, riskScore: json.risk_score, newFacts };
  }
  return null;
};