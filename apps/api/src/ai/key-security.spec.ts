import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// AC-08: the Groq key appears neither in the browser code nor in the Git repository.
const root = resolve(__dirname, '../../../..');
// Built from pieces so this file does not match its own search.
const KEY_PATTERN = new RegExp('gs' + 'k_[A-Za-z0-9]{20,}');
const realKey = (): string | null => {
  const k = process.env.GROQ_API_KEY ?? '';
  return k.length > 12 && !k.startsWith('test-key') ? k : null;
};

const tracked = (): string[] =>
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const read = (file: string): string | null => {
  const path = join(root, file);
  if (!existsSync(path) || statSync(path).size > 2_000_000) return null;
  return readFileSync(path, 'latin1');
};
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );

describe('Groq key never leaves the server (AC-08)', () => {
  it('no Groq key (gsk_...) in any file tracked by Git', () => {
    const hits = tracked().filter((f) => KEY_PATTERN.test(read(f) ?? ''));
    expect(hits).toEqual([]);
  });

  it('the real key from the local .env (if any) is in no tracked file', () => {
    const key = realKey();
    if (!key) return;
    expect(tracked().filter((f) => (read(f) ?? '').includes(key))).toEqual([]);
  });

  it('.env files are ignored by Git and only .env.example files are tracked', () => {
    expect(() =>
      execFileSync('git', ['check-ignore', '-q', 'apps/api/.env'], { cwd: root }),
    ).not.toThrow();
    const envFiles = tracked().filter((f) => /(^|\/)\.env(\..+)?$/.test(f));
    expect(envFiles.every((f) => f.endsWith('.env.example'))).toBe(true);
  });

  it('the web source never reads a Groq variable or imports the SDK', () => {
    const web = tracked().filter(
      (f) =>
        f.startsWith('apps/web/') && /\.(ts|tsx|mjs|js|json)$/.test(f) && !f.includes('messages/'),
    );
    const bad = web.filter((f) =>
      /process\.env\.(NEXT_PUBLIC_)?GROQ|NEXT_PUBLIC_GROQ|groq-sdk/.test(read(f) ?? ''),
    );
    expect(bad).toEqual([]);
  });

  it('the built web bundle (if built) has no key, no Groq variable name and no SDK', () => {
    const dir = join(root, 'apps/web/.next/static');
    if (!existsSync(dir)) return; // run `pnpm build` first to include this check
    const bad = walk(dir).filter((f) => {
      const text = readFileSync(f, 'latin1');
      return (
        KEY_PATTERN.test(text) ||
        text.includes('GROQ_API_KEY') ||
        text.includes('groq-sdk') ||
        (realKey() !== null && text.includes(realKey() as string))
      );
    });
    expect(bad).toEqual([]);
  });

  it('only the API reads the key (no other app or package)', () => {
    const users = tracked().filter(
      (f) =>
        !f.startsWith('apps/api/') &&
        !f.endsWith('.md') &&
        !f.includes('.env.example') &&
        !f.includes('CLAUDE.md') &&
        /\.(ts|tsx|mjs|js)$/.test(f) &&
        /process\.env\.GROQ_API_KEY/.test(read(f) ?? ''),
    );
    expect(users).toEqual([]);
  });
});
