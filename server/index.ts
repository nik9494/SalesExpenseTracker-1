import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import { corsMiddleware } from "./cors";

// Загружаем переменные среды из .env
dotenv.config({ path: './server/.env' });

const app = express();

// Применяем CORS middleware
app.use(corsMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware для логирования
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Обработка ошибок
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Настройка Vite только в development
  if (app.get("env") === "development") {
    //await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || "0.0.0.0";
  const clientUrl = process.env.CLIENT_URL;
  const cloudflareDomain = process.env.VITE_CLOUDFLARE_DOMAIN;
  const backendUrl = process.env.VITE_BACKEND_URL;
  const backendWsUrl = process.env.VITE_BACKEND_WS_URL;

  server.listen({
    port: Number(port),
    host,
    reusePort: true,
  }, () => {
    console.log('\n🚀 Сервер запущен!');
    console.log(`📡 Хост: ${host}`);
    console.log(`🔌 Порт: ${port}`);
    console.log(`📱 Клиент доступен по адресу: ${clientUrl}`);
    console.log(`🔌 WebSocket доступен по адресу: ${backendWsUrl}/ws`);
    console.log(`🌐 CORS настроен для: localhost, ${cloudflareDomain}, *.telegram.org`);
    console.log(`🌐 Бэкенд доступен по адресу: ${backendUrl}\n`);
  });
})();