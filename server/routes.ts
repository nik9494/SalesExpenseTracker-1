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
  
  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
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
