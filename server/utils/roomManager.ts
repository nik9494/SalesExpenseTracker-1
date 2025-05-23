import { db } from "../db";
import { rooms, games, participants, taps, transactions } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { storage } from "../storage";
import { broadcastGameStart, broadcastGameEnd, broadcastRoomDeleted } from "../websocket";

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
  private autoDeleteTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly MIN_PLAYERS = 2;
  private readonly MAX_PLAYERS = 30;
  private readonly WINNING_TAPS = 200;
  private readonly ORGANIZER_SHARE = 0.1; // 10% для организатора
  private readonly MIN_BALANCE_FOR_CREATION = 50; // Минимальный баланс для создания комнаты
  
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
      console.log(`[RoomManager] Creating new room of type ${type} by user ${creatorId}`);
      
      // Проверяем баланс создателя для Hero-комнат
      if (type === 'hero') {
        const user = await storage.getUser(creatorId);
        if (!user || Number(user.balance_stars) < this.MIN_BALANCE_FOR_CREATION) {
          console.log(`[RoomManager] Insufficient balance for room creation: user ${creatorId}`);
          throw new Error('Insufficient balance for room creation');
        }
        console.log(`[RoomManager] User ${creatorId} has sufficient balance for room creation`);
      }
      
      const roomId = uuidv4();
      console.log(`[RoomManager] Generated room ID: ${roomId}`);
      
      // Генерируем уникальный код для Hero-комнат
      let code: string | null = null;
      if (type === 'hero') {
        code = generateRoomCode();
        maxPlayers = Math.min(maxPlayers, this.MAX_PLAYERS);
        console.log(`[RoomManager] Generated room code: ${code}`);
      }
      
      // Настраиваем время ожидания и длительность игры
      let waitingTime = 60;
      let duration = 60;
      
      if (type === 'hero') {
        waitingTime = 300; // 5 минут для Hero-комнат
        console.log(`[RoomManager] Set waiting time for hero room: ${waitingTime} seconds`);
      } else if (type === 'bonus') {
        waitingTime = 0; // Бонус-комната стартует сразу
        duration = 86400; // 24 часа (в секундах)
      }
      
      // Создаем комнату
      console.log(`[RoomManager] Creating room in database: ${roomId}`);
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
      console.log(`[RoomManager] Room created successfully: ${roomId}`);
      
      // Добавляем создателя как участника
      console.log(`[RoomManager] Adding creator as participant: ${creatorId}`);
      await storage.addParticipant({
        room_id: roomId,
        user_id: creatorId,
        joined_at: new Date()
      });
      
      // Снимаем плату за вход только если это не создатель комнаты
      if (entryFee > 0 && type !== 'hero') {
        console.log(`[RoomManager] Processing entry fee for creator: ${creatorId}`);
        await this.processEntryFee(creatorId, roomId, entryFee);
      }
      
      // Запускаем таймер автоматического удаления для Hero-комнат
      if (type === 'hero') {
        console.log(`[RoomManager] Starting auto-delete timer for hero room: ${roomId}`);
        this.startAutoDeleteTimer(roomId, waitingTime);
      } else {
        // Для стандартных комнат и бонус-комнат запускаем таймер ожидания
        if (type !== 'bonus') {
          console.log(`[RoomManager] Starting waiting timer for standard room: ${roomId}`);
          this.startWaitingTimer(roomId, waitingTime);
        } else {
          // Для бонус-комнаты сразу создаем игру
          console.log(`[RoomManager] Starting bonus game immediately: ${roomId}`);
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
      }
      
      console.log(`[RoomManager] Room creation completed successfully: ${roomId}`);
      return roomId;
    } catch (error) {
      console.error('[RoomManager] Error creating room:', error);
      throw error;
    }
  }
  
  /**
   * Присоединяет игрока к комнате
   * @param roomId ID комнаты
   * @param userId ID игрока
   * @param isObserver Флаг наблюдателя
   * @returns true если успешно присоединился, false в противном случае
   */
  async joinRoom(roomId: string, userId: string, isObserver: boolean = false): Promise<boolean> {
    try {
      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room) {
        console.error(`Комната ${roomId} не найдена`);
        return false;
      }
      
      // Проверяем, не заполнена ли комната
      const participants = await storage.getRoomParticipants(roomId);
      if (participants.length >= room.max_players && !isObserver) {
        console.error(`Комната ${roomId} уже заполнена`);
        return false;
      }
      
      // Проверяем, не присоединился ли игрок уже к комнате
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (existingParticipant) {
        // Игрок уже в комнате
        return true;
      }
      
      // Для hero-комнат проверяем баланс только если это не создатель и не наблюдатель
      let entryFee = Number(room.entry_fee);
      if (room.type === 'hero' && (room.creator_id === userId || isObserver)) {
        entryFee = 0; // Создатель и наблюдатель не платят
      }
      
      // Проверяем баланс только если это не наблюдатель
      if (!isObserver) {
        const user = await storage.getUser(userId);
        if (!user) {
          console.error(`Пользователь ${userId} не найден`);
          return false;
        }
        
        if (Number(user.balance_stars) < entryFee) {
          console.error(`Недостаточно звезд для входа в комнату: ${user.balance_stars} < ${entryFee}`);
          return false;
        }
        
        // Снимаем плату за вход, если нужно
        if (entryFee > 0) {
          await this.processEntryFee(userId, roomId, entryFee);
        }
      }
      
      // Добавляем игрока в комнату
      await storage.addParticipant({
        room_id: roomId,
        user_id: userId,
        joined_at: new Date(),
        is_observer: isObserver
      });
      
      // Если комната заполнилась и это не наблюдатель, начинаем игру немедленно
      const newParticipantCount = participants.length + 1;
      if (newParticipantCount >= room.max_players && room.status === 'waiting' && room.type !== 'bonus' && !isObserver) {
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
      if (participants.length < this.MIN_PLAYERS) {
        throw new Error('Not enough players to start the game');
      }
      
      // Меняем статус комнаты на 'active'
      await storage.updateRoom(roomId, { status: 'active' });
      
      // Создаем игру
      const gameId = uuidv4();
      const now = new Date();
      const game = await storage.createGame({
        id: gameId,
        room_id: roomId,
        status: 'active',
        start_time: now,
        end_time: new Date(Date.now() + room.duration * 1000),
        winner_id: null
      });
      
      // Отправляем сообщение всем участникам о начале игры
      broadcastGameStart(roomId, {
        game_id: gameId,
        start_time: now,
        duration: room.duration || 60,
        prize_pool: Number(room.entry_fee) * participants.length,
        participants: participants.map(p => ({
          id: p.user_id,
          joined_at: p.joined_at
        }))
      });
      
      // Запускаем таймер игры
      this.startGameTimer(roomId, room.duration || 60);
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
  private startGameTimer(roomId: string, duration: number): void {
    // Отменяем существующий таймер, если есть
    if (this.gameTimers.has(roomId)) {
      clearTimeout(this.gameTimers.get(roomId)!);
    }
    
    // Устанавливаем новый таймер
    const timer = setTimeout(async () => {
      try {
        await this.endGame(roomId);
      } catch (error) {
        console.error(`Ошибка при завершении игры ${roomId}:`, error);
      } finally {
        this.gameTimers.delete(roomId);
      }
    }, duration * 1000);
    
    this.gameTimers.set(roomId, timer);
  }
  
  /**
   * Завершает игру и определяет победителя
   * @param roomId ID комнаты
   */
  async endGame(roomId: string): Promise<void> {
    try {
      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || !room.game_id) {
        throw new Error(`Комната ${roomId} не найдена или не имеет активной игры`);
      }
      
      // Получаем информацию об игре
      const game = await storage.getGame(room.game_id);
      if (!game) {
        throw new Error(`Игра ${room.game_id} не найдена`);
      }
      
      // Получаем тапы всех игроков
      const playerTaps = await storage.getGameTaps(room.game_id);
      
      // Находим победителя
      let winnerId = null;
      let maxTaps = 0;
      
      for (const [playerId, taps] of Object.entries(playerTaps)) {
        if (taps >= this.WINNING_TAPS) {
          winnerId = playerId;
          break;
        }
        if (taps > maxTaps) {
          maxTaps = taps;
          winnerId = playerId;
        }
      }
      
      if (winnerId) {
        // Рассчитываем призовой фонд
        const participants = await storage.getRoomParticipants(roomId);
        const entryFee = Number(room.entry_fee);
        const totalPrize = participants.length * entryFee;
        
        // Распределяем призовой фонд
        const winnerPrize = Math.floor(totalPrize * (1 - this.ORGANIZER_SHARE));
        const organizerPrize = totalPrize - winnerPrize;

        // Обновляем балансы
        await storage.updateUser(winnerId, {
          balance_stars: String(Number((await storage.getUser(winnerId))?.balance_stars || 0) + winnerPrize)
        });

        await storage.updateUser(room.creator_id, {
          balance_stars: String(Number((await storage.getUser(room.creator_id))?.balance_stars || 0) + organizerPrize)
        });

        // Записываем транзакции
        await storage.createTransaction({
          id: uuidv4(),
          user_id: winnerId,
          amount: String(winnerPrize),
          type: "prize",
          description: `Prize for winning game in room ${room.code}`,
          created_at: new Date()
        });

        await storage.createTransaction({
          id: uuidv4(),
          user_id: room.creator_id,
          amount: String(organizerPrize),
          type: "organizer_share",
          description: `Organizer share for game in room ${room.code}`,
          created_at: new Date()
        });
      }
      
      // Обновляем статус игры
      await storage.updateGame(room.game_id, {
        status: 'finished',
        winner_id: winnerId,
        end_time: new Date()
      });
      
      // Обновляем статус комнаты
      await storage.updateRoom(roomId, {
        status: 'finished'
      });
      
      // Отправляем уведомление о завершении игры
      broadcastGameEnd(roomId, {
        winner_id: winnerId,
        game_id: room.game_id
      });
    } catch (error) {
      console.error(`Ошибка при завершении игры ${roomId}:`, error);
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

  private startAutoDeleteTimer(roomId: string, waitingTime: number) {
    console.log(`[RoomManager] Starting auto-delete timer for room ${roomId}, waiting time: ${waitingTime}s`);
    
    // Отменяем существующий таймер, если есть
    if (this.autoDeleteTimers.has(roomId)) {
      console.log(`[RoomManager] Clearing existing timer for room ${roomId}`);
      clearTimeout(this.autoDeleteTimers.get(roomId)!);
      this.autoDeleteTimers.delete(roomId);
    }
    
    console.log(`[RoomManager] Setting new timer for room ${roomId}, will expire in ${waitingTime} seconds`);
    const timer = setTimeout(async () => {
      console.log(`[RoomManager] Timer expired for room ${roomId}, starting deletion process`);
      try {
        const room = await storage.getRoom(roomId);
        if (!room) {
          console.log(`[RoomManager] Room ${roomId} not found, skipping deletion`);
          return;
        }

        console.log(`[RoomManager] Found room ${roomId}, status: ${room.status}, code: ${room.code}`);
        if (room.status === 'waiting') {
          console.log(`[RoomManager] Room ${roomId} is in waiting state, proceeding with deletion`);
          
          // Возвращаем взносы всем участникам
          const participants = await storage.getRoomParticipants(roomId);
          console.log(`[RoomManager] Found ${participants.length} participants to refund`);
          
          for (const participant of participants) {
            console.log(`[RoomManager] Processing refund for participant ${participant.user_id}`);
            await this.refundEntryFee(participant.user_id, roomId, Number(room.entry_fee));
            console.log(`[RoomManager] Successfully refunded entry fee to user ${participant.user_id}`);
          }
          
          // Удаляем комнату
          console.log(`[RoomManager] Attempting to delete room ${roomId}`);
          await storage.deleteRoom(roomId);
          console.log(`[RoomManager] Successfully deleted room ${roomId}`);
          
          // Отправляем уведомление всем участникам
          console.log(`[RoomManager] Broadcasting room deletion notification for room ${roomId}`);
          broadcastRoomDeleted(roomId);
        } else {
          console.log(`[RoomManager] Room ${roomId} is not in waiting state (status: ${room.status}), skipping deletion`);
        }
      } catch (error) {
        console.error(`[RoomManager] Error during auto-delete of room ${roomId}:`, error);
      } finally {
        console.log(`[RoomManager] Cleaning up timer for room ${roomId}`);
        this.autoDeleteTimers.delete(roomId);
      }
    }, waitingTime * 1000);
    
    this.autoDeleteTimers.set(roomId, timer);
    console.log(`[RoomManager] Timer set successfully for room ${roomId}`);
  }

  private async refundEntryFee(userId: string, roomId: string, amount: number) {
    const room = await storage.getRoom(roomId);
    if (!room) return;

    const user = await storage.getUser(userId);
    if (!user) return;

    // Возвращаем взнос
    await storage.updateUser(userId, {
      balance_stars: String(Number(user.balance_stars) + amount)
    });

    // Записываем транзакцию
    await storage.createTransaction({
      id: uuidv4(),
      user_id: userId,
      amount: String(amount),
      type: "refund",
      description: `Refund for room ${room.code}`,
      created_at: new Date()
    });
  }

  async deleteRoom(roomId: string, userId: string) {
    const room = await storage.getRoom(roomId);
    if (!room || room.creator_id !== userId) {
      throw new Error('Unauthorized to delete room');
    }

    // Возвращаем взносы всем участникам
    const participants = await storage.getRoomParticipants(roomId);
    for (const participant of participants) {
      await this.refundEntryFee(participant.user_id, roomId, Number(room.entry_fee));
    }

    // Удаляем комнату
    await storage.deleteRoom(roomId);

    // Отправляем уведомление всем участникам
    broadcastRoomDeleted(roomId);
  }
}

// Создаем и экспортируем экземпляр менеджера комнат
export const roomManager = new RoomManager();