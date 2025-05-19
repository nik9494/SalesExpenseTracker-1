import { db } from "../db";
import { rooms, games, participants, taps, transactions } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { storage } from "../storage";
import { broadcastGameStart, broadcastGameEnd } from "../websocket";

/**
 * Генерирует уникальный 6-символьный код для Hero-комнат
 * @returns Строка с 6-символьным кодом
 */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Менеджер игровых комнат различных типов
 */
export class RoomManager {
  // Таймеры для комнат
  private waitingTimers: Map<string, NodeJS.Timeout> = new Map();
  private gameTimers: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Создает новую комнату
   * @param creatorId ID создателя комнаты
   * @param type Тип комнаты: 'standard', 'bonus', 'hero'
   * @param entryFee Стоимость входа в комнату
   * @param maxPlayers Максимальное количество игроков (по умолчанию 4)
   * @returns ID созданной комнаты
   */
  async createRoom(creatorId: string, type: string, entryFee: number, maxPlayers: number = 4): Promise<string> {
    try {
      const roomId = uuidv4();
      
      // Генерируем уникальный код для Hero-комнат
      let code: string | null = null;
      if (type === 'hero') {
        code = generateRoomCode();
        maxPlayers = Math.min(maxPlayers, 30); // Максимум 30 игроков для Hero-комнат
      }
      
      // Настраиваем время ожидания и длительность игры в зависимости от типа комнаты
      let waitingTime = 60; // Стандартное время ожидания - 60 секунд
      let duration = 60; // Стандартная длительность игры - 60 секунд
      
      if (type === 'hero') {
        waitingTime = 300; // 5 минут для Hero-комнат
      } else if (type === 'bonus') {
        waitingTime = 0; // Бонус-комната стартует сразу
        duration = 86400; // 24 часа (в секундах)
      }
      
      // Создаем комнату
      await storage.createRoom({
        id: roomId,
        creator_id: creatorId,
        type,
        entry_fee: String(entryFee),
        max_players: maxPlayers,
        status: 'waiting',
        code,
        waiting_time: waitingTime,
        duration,
        created_at: new Date()
      });
      
      // Добавляем создателя как участника
      await storage.addParticipant({
        room_id: roomId,
        user_id: creatorId,
        joined_at: new Date()
      });
      
      // Снимаем плату за вход
      if (entryFee > 0) {
        await this.processEntryFee(creatorId, roomId, entryFee);
      }
      
      // Для стандартных комнат и hero-комнат запускаем таймер ожидания
      if (type !== 'bonus') {
        this.startWaitingTimer(roomId, waitingTime);
      } else {
        // Для бонус-комнаты сразу создаем игру
        await this.startGame(roomId);
        
        // Создаем запись о прогрессе бонуса
        const now = new Date();
        const endTime = new Date(now.getTime() + duration * 1000);
        
        await storage.createBonusProgress({
          id: uuidv4(),
          user_id: creatorId,
          taps_so_far: 0,
          start_time: now,
          end_time: endTime,
          completed: false
        });
      }
      
      return roomId;
    } catch (error) {
      console.error('Ошибка при создании комнаты:', error);
      throw error;
    }
  }
  
  /**
   * Присоединяет игрока к комнате
   * @param roomId ID комнаты
   * @param userId ID игрока
   * @returns true если успешно присоединился, false в противном случае
   */
  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    try {
      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room) {
        console.error(`Комната ${roomId} не найдена`);
        return false;
      }
      
      // Проверяем, не заполнена ли комната
      const participants = await storage.getRoomParticipants(roomId);
      if (participants.length >= room.max_players) {
        console.error(`Комната ${roomId} уже заполнена`);
        return false;
      }
      
      // Проверяем, не присоединился ли игрок уже к комнате
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (existingParticipant) {
        // Игрок уже в комнате
        return true;
      }
      
      // Проверяем, достаточно ли у игрока звезд для входа
      const user = await storage.getUser(userId);
      if (!user) {
        console.error(`Пользователь ${userId} не найден`);
        return false;
      }
      
      // Для hero-комнат и бонус-комнат проверяем баланс только если это не создатель
      let entryFee = Number(room.entry_fee);
      if ((room.type === 'hero' || room.type === 'bonus') && room.creator_id === userId) {
        entryFee = 0; // Создатель не платит повторно
      }
      
      if (Number(user.balance_stars) < entryFee) {
        console.error(`Недостаточно звезд для входа в комнату: ${user.balance_stars} < ${entryFee}`);
        return false;
      }
      
      // Снимаем плату за вход, если нужно
      if (entryFee > 0) {
        await this.processEntryFee(userId, roomId, entryFee);
      }
      
      // Добавляем игрока в комнату
      await storage.addParticipant({
        room_id: roomId,
        user_id: userId,
        joined_at: new Date()
      });
      
      // Если комната заполнилась, начинаем игру немедленно
      const newParticipantCount = participants.length + 1;
      if (newParticipantCount >= room.max_players && room.status === 'waiting' && room.type !== 'bonus') {
        // Отменяем текущий таймер ожидания
        const waitingTimer = this.waitingTimers.get(roomId);
        if (waitingTimer) {
          clearTimeout(waitingTimer);
          this.waitingTimers.delete(roomId);
        }
        
        // Начинаем игру
        await this.startGame(roomId);
      }
      
      return true;
    } catch (error) {
      console.error('Ошибка при присоединении к комнате:', error);
      return false;
    }
  }
  
  /**
   * Обрабатывает плату за вход в комнату
   * @param userId ID игрока
   * @param roomId ID комнаты
   * @param amount Сумма платы
   */
  private async processEntryFee(userId: string, roomId: string, amount: number): Promise<void> {
    try {
      // Получаем информацию о пользователе
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`Пользователь ${userId} не найден`);
      }
      
      // Проверяем баланс
      if (Number(user.balance_stars) < amount) {
        throw new Error(`Недостаточно звезд для входа в комнату: ${user.balance_stars} < ${amount}`);
      }
      
      // Снимаем плату
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) - amount)
      });
      
      // Записываем транзакцию
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(-amount),
        type: 'entry',
        description: `Плата за вход в комнату ${roomId}`,
        created_at: new Date()
      });
      
    } catch (error) {
      console.error('Ошибка при обработке платы за вход:', error);
      throw error;
    }
  }
  
  /**
   * Запускает таймер ожидания для комнаты
   * @param roomId ID комнаты
   * @param waitingTime Время ожидания в секундах
   */
  private startWaitingTimer(roomId: string, waitingTime: number): void {
    // Отменяем существующий таймер, если есть
    if (this.waitingTimers.has(roomId)) {
      clearTimeout(this.waitingTimers.get(roomId)!);
    }
    
    // Устанавливаем новый таймер
    const timer = setTimeout(async () => {
      try {
        // Проверяем, есть ли участники в комнате
        const participants = await storage.getRoomParticipants(roomId);
        if (participants.length === 0) {
          // Если комната пуста, меняем её статус на 'finished'
          await storage.updateRoom(roomId, { status: 'finished' });
          this.waitingTimers.delete(roomId);
          return;
        }
        
        // Если есть хотя бы один участник, начинаем игру
        await this.startGame(roomId);
      } catch (error) {
        console.error(`Ошибка при запуске игры по таймеру для комнаты ${roomId}:`, error);
      } finally {
        this.waitingTimers.delete(roomId);
      }
    }, waitingTime * 1000);
    
    this.waitingTimers.set(roomId, timer);
  }
  
  /**
   * Запускает игру в комнате
   * @param roomId ID комнаты
   */
  async startGame(roomId: string): Promise<void> {
    try {
      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room) {
        throw new Error(`Комната ${roomId} не найдена`);
      }
      
      // Получаем участников
      const participants = await storage.getRoomParticipants(roomId);
      if (participants.length === 0) {
        throw new Error(`В комнате ${roomId} нет участников`);
      }
      
      // Меняем статус комнаты на 'active'
      await storage.updateRoom(roomId, { status: 'active' });
      
      // Рассчитываем призовой фонд (сумма всех entry_fee)
      const prizePool = Number(room.entry_fee) * participants.length;
      
      // Создаем игру
      const gameId = uuidv4();
      const now = new Date();
      const game = await storage.createGame({
        id: gameId,
        room_id: roomId,
        start_time: now,
        prize_pool: String(prizePool),
        duration: room.duration || 60,
        created_at: now
      });
      
      // Отправляем сообщение всем участникам о начале игры
      broadcastGameStart(roomId, {
        game_id: gameId,
        start_time: now,
        duration: room.duration || 60,
        prize_pool: prizePool,
        participants: participants.map(p => ({
          id: p.user_id,
          joined_at: p.joined_at
        }))
      });
      
      // Для всех типов комнат, кроме бонусных, устанавливаем таймер окончания
      if (room.type !== 'bonus') {
        this.startGameTimer(roomId, gameId, room.duration || 60);
      }
    } catch (error) {
      console.error(`Ошибка при запуске игры в комнате ${roomId}:`, error);
      throw error;
    }
  }
  
  /**
   * Запускает таймер окончания игры
   * @param roomId ID комнаты
   * @param gameId ID игры
   * @param duration Длительность игры в секундах
   */
  private startGameTimer(roomId: string, gameId: string, duration: number): void {
    // Отменяем существующий таймер, если есть
    if (this.gameTimers.has(gameId)) {
      clearTimeout(this.gameTimers.get(gameId)!);
    }
    
    // Устанавливаем новый таймер
    const timer = setTimeout(async () => {
      try {
        await this.endGame(roomId, gameId);
      } catch (error) {
        console.error(`Ошибка при завершении игры ${gameId}:`, error);
      } finally {
        this.gameTimers.delete(gameId);
      }
    }, duration * 1000);
    
    this.gameTimers.set(gameId, timer);
  }
  
  /**
   * Завершает игру и определяет победителя
   * @param roomId ID комнаты
   * @param gameId ID игры
   */
  async endGame(roomId: string, gameId: string): Promise<void> {
    try {
      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room) {
        throw new Error(`Комната ${roomId} не найдена`);
      }
      
      // Получаем информацию об игре
      const game = await storage.getGame(gameId);
      if (!game) {
        throw new Error(`Игра ${gameId} не найдена`);
      }
      
      // Получаем тапы всех игроков
      const gameTaps = await storage.getGameTaps(gameId);
      
      // Группируем тапы по пользователям и считаем общее количество
      const userTaps: Record<string, number> = {};
      for (const tap of gameTaps) {
        if (!userTaps[tap.user_id]) {
          userTaps[tap.user_id] = 0;
        }
        userTaps[tap.user_id] += tap.count;
      }
      
      // Определяем победителя (игрок с наибольшим количеством тапов)
      let winnerId: string | null = null;
      let maxTaps = 0;
      
      for (const [userId, tapCount] of Object.entries(userTaps)) {
        if (tapCount > maxTaps) {
          maxTaps = tapCount;
          winnerId = userId;
        }
      }
      
      // Завершаем игру
      const endTime = new Date();
      await storage.updateGame(gameId, {
        end_time: endTime,
        winner_id: winnerId || undefined
      });
      
      // Меняем статус комнаты на 'finished'
      await storage.updateRoom(roomId, { status: 'finished' });
      
      // Выплачиваем приз победителю, если это не бонусная комната
      if (winnerId && room.type !== 'bonus') {
        await this.awardPrize(winnerId, gameId, Number(game.prize_pool));
      }
      
      // Если это бонусная комната, проверяем достижение цели
      if (room.type === 'bonus' && winnerId) {
        const tapCount = userTaps[winnerId] || 0;
        const bonusProgress = await storage.getBonusProgress(winnerId);
        
        if (bonusProgress && !bonusProgress.completed) {
          // Обновляем прогресс
          await storage.updateBonusProgress(winnerId, {
            taps_so_far: tapCount,
            completed: tapCount >= 1000000 // 1М тапов для завершения бонуса
          });
          
          // Если достигнута цель, выплачиваем бонус
          if (tapCount >= 1000000) {
            // 100 звезд за выполнение бонусного челленджа
            await this.awardBonus(winnerId, 100);
          }
        }
      }
      
      // Получаем информацию о победителе
      let winner: any = null;
      if (winnerId) {
        const winnerUser = await storage.getUser(winnerId);
        if (winnerUser) {
          winner = {
            id: winnerUser.id,
            username: winnerUser.username,
            photo_url: winnerUser.photo_url,
            taps: maxTaps
          };
        }
      }
      
      // Отправляем сообщение всем участникам о завершении игры
      broadcastGameEnd(roomId, {
        game_id: gameId,
        end_time: endTime,
        winner,
        prize_pool: Number(game.prize_pool)
      });
      
    } catch (error) {
      console.error(`Ошибка при завершении игры ${gameId}:`, error);
      throw error;
    }
  }
  
  /**
   * Выплачивает приз победителю
   * @param userId ID победителя
   * @param gameId ID игры
   * @param amount Сумма приза
   */
  private async awardPrize(userId: string, gameId: string, amount: number): Promise<void> {
    try {
      // Получаем информацию о пользователе
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`Пользователь ${userId} не найден`);
      }
      
      // Увеличиваем баланс
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) + amount)
      });
      
      // Записываем транзакцию
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(amount),
        type: 'payout',
        description: `Выигрыш в игре ${gameId}`,
        created_at: new Date()
      });
      
    } catch (error) {
      console.error(`Ошибка при выплате приза пользователю ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Выплачивает бонус за завершение бонусной комнаты
   * @param userId ID пользователя
   * @param amount Сумма бонуса
   */
  private async awardBonus(userId: string, amount: number): Promise<void> {
    try {
      // Получаем информацию о пользователе
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`Пользователь ${userId} не найден`);
      }
      
      // Увеличиваем баланс
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) + amount)
      });
      
      // Записываем транзакцию
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(amount),
        type: 'bonus',
        description: `Бонус за выполнение бонусного челленджа`,
        created_at: new Date()
      });
      
    } catch (error) {
      console.error(`Ошибка при выплате бонуса пользователю ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Выход игрока из комнаты
   * @param roomId ID комнаты
   * @param userId ID игрока
   * @returns true если успешно вышел, false в противном случае
   */
  async leaveRoom(roomId: string, userId: string): Promise<boolean> {
    try {
      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room) {
        console.error(`Комната ${roomId} не найдена`);
        return false;
      }
      
      // Если комната уже активна или завершена, выход не имеет смысла
      if (room.status !== 'waiting') {
        return false;
      }
      
      // Удаляем игрока из комнаты
      const removed = await storage.removeParticipant(roomId, userId);
      
      // Проверяем, остались ли игроки в комнате
      const participants = await storage.getRoomParticipants(roomId);
      
      // Если комната пуста, меняем её статус на 'finished'
      if (participants.length === 0) {
        await storage.updateRoom(roomId, { status: 'finished' });
        
        // Отменяем таймер ожидания
        const waitingTimer = this.waitingTimers.get(roomId);
        if (waitingTimer) {
          clearTimeout(waitingTimer);
          this.waitingTimers.delete(roomId);
        }
      }
      
      return removed;
    } catch (error) {
      console.error(`Ошибка при выходе из комнаты ${roomId}:`, error);
      return false;
    }
  }
  
  /**
   * Поиск доступной комнаты определенного типа
   * @param type Тип комнаты
   * @param entryFee Стоимость входа
   * @returns ID доступной комнаты или null, если такой нет
   */
  async findAvailableRoom(type: string, entryFee: number): Promise<string | null> {
    try {
      // Получаем активные комнаты указанного типа
      const activeRooms = await storage.getActiveRooms(type);
      
      // Фильтруем комнаты по стоимости входа и наличию свободных мест
      for (const room of activeRooms) {
        if (
          room.status === 'waiting' && 
          Number(room.entry_fee) === entryFee
        ) {
          // Проверяем, есть ли свободные места
          const participants = await storage.getRoomParticipants(room.id);
          if (participants.length < room.max_players) {
            return room.id;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Ошибка при поиске доступной комнаты:', error);
      return null;
    }
  }
  
  /**
   * Получение комнаты по коду (для Hero-комнат)
   * @param code Код комнаты
   * @returns Информация о комнате или null
   */
  async getRoomByCode(code: string): Promise<any | null> {
    try {
      return await storage.getRoomByCode(code);
    } catch (error) {
      console.error(`Ошибка при получении комнаты по коду ${code}:`, error);
      return null;
    }
  }
}

// Создаем и экспортируем экземпляр менеджера комнат
export const roomManager = new RoomManager();