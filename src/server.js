import { config } from './config/env.js';
import connectDB from './config/db.js';
import app from './app.js';
import logger from './utils/logger.js';

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message);
  logger.error(err.stack);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Start Express server
    const server = app.listen(config.PORT, () => {
      console.log('');
      console.log('════════════════════════════════════════');
      console.log('🚀 VRN CRM Backend Server Started');
      console.log(`🌍 Environment: ${config.NODE_ENV}`);
      console.log(`📡 Port: ${config.PORT}`);
      console.log(`🔗 URL: http://localhost:${config.PORT}`);
      console.log(`❤️  Health: http://localhost:${config.PORT}/api/health`);
      console.log('════════════════════════════════════════');
      console.log('');
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      logger.error('Unhandled Rejection:', err.message);
      server.close(() => process.exit(1));
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.warn('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        logger.info('Process terminated');
      });
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();