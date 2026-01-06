/**
 * Centralized logging utility
 * In production, this can be extended to send logs to external services
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }
  
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, context));
    }
  }
  
  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage('info', message, context));
  }
  
  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('warn', message, context));
  }
  
  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error 
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : String(error),
    };
    console.error(this.formatMessage('error', message, errorContext));
    
    // In production, you could send errors to an error tracking service
    // Example: Sentry.captureException(error, { extra: context });
  }
}

export const logger = new Logger();
