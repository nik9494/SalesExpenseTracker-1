import { WebSocketServer, WebSocket, RawData } from 'ws';
import { storage } from './storage';
import { antiCheatService } from './utils/antiCheat';
import { getRandomEmoji } from './utils/helpers';

// Define message types
export enum MessageType {
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  TAP = 'tap',
  GAME_START = 'game_start',
  GAME_END = 'game_end',
  PLAYER_REACTION = 'player_reaction',
  PLAYER_JOIN = 'player_join',
  PLAYER_LEAVE = 'player_leave',
  ROOM_UPDATE = 'room_update',
  ROOM_DELETED = 'room_deleted',
  ERROR = 'error'
}

// Define message interface
interface WebSocketMessage {
  type: MessageType;
  user_id?: string;
  room_id?: string;
  game_id?: string;
  data?: any;
  timestamp?: number;
}

// Store active connections
interface Connection {
  userId: string;
  socket: WebSocket;
  roomIds: Set<string>;
  lastTapTime?: number;
  tapRate?: {
    count: number;
    startTime: number;
  };
}

// Connection management
const connections = new Map<string, Connection>();
const roomConnections = new Map<string, Set<string>>();

// Setup WebSocket server
export function setupWebSocketHandlers(wss: WebSocketServer) {
  wss.on('connection', (ws) => {
    let userId: string | undefined;
    
    // Handle messages
    ws.on('message', async (data: RawData) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        // Validate and process message
        switch (message.type) {
          case MessageType.JOIN_ROOM:
            await handleJoinRoom(ws, message);
            userId = message.user_id;
            break;
          
          case MessageType.LEAVE_ROOM:
            await handleLeaveRoom(ws, message);
            break;
          
          case MessageType.TAP:
            await handleTap(ws, message);
            break;
          
          case MessageType.PLAYER_REACTION:
            await handleReaction(ws, message);
            break;
          
          default:
            sendError(ws, 'Unknown message type');
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        sendError(ws, 'Invalid message format');
      }
    });
    
    // Handle disconnection
    ws.on('close', async () => {
      if (userId) {
        await handleDisconnect(userId);
      }
    });
  });
  
  // Heartbeat to detect dead connections (every 30 seconds)
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      
      try {
        // Ping-pong mechanism 
        ws.ping();
      } catch (e) {
        try {
          ws.terminate();
        } catch (terminateError) {
          console.error('Error terminating WebSocket:', terminateError);
        }
      }
    });
  }, 30000);
}

// Join room handler
async function handleJoinRoom(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id } = message;
  
  if (!user_id || !room_id) {
    return sendError(ws, 'Missing user_id or room_id');
  }
  
  try {
    // Validate room exists
    const room = await storage.getRoom(room_id);
    if (!room) {
      return sendError(ws, 'Room not found');
    }
    
    // Validate user exists
    const user = await storage.getUser(user_id);
    if (!user) {
      return sendError(ws, 'User not found');
    }
    
    // Add connection
    if (!connections.has(user_id)) {
      connections.set(user_id, {
        userId: user_id,
        socket: ws,
        roomIds: new Set([room_id]),
        tapRate: {
          count: 0,
          startTime: Date.now()
        }
      });
    } else {
      const connection = connections.get(user_id)!;
      connection.socket = ws; // Update socket if reconnecting
      connection.roomIds.add(room_id);
    }
    
    // Add user to room's connections
    if (!roomConnections.has(room_id)) {
      roomConnections.set(room_id, new Set([user_id]));
    } else {
      roomConnections.get(room_id)!.add(user_id);
    }
    
    // Get participants
    const participants = await storage.getRoomParticipants(room_id);
    const participantUsers = await Promise.all(
      participants.map(p => storage.getUser(p.user_id))
    );
    
    // Filter out undefined users
    const validUsers = participantUsers.filter(Boolean) as any[];
    
    // Broadcast join to all room participants
    broadcastToRoom(room_id, {
      type: MessageType.PLAYER_JOIN,
      room_id,
      user_id,
      data: {
        player: {
          id: user.id,
          username: user.username,
          photo_url: user.photo_url
        }
      },
      timestamp: Date.now()
    });
    
    // Send room data to the joining player
    sendMessage(ws, {
      type: MessageType.ROOM_UPDATE,
      room_id,
      data: {
        room,
        players: validUsers.map(u => ({
          id: u.id,
          username: u.username,
          photo_url: u.photo_url
        }))
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error joining room:', error);
    sendError(ws, 'Failed to join room');
  }
}

// Leave room handler
async function handleLeaveRoom(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id } = message;
  
  if (!user_id || !room_id) {
    return sendError(ws, 'Missing user_id or room_id');
  }
  
  try {
    // Update connection
    const connection = connections.get(user_id);
    if (connection) {
      connection.roomIds.delete(room_id);
    }
    
    // Update room connections
    const roomUsers = roomConnections.get(room_id);
    if (roomUsers) {
      roomUsers.delete(user_id);
      
      // No users left in room
      if (roomUsers.size === 0) {
        roomConnections.delete(room_id);
      }
    }
    
    // Broadcast leave to all room participants
    broadcastToRoom(room_id, {
      type: MessageType.PLAYER_LEAVE,
      room_id,
      user_id,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error leaving room:', error);
    sendError(ws, 'Failed to leave room');
  }
}

// Handle tap messages
async function handleTap(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id, data } = message;
  
  if (!user_id || !room_id || !data || typeof data.count !== 'number') {
    return sendError(ws, 'Invalid tap data');
  }
  
  try {
    const connection = connections.get(user_id);
    if (!connection) {
      return sendError(ws, 'User not connected');
    }
    
    // Anti-cheat checks
    const now = Date.now();
    
    // Initialize or update tap rate tracking
    if (!connection.tapRate) {
      connection.tapRate = {
        count: data.count,
        startTime: now
      };
    } else {
      connection.tapRate.count += data.count;
      
      // Check for cheating if more than 2 seconds have passed
      if (now - connection.tapRate.startTime > 2000) {
        // Проверяем на подозрительную активность через сервис античита
        const isCheating = await antiCheatService.checkForCheating({
          userId: user_id,
          gameId: room_id, // Используем room_id как временный заменитель game_id
          count: connection.tapRate.count,
          timestamp: now
        });
        
        if (isCheating) {
          return sendError(ws, 'Tapping too fast, potential cheating detected');
        }
        
        // Reset tap rate after checking
        connection.tapRate = {
          count: 0,
          startTime: now
        };
      }
    }
    
    // Update last tap time
    connection.lastTapTime = now;
    
    // Find active game in the room
    const room = await storage.getRoom(room_id);
    if (!room || room.status !== 'active') {
      return sendError(ws, 'No active game in this room');
    }
    
    // Get most recent game for this room
    const [game] = await storage.getGamesByRoomId(room_id, 1);
    if (!game || game.end_time) {
      return sendError(ws, 'No active game found');
    }
    
    // Record taps
    await storage.addTaps({
      id: crypto.randomUUID(), // Добавляем уникальный ID
      game_id: game.id,
      user_id,
      count: data.count,
      created_at: new Date()
    });
    
    // Broadcast tap update to all room participants
    broadcastToRoom(room_id, {
      type: MessageType.TAP,
      room_id,
      user_id,
      data: {
        count: data.count
      },
      timestamp: now
    });
    
  } catch (error) {
    console.error('Error handling tap:', error);
    sendError(ws, 'Failed to process tap');
  }
}

// Handle reaction messages
async function handleReaction(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id, data } = message;
  
  if (!user_id || !room_id || !data || !data.to_user_id) {
    return sendError(ws, 'Invalid reaction data');
  }
  
  try {
    // Generate random emoji if not provided
    const reaction = data.reaction || getRandomEmoji();
    
    // Broadcast reaction to all room participants
    broadcastToRoom(room_id, {
      type: MessageType.PLAYER_REACTION,
      room_id,
      user_id,
      data: {
        to_user_id: data.to_user_id,
        reaction
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error handling reaction:', error);
    sendError(ws, 'Failed to send reaction');
  }
}

// Handle client disconnection
async function handleDisconnect(userId: string) {
  try {
    const connection = connections.get(userId);
    if (!connection) return;
    
    // For each room user was in, notify others and clean up
    for (const roomId of connection.roomIds) {
      // Broadcast leave
      broadcastToRoom(roomId, {
        type: MessageType.PLAYER_LEAVE,
        room_id: roomId,
        user_id: userId,
        timestamp: Date.now()
      });
      
      // Remove from room connections
      const roomUsers = roomConnections.get(roomId);
      if (roomUsers) {
        roomUsers.delete(userId);
        if (roomUsers.size === 0) {
          roomConnections.delete(roomId);
        }
      }
    }
    
    // Remove connection
    connections.delete(userId);
    
  } catch (error) {
    console.error('Error handling disconnect:', error);
  }
}

// Send error message to client
function sendError(ws: WebSocket, message: string) {
  sendMessage(ws, {
    type: MessageType.ERROR,
    data: { message },
    timestamp: Date.now()
  });
}

// Send message to a client
function sendMessage(ws: WebSocket, message: WebSocketMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Broadcast message to all users in a room
function broadcastToRoom(roomId: string, message: WebSocketMessage) {
  const roomUsers = roomConnections.get(roomId);
  if (!roomUsers) return;
  
  roomUsers.forEach(userId => {
    const connection = connections.get(userId);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  });
}

// Broadcast game start event
export function broadcastGameStart(roomId: string, game: any) {
  broadcastToRoom(roomId, {
    type: MessageType.GAME_START,
    room_id: roomId,
    game_id: game.id,
    data: { game, duration: game.duration },
    timestamp: Date.now()
  });
}

// Broadcast game end event
export function broadcastGameEnd(roomId: string, game: any, winner: any) {
  broadcastToRoom(roomId, {
    type: MessageType.GAME_END,
    room_id: roomId,
    game_id: game.id,
    data: { game, winner },
    timestamp: Date.now()
  });
}

export function broadcastRoomDeleted(roomId: string) {
  const roomParticipants = roomConnections.get(roomId);
  if (!roomParticipants) return;

  const message: WebSocketMessage = {
    type: MessageType.ROOM_DELETED,
    room_id: roomId,
    timestamp: Date.now()
  };

  // Отправляем сообщение всем участникам комнаты
  roomParticipants.forEach(userId => {
    const connection = connections.get(userId);
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(message));
    }
  });

  // Удаляем комнату из списка
  roomConnections.delete(roomId);
}
