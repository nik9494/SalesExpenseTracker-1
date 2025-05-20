import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer } from "ws";
import { setupWebSocketHandlers } from "./websocket";

// Import controllers
import { registerRoomRoutes } from "./controllers/rooms";
import { registerUserRoutes } from "./controllers/users";
import { registerGameRoutes } from "./controllers/games";
import { registerLeaderboardRoutes } from "./controllers/leaderboard";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup WebSocket server with improved configuration
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
    // Добавляем проверку происхождения и токена
    verifyClient: async (info, callback) => {
      try {
        const origin = info.origin || info.req.headers.origin;
        const token = new URL(info.req.url || '', 'ws://localhost').searchParams.get('token');
        
        console.log('WebSocket connection attempt details:', {
          origin,
          token,
          headers: info.req.headers,
          url: info.req.url
        });
        
        // Проверяем происхождение
        if (!origin?.includes('localhost') && !origin?.includes('cloudflare')) {
          console.log('Rejected WebSocket connection from:', origin);
          return callback(false, 403, 'Forbidden');
        }

        // Если есть токен, проверяем его
        if (token) {
          const user = await storage.getUser(token);
          if (!user) {
            console.log('Invalid token:', token);
            return callback(false, 401, 'Unauthorized');
          }
          console.log('Valid token for user:', user.id);
        }

        callback(true);
      } catch (error) {
        console.error('Error in verifyClient:', error);
        callback(false, 500, 'Internal Server Error');
      }
    },
    maxPayload: 1024 * 1024,
    clientTracking: true,
    perMessageDeflate: {
      zlibDeflateOptions: {
        chunkSize: 1024,
        memLevel: 7,
        level: 3
      },
      zlibInflateOptions: {
        chunkSize: 10 * 1024
      },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10,
      threshold: 1024
    }
  });

  // Добавляем обработку ошибок
  wss.on('error', (error) => {
    console.error('WebSocket Server Error:', error);
  });

  // Добавляем логирование подключений
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url || '', 'ws://localhost').searchParams.get('token');
    const ip = req.socket.remoteAddress;
    console.log('WebSocket connection established:', {
      ip,
      token,
      headers: req.headers,
      url: req.url,
      protocol: req.headers['sec-websocket-protocol']
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket Client Error:', error);
    });

    ws.on('close', (code, reason) => {
      console.log('WebSocket connection closed:', {
        ip,
        code,
        reason: reason.toString()
      });
    });
  });

  setupWebSocketHandlers(wss);
  
  // API routes
  const apiPrefix = '/api/v1';
  
  // Register all route controllers
  registerUserRoutes(app, apiPrefix);
  registerRoomRoutes(app, apiPrefix);
  registerGameRoutes(app, apiPrefix);
  registerLeaderboardRoutes(app, apiPrefix);
  
  return httpServer;
}