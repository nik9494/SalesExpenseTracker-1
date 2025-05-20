import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { storage } from '../storage';
import { v4 as uuidv4 } from 'uuid';

/**
 * Проверяет данные аутентификации от Telegram WebApp
 * @param initData строка initData от Telegram WebApp
 * @returns true если данные валидны, false если нет
 */
export function validateTelegramWebAppData(initData: string): boolean {
  // В режиме разработки можно пропустить проверку
  if (process.env.NODE_ENV === 'development' && !process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('Пропускаем валидацию Telegram в режиме разработки');
    return true;
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) return false;
    
    // Удаляем hash из данных
    urlParams.delete('hash');
    
    // Сортируем оставшиеся параметры по ключу 
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    // Создаем HMAC-SHA256 с секретным ключом
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN || 'test_token')
      .digest();
    
    // Вычисляем хеш данных
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Ошибка при валидации данных Telegram:', error);
    return false;
  }
}

/**
 * Проверяет данные Telegram Auth и возвращает данные пользователя
 * @param telegramData данные от Telegram WebApp
 * @returns данные пользователя или undefined если валидация не прошла
 */
export function validateTelegramAuth(telegramData: string): any {
  try {
    // В режиме разработки возвращаем тестовые данные
    if (process.env.NODE_ENV === 'development' && !process.env.TELEGRAM_BOT_TOKEN) {
      console.warn('Возвращаем тестовые данные Telegram в режиме разработки');
      return {
        id: 12345,
        username: 'test_user',
        first_name: 'Test',
        last_name: 'User',
        photo_url: 'https://t.me/i/userpic/320/MxJFjM7nCgAyNi1NY-PJzEXuN2JGeaI-m6OGLZJvFIk.jpg'
      };
    }
    
    // Проверяем валидность данных
    const isValid = validateTelegramWebAppData(telegramData);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return undefined;
    }
    
    // Извлекаем данные пользователя
    return extractTelegramUserData(telegramData);
  } catch (error) {
    console.error('Ошибка при валидации Telegram Auth:', error);
    return undefined;
  }
}

/**
 * Извлекает данные пользователя из Telegram initData
 * @param initData строка initData от Telegram WebApp
 * @returns данные пользователя или null если не удалось извлечь
 */
export function extractTelegramUserData(initData: string): any {
  try {
    const urlParams = new URLSearchParams(initData);
    const user = urlParams.get('user');
    
    if (!user) return null;
    
    return JSON.parse(decodeURIComponent(user));
  } catch (error) {
    console.error('Ошибка при извлечении данных пользователя:', error);
    return null;
  }
}

/**
 * Middleware для аутентификации пользователей через Telegram
 */
export async function authenticateTelegram(req: Request, res: Response, next: NextFunction) {
  try {
    const { telegramData } = req.body;
    if (!telegramData) {
      return res.status(400).json({ error: 'Отсутствуют данные Telegram' });
    }
    // Проверяем валидность данных Telegram WebApp
    const isValid = validateTelegramWebAppData(telegramData);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Невалидные данные аутентификации Telegram' });
    }
    // Извлекаем данные пользователя
    const userData = extractTelegramUserData(telegramData);
    if (!userData) {
      return res.status(400).json({ error: 'Не удалось извлечь данные пользователя' });
    }
    // Получаем или создаём пользователя за единый вызов
    const { id: telegram_id, username, first_name, photo_url } = userData;
    const referralCode = (username || first_name || 'user') + Math.random().toString(36).substring(2, 8).toUpperCase();
    const user = await storage.getOrCreateUserByTelegramId(
      telegram_id,
      username || `${first_name || 'User'}${telegram_id.toString().slice(-4)}`,
      {
        id: uuidv4(),
        balance_stars: "100",
        has_ton_wallet: false,
        photo_url,
        created_at: new Date(),
        referral_code: referralCode,
      }
    );
    // Если пользователь новый — создаём запись о реферале
    if (user.created_at.getTime() === new Date().getTime()) {
      await storage.createReferral({
        code: referralCode,
        user_id: user.id,
        bonus_amount: '50',
        created_at: new Date(),
      });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Ошибка аутентификации Telegram:', error);
    res.status(500).json({ error: 'Ошибка сервера при аутентификации' });
  }
}

/**
 * Middleware для проверки аутентификации
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // В режиме разработки можно использовать заглушку для тестирования
  if (process.env.NODE_ENV === 'development' && !req.user) {
    return getDummyUser().then(user => {
      req.user = user;
      next();
    }).catch(error => {
      console.error('Ошибка при получении тестового пользователя:', error);
      res.status(401).json({ error: 'Пользователь не аутентифицирован' });
    });
  }
  
  if (!req.user) {
    return res.status(401).json({ error: 'Пользователь не аутентифицирован' });
  }
  
  next();
}

/**
 * Генерирует реферальный код из 8 символов
 */
function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Получает или создает тестового пользователя для режима разработки
 */
async function getDummyUser() {
  try {
    // Ищем тестового пользователя или создаем нового
    let user = await storage.getUserByTelegramId(12345);
    
    if (!user) {
      const referralCode = generateReferralCode();
      
      user = await storage.createUser({
        id: uuidv4(),
        telegram_id: 12345,
        username: 'test_user',
        balance_stars: "1000", // Даем тестовому пользователю много звезд для тестирования
        has_ton_wallet: false,
        photo_url: 'https://t.me/i/userpic/320/MxJFjM7nCgAyNi1NY-PJzEXuN2JGeaI-m6OGLZJvFIk.jpg',
        created_at: new Date(),
        referral_code: referralCode
      });
      
      await storage.createReferral({
        code: referralCode,
        user_id: user.id,
        bonus_amount: "50",
        created_at: new Date()
      });
    }
    
    return user;
  } catch (error) {
    console.error('Ошибка при создании тестового пользователя:', error);
    throw error;
  }
}