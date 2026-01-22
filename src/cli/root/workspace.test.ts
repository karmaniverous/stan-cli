import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { asEsmModule } from '@/test/mock-esm';

// Mock fast-glob
const fgMock = vi.fn();
vi.mock('fast-glob', () =>
  asEsmModule({
    default: fgMock,
  }),
);

import { resolveWorkspace } from './workspace';

describe('resolveWorkspace', () => {
  it('resolves a valid directory path immediately', async () => {
    // We'll use the temp dir from test context if we were using setup, but here
    // we can just use the current process cwd since we are mocking/checking specific paths
    // or create a temp dir to satisfy "isDir" checks.
    // For simplicity, let's assume we are in a test env where we can create dirs.
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-ws-test-'));

    try {
      const target = path.join(cwd, 'subdir');
      await mkdir(target);
      const res = await resolveWorkspace(cwd, 'subdir');
      expect(res).toBe(target);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('resolves a package name from pnpm-workspace.yaml', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-ws-pnpm-'));

    try {
      await writeFile(
        path.join(cwd, 'pnpm-workspace.yaml'),
        'packages:\n  - "pkgs/*"',
      );

      // Mock fg to return the package.json path
      const pkgJsonPath = path.join(cwd, 'pkgs', 'a', 'package.json');
      fgMock.mockResolvedValueOnce([pkgJsonPath]);

      // Write the package.json so readJson works
      await mkdir(path.dirname(pkgJsonPath), { recursive: true });
      await writeFile(pkgJsonPath, JSON.stringify({ name: '@scope/a' }));

      const res = await resolveWorkspace(cwd, '@scope/a');
      expect(res).toBe(path.dirname(pkgJsonPath));

      // verify fg called with pattern
      expect(fgMock).toHaveBeenCalledWith(
        [path.join('pkgs/*', 'package.json').replace(/\\/g, '/')],
        expect.objectContaining({ cwd }),
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('resolves a package name from package.json workspaces', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-ws-npm-'));

    try {
      await writeFile(
        path.join(cwd, 'package.json'),
        JSON.stringify({ workspaces: ['libs/*'] }),
      );

      const pkgJsonPath = path.join(cwd, 'libs', 'b', 'package.json');
      fgMock.mockResolvedValueOnce([pkgJsonPath]);

      await mkdir(path.dirname(pkgJsonPath), { recursive: true });
      await writeFile(pkgJsonPath, JSON.stringify({ name: 'lib-b' }));

      const res = await resolveWorkspace(cwd, 'lib-b');
      expect(res).toBe(path.dirname(pkgJsonPath));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('returns null if no match found', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const cwd = await mkdtemp(path.join(tmpdir(), 'stan-ws-none-'));

    try {
      const res = await resolveWorkspace(cwd, 'non-existent');
      expect(res).toBeNull();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
