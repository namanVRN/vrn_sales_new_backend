const getTimestamp = () => {
  return new Date().toISOString();
};

export const logger = {
  info: (message, ...args) => {
    console.log(`[${getTimestamp()}] ℹ️  INFO:`, message, ...args);
  },
  
  success: (message, ...args) => {
    console.log(`[${getTimestamp()}] ✅ SUCCESS:`, message, ...args);
  },
  
  warn: (message, ...args) => {
    console.warn(`[${getTimestamp()}] ⚠️  WARN:`, message, ...args);
  },
  
  error: (message, ...args) => {
    console.error(`[${getTimestamp()}] ❌ ERROR:`, message, ...args);
  },
  
  debug: (message, ...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${getTimestamp()}] 🐛 DEBUG:`, message, ...args);
    }
  },
};

export default logger;