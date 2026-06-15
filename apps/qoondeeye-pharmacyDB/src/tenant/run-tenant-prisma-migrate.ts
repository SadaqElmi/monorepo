import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Walk up from compiled or source location to `apps/qoondeeye-pharmacyDB`. */
export function resolveBackendAppRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(join(dir, 'package.json')) &&
      existsSync(join(dir, 'prisma', 'tenant', 'prisma.config.ts'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function redactDatabaseUrlsFromOutput(output: string): string {
  return output.replace(
    /postgres(?:ql)?:\/\/[^\s'"]+/gi,
    'postgresql://***',
  );
}

function resolvePrismaCli(appRoot: string): string {
  try {
    return require.resolve('prisma/build/index.js', { paths: [appRoot] });
  } catch {
    return require.resolve('prisma/build/index.js');
  }
}

/** Apply tenant Prisma migrations to a dedicated tenant database. */
export async function runTenantPrismaMigrate(databaseUrl: string): Promise<void> {
  const appRoot = resolveBackendAppRoot();
  const prismaCli = resolvePrismaCli(appRoot);
  const configPath = join('prisma', 'tenant', 'prisma.config.ts');

  const { stderr } = await execFileAsync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--config', configPath],
    {
      cwd: appRoot,
      env: {
        ...process.env,
        TENANT_DATABASE_URL: databaseUrl,
      },
      maxBuffer: 1024 * 1024 * 20,
    },
  );

  if (stderr?.trim()) {
    // Prisma may log to stderr on success; non-zero exit throws above.
    console.warn(redactDatabaseUrlsFromOutput(stderr.trim()));
  }
}
