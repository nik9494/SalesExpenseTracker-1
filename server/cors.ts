import cors from 'cors';

export const corsOptions = {
  origin: [
    'https://vast-consideration-sur-kentucky.trycloudflare.com',
    'https://discussing-soviet-dod-om.trycloudflare.com',
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