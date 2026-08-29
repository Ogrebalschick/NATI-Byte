import { Message } from './byte'; // импортируем интерфейс из основного файла

// Типы ошибок
export type ErrorType = 'network' | 'server' | 'unknown';

/**
 * Создаёт сообщение об ошибке для отображения в чате
 * @param errorType - тип ошибки
 * @param customMessage - кастомное сообщение (опционально)
 * @returns объект Message с флагом isError
 */
export const createErrorMessage = (
  errorType: ErrorType = 'unknown',
  customMessage?: string
): Message => {
  let message = customMessage || '';

  if (!message) {
    switch (errorType) {
      case 'network':
        message = '❌ Ошибка соединения. Проверьте интернет и попробуйте снова.';
        break;
      case 'server':
        message = '❌ Не удалось получить ответ от сервера. Попробуйте ещё раз.';
        break;
      default:
        message = '❌ Произошла непредвиденная ошибка. Попробуйте позже.';
    }
  }

  return {
    id: Date.now() + 2,
    who: 'agent',
    message,
    isError: true,
  };
};

/**
 * Обрабатывает ошибку в блоке try/catch и возвращает подходящее сообщение
 * @param error - перехваченная ошибка
 * @returns объект Message с ошибкой
 */
export const handleApiError = (error: any): Message => {
  // Проверяем, является ли ошибка сетевой (нет соединения)
  const isNetworkError =
    error.message?.includes('Network request failed') ||
    error.message?.includes('Failed to fetch') ||
    error.code === 'ECONNABORTED' ||
    !error.response;

  return createErrorMessage(isNetworkError ? 'network' : 'server');
};