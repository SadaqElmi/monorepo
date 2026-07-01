import { existsSync } from 'fs';
import path from 'path';

export function resolvePgTool(name: string): string {
  const binDir = process.env.PG_BIN_DIR?.trim();
  if (binDir) {
    return path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);
  }
  if (process.platform === 'win32') {
    for (const version of ['18', '17', '16', '15', '14', '13']) {
      const candidate = path.join(
        'C:\\Program Files\\PostgreSQL',
        version,
        'bin',
        `${name}.exe`,
      );
      if (existsSync(candidate)) return candidate;
    }
    return `${name}.exe`;
  }
  return name;
}
