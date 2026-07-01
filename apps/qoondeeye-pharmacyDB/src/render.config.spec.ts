import * as fs from 'fs';
import * as path from 'path';

// render.yaml lives at the repository root, three directories above src/
const RENDER_YAML_PATH = path.join(__dirname, '..', '..', '..', 'render.yaml');

function readRenderYaml(): string {
  return fs.readFileSync(RENDER_YAML_PATH, 'utf-8');
}

describe('render.yaml — Render Blueprint contract', () => {
  let content: string;
  let lines: string[];

  beforeAll(() => {
    content = readRenderYaml();
    lines = content.split('\n');
  });

  describe('file existence', () => {
    it('exists at the repository root', () => {
      expect(fs.existsSync(RENDER_YAML_PATH)).toBe(true);
    });

    it('is non-empty', () => {
      expect(content.trim().length).toBeGreaterThan(0);
    });
  });

  describe('service definition', () => {
    it('defines at least one service', () => {
      expect(content).toMatch(/^services:/m);
    });

    it('service type is "web"', () => {
      expect(content).toMatch(/^\s+type:\s+web\s*$/m);
    });

    it('service name is "qoondeeye-pharmacy-api"', () => {
      expect(content).toMatch(/^\s+name:\s+qoondeeye-pharmacy-api\s*$/m);
    });

    it('runtime is "docker"', () => {
      expect(content).toMatch(/^\s+runtime:\s+docker\s*$/m);
    });
  });

  describe('Docker context — monorepo root requirement', () => {
    it('sets dockerContext to "." (repo root, not a subdirectory)', () => {
      expect(content).toMatch(/^\s+dockerContext:\s+\.\s*$/m);
    });

    it('does not point dockerContext to apps/qoondeeye-pharmacyDB', () => {
      expect(content).not.toMatch(/dockerContext:\s+apps\/qoondeeye-pharmacyDB/);
    });

    it('sets dockerfilePath to the root Dockerfile', () => {
      expect(content).toMatch(/^\s+dockerfilePath:\s+\.\/Dockerfile\s*$/m);
    });

    it('does not point dockerfilePath to the app-level Dockerfile', () => {
      expect(content).not.toMatch(
        /dockerfilePath:\s+apps\/qoondeeye-pharmacyDB\/Dockerfile/,
      );
    });
  });

  describe('rootDir constraint', () => {
    it('does not set rootDir (would break the monorepo Docker build)', () => {
      // rootDir must not appear; Render would restrict the build context
      // to the subdirectory, causing "COPY ... not found" errors.
      const nonCommentLines = lines.filter(
        (l) => !l.trimStart().startsWith('#'),
      );
      const hasRootDir = nonCommentLines.some((l) =>
        /^\s+rootDir:/.test(l),
      );
      expect(hasRootDir).toBe(false);
    });
  });

  describe('buildFilter paths', () => {
    it('includes the app directory', () => {
      expect(content).toMatch(/apps\/qoondeeye-pharmacyDB/);
    });

    it('includes pnpm-lock.yaml to trigger rebuilds on dependency changes', () => {
      expect(content).toContain('pnpm-lock.yaml');
    });

    it('includes pnpm-workspace.yaml', () => {
      expect(content).toContain('pnpm-workspace.yaml');
    });

    it('includes root Dockerfile', () => {
      // Must be listed as a plain "Dockerfile" path (repo root), not a subdirectory path
      const dockerfileLine = lines.find(
        (l) => l.trim() === '- Dockerfile',
      );
      expect(dockerfileLine).toBeDefined();
    });

    it('includes .dockerignore', () => {
      expect(content).toContain('.dockerignore');
    });

    it('includes root package.json', () => {
      expect(content).toContain('package.json');
    });

    it('includes .npmrc', () => {
      expect(content).toContain('.npmrc');
    });

    it('includes the shared validation package', () => {
      expect(content).toMatch(/packages\/validation/);
    });

    it('includes the shared typescript-config package', () => {
      expect(content).toMatch(/packages\/typescript-config/);
    });
  });

  describe('environment variables', () => {
    it('declares DATABASE_URL', () => {
      expect(content).toMatch(/key:\s+DATABASE_URL/);
    });

    it('declares JWT_SECRET', () => {
      expect(content).toMatch(/key:\s+JWT_SECRET/);
    });

    it('declares CORS_ORIGIN', () => {
      expect(content).toMatch(/key:\s+CORS_ORIGIN/);
    });

    it('sets sync: false for DATABASE_URL (no hardcoded secret)', () => {
      // Locate the DATABASE_URL block and verify sync: false follows
      const dbIndex = lines.findIndex((l) => /key:\s+DATABASE_URL/.test(l));
      expect(dbIndex).toBeGreaterThan(-1);
      const surroundingBlock = lines.slice(dbIndex, dbIndex + 3).join('\n');
      expect(surroundingBlock).toMatch(/sync:\s+false/);
    });

    it('sets sync: false for JWT_SECRET (no hardcoded secret)', () => {
      const jwtIndex = lines.findIndex((l) => /key:\s+JWT_SECRET/.test(l));
      expect(jwtIndex).toBeGreaterThan(-1);
      const surroundingBlock = lines.slice(jwtIndex, jwtIndex + 3).join('\n');
      expect(surroundingBlock).toMatch(/sync:\s+false/);
    });

    it('sets sync: false for CORS_ORIGIN (no hardcoded secret)', () => {
      const corsIndex = lines.findIndex((l) => /key:\s+CORS_ORIGIN/.test(l));
      expect(corsIndex).toBeGreaterThan(-1);
      const surroundingBlock = lines.slice(corsIndex, corsIndex + 3).join('\n');
      expect(surroundingBlock).toMatch(/sync:\s+false/);
    });

    it('does not hardcode any env var value in the file', () => {
      // None of the env var entries should have a `value:` field
      const envVarValueLine = lines.find((l) =>
        /^\s+value:\s+\S/.test(l),
      );
      expect(envVarValueLine).toBeUndefined();
    });
  });

  describe('YAML structure integrity', () => {
    it('is parseable as valid YAML (no tab characters)', () => {
      // YAML forbids literal tab indentation
      const tabLines = lines.filter((l) => /^\t/.test(l));
      expect(tabLines).toHaveLength(0);
    });

    it('uses consistent 2-space indentation for top-level fields', () => {
      // Services entries are indented with 2 spaces
      const serviceEntryLines = lines.filter((l) => /^  - type:/.test(l));
      expect(serviceEntryLines.length).toBeGreaterThan(0);
    });

    it('does not contain Windows-style line endings', () => {
      expect(content).not.toContain('\r\n');
    });
  });
});
