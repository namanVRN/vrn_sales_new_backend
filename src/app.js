// backend/src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';

import { config } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { successResponse } from './utils/responseHandler.js';

// ═══════════════════════════════════════════
// ROUTE IMPORTS
// ═══════════════════════════════════════════
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import qualificationRoutes from './routes/qualificationRoutes.js';
import siteVisitRoutes from './routes/siteVisitRoutes.js';
import siteVisitExecutionRoutes from './routes/siteVisitExecutionRoutes.js';
import postVisitRoutes from './routes/postVisitRoutes.js';
import dealRoutes from './routes/dealRoutes.js';

// 🆕 PUBLIC ROUTES (No Auth Required)
import publicRoutes from './routes/publicRoutes.js';

const app = express();

// ═══════════════════════════════════════════
// SECURITY & PARSING MIDDLEWARE
// ═══════════════════════════════════════════
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ═══════════════════════════════════════════
// CORS
// ═══════════════════════════════════════════
app.use(cors({
  origin: [
    config.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// ═══════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════
if (config.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ═══════════════════════════════════════════
// HEALTH CHECK ROUTES
// ═══════════════════════════════════════════
app.get('/api/health', (req, res) => {
  return successResponse(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
    uptime: process.uptime(),
  }, 'Server is running');
});

app.get('/', (req, res) => {
  return successResponse(res, {
    name: 'VRN Sales CRM API',
    version: '1.0.0',
    status: 'running',
  }, 'Welcome to VRN CRM API');
});

// ═══════════════════════════════════════════
// 🆕 PUBLIC ROUTES (NO AUTHENTICATION)
// Must be registered BEFORE any auth middleware
// ═══════════════════════════════════════════
app.use('/api/public', publicRoutes);

// ═══════════════════════════════════════════
// API ROUTES (Auth handled inside each route file)
// ═══════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/holidays', holidayRoutes);

app.use('/api/leads', leadRoutes);
app.use('/api/qualification', qualificationRoutes);
app.use('/api/site-visit-scheduling', siteVisitRoutes);
app.use('/api/site-visit-execution', siteVisitExecutionRoutes);
app.use('/api/post-visit', postVisitRoutes);
app.use('/api/deal', dealRoutes);

// ═══════════════════════════════════════════
// ERROR HANDLING (must be last)
// ═══════════════════════════════════════════
app.use(notFoundHandler);
app.use(errorHandler);

export default app;