import { describe, it, expect } from 'vitest';
import { parseConfig, DEFAULT_BASE_URL, DEFAULT_API_VERSION } from '../src/config';
import { ApifoxError } from '../src/errors';

describe('parseConfig', () => {
  const env = { APIFOX_ACCESS_TOKEN: 'tok' } as NodeJS.ProcessEnv;

  it('使用默认 baseURL / apiVersion', () => {
    const cfg = parseConfig([], env);
    expect(cfg.accessToken).toBe('tok');
    expect(cfg.baseURL).toBe(DEFAULT_BASE_URL);
    expect(cfg.apiVersion).toBe(DEFAULT_API_VERSION);
    expect(cfg.defaultProjectId).toBeUndefined();
  });

  it('解析 --project=xxx', () => {
    expect(parseConfig(['--project=123'], env).defaultProjectId).toBe('123');
  });

  it('解析 --project xxx(空格分隔)', () => {
    expect(parseConfig(['--project', '456'], env).defaultProjectId).toBe('456');
  });

  it('解析 --base-url 与 --api-version', () => {
    const cfg = parseConfig(['--base-url=https://x.test', '--api-version', '2025-01-01'], env);
    expect(cfg.baseURL).toBe('https://x.test');
    expect(cfg.apiVersion).toBe('2025-01-01');
  });

  it('缺少 token 抛 ApifoxError', () => {
    expect(() => parseConfig([], {} as NodeJS.ProcessEnv)).toThrow(ApifoxError);
  });
});
