/**
 * Environment variable validation and configuration
 * Ensures required environment variables are present and valid
 */

interface EnvConfig {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  isDevelopment: boolean;
}

/**
 * Validates and returns environment configuration
 * Throws error if critical environment variables are missing
 */
export function getEnvConfig(): EnvConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as EnvConfig['nodeEnv'];
  
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
  }
  
  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
  };
}

/**
 * Get environment variable with optional default
 */
export function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    // In production, warn about missing env vars (but don't throw)
    if (process.env.NODE_ENV === 'production') {
      console.warn(`Missing environment variable: ${key}`);
    }
    return '';
  }
  
  return value;
}

/**
 * Get required environment variable (throws if missing)
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  
  if (!value) {
    throw new Error(`Required environment variable ${key} is missing`);
  }
  
  return value;
}

// Export validated config
export const env = getEnvConfig();
