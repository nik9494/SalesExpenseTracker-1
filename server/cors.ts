import cors from 'cors';

export const corsOptions = {
  origin: [
    'https://lm-nano-projector-enable.trycloudflare.com',
    'https://arthritis-rating-trades-contents.trycloudflare.com',
    'https://t.me',
    'https://web.telegram.org',
    'http://localhost:3001',
    'http://localhost:5173'
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