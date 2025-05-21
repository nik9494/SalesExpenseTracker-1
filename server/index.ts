import express, { type Request, Response, NextFunction } from "express";
import TelegramBot, { InlineKeyboardButton } from "node-telegram-bot-api";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import { corsMiddleware } from "./cors";
import session from "express-session";

// Загружаем переменные среды из .env
dotenv.config({ path: './server/.env' });

const app = express();

// Подключаем session middleware ДО роутов!
app.use(session({
  secret: process.env.JWT_SECRET || "ytreewddsfgg34532hyjklldseeew3322aw",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // secure: true только для https
}));

// Применяем CORS middleware
app.use(corsMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware для логирования
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined;

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
    // await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || "0.0.0.0";
  const clientUrl = process.env.CLIENT_URL;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.error('❌ Ошибка: TELEGRAM_BOT_TOKEN не установлен в .env');
    process.exit(1);
  }

  // Создаём бота и настраиваем Webhook
  const bot = new TelegramBot(botToken, {
    webHook: { port: 0 }
  });

  // Обработчик команды /start — отправляем кнопку «Войти»
  bot.onText(/^\/start$/, async (msg) => {
    const chatId = msg.chat.id;

    const loginButton: InlineKeyboardButton = {
      text: "🔑 Войти",
      web_app: { url: process.env.WEB_APP_URL! }
    };

    await bot.sendMessage(chatId, "Добро пожаловать! Нажмите «Войти», чтобы открыть мини‑приложение:", {
      reply_markup: {
        inline_keyboard: [[ loginButton ]]
      }
    });
  });

  // Настраиваем эндпоинт для получения webhook от Telegram
  app.post(`/webhook/${botToken}`, (req, res) => {
    console.log('📨 Получен webhook от Telegram:', req.body);
    bot.processUpdate(req.body);
    console.log('✅ Webhook обработан успешно');
    res.sendStatus(200);
  });

  // Логируем прочие сообщения и callback_query
  bot.on('message', (msg) => {
    console.log('📝 Получено сообщение:', msg);
  });

  bot.on('callback_query', (query) => {
    console.log('🔄 Получен callback_query:', query);
  });

  // Устанавливаем webhook на сервере Telegram
  const webhookUrl = `${process.env.VITE_BACKEND_URL}/webhook/${botToken}`;
  bot.setWebHook(webhookUrl)
    .then(() => console.log('🤖 Webhook установлен:', webhookUrl))
    .catch(err => console.error('❌ Ошибка установки webhook:', err));

  // Дополнительные константы для логов
  const cloudflareDomain = process.env.WEB_APP_URL;
  const backendUrl = process.env.VITE_BACKEND_URL;
  const backendWsUrl = process.env.VITE_BACKEND_WS_URL;

  // Запускаем HTTP-сервер
  server.listen({ port: Number(port), host, reusePort: true }, () => {
    console.log('\n🚀 Сервер запущен!');
    console.log(`📡 Хост: ${host}`);
    console.log(`🔌 Порт: ${port}`);
    console.log(`📱 Клиент доступен по адресу: ${clientUrl}`);
    console.log(`🔌 WebSocket: ${backendWsUrl}/ws`);
    console.log(`🌐 CORS: localhost, ${cloudflareDomain}, *.telegram.org`);
    console.log(`🌐 Бэкенд URL: ${backendUrl}\n`);
  });
})();
