import cors from 'cors';

export const corsOptions = {
  origin: [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:3001',  // Ваш сервер
    'https://*.trycloudflare.com',  // Cloudflare Tunnels
    'https://*.telegram.org',
    'https://web.telegram.org'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  maxAge: 86400, // 24 часа
  preflightContinue: false,
  optionsSuccessStatus: 204
};

export const corsMiddleware = cors(corsOptions);