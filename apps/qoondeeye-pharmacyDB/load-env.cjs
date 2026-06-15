'use strict';

/**
 * Preload with: node -r ./load-env.cjs <command>
 * Must run before NestJS, Prisma, or any code reads process.env.
 */

const { config } = require('dotenv');
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname);

const ENV_FILES = {
  cloud: '.env',
  local: '.env.local',
};

function readProfile() {
  const fromEnv = process.env.BACKEND_ENV_PROFILE?.trim().toLowerCase();
  if (fromEnv === 'local' || fromEnv === 'cloud') {
    return fromEnv;
  }

  const profilePath = resolve(root, '.env.profile');
  if (existsSync(profilePath)) {
    const fromFile = readFileSync(profilePath, 'utf8').trim().toLowerCase();
    if (fromFile === 'local' || fromFile === 'cloud') {
      return fromFile;
    }
  }

  return 'cloud';
}

const profile = readProfile();
const envFile = ENV_FILES[profile];
const envPath = resolve(root, envFile);

if (!existsSync(envPath)) {
  console.warn(
    `[load-env] Missing ${envFile} for profile "${profile}". ` +
      `Create it or run: pnpm env:use:cloud / pnpm env:use:local`,
  );
} else {
  const result = config({ path: envPath });
  if (result.error) {
    console.warn(`[load-env] Failed to load ${envFile}:`, result.error.message);
  } else if (process.env.NODE_ENV !== 'test') {
    console.log(`[load-env] Loaded ${envFile} (profile: ${profile})`);
  }
}

process.env.BACKEND_ENV_PROFILE = profile;
