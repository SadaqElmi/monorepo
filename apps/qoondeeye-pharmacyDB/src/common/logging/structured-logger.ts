import { Logger } from '@nestjs/common';

export type LogLevel = 'log' | 'warn' | 'error' | 'debug';

const nestLogger = new Logger('Http');

const isProduction = process.env.NODE_ENV === 'production';

export function structuredLog(
  level: LogLevel,
  fields: Record<string, unknown>,
): void {
  const payload = { ...fields, ts: new Date().toISOString() };
  const line = isProduction
    ? JSON.stringify(payload)
    : JSON.stringify(payload, null, 2);

  switch (level) {
    case 'warn':
      nestLogger.warn(line);
      break;
    case 'error':
      nestLogger.error(line);
      break;
    case 'debug':
      nestLogger.debug(line);
      break;
    default:
      nestLogger.log(line);
  }
}
