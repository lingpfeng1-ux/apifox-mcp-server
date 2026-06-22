import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AxiosInstance } from 'axios';
import { HttpClient } from '../src/apifox/http';
import { ApifoxError } from '../src/errors';
import { AppConfig } from '../src/config';

const baseConfig: AppConfig = {
  accessToken: 'tok',
  baseURL: 'https://api.test',
  apiVersion: '2024-03-28',
};

/** 构造注入 fake axios 实例的 HttpClient,实例直接返回给定的 {status,data} */
function clientReturning(status: number, data: unknown, cfgOverride: Partial<AppConfig> = {}): HttpClient {
  const fake = {
    request: async () => ({ status, data }),
  } as unknown as AxiosInstance;
  return new HttpClient({ ...baseConfig, ...cfgOverride }, fake);
}

describe('HttpClient.request 状态处理', () => {
  it('2xx 正常返回 body', async () => {
    const c = clientReturning(200, { success: true, data: [1, 2] });
    await expect(c.get('/x')).resolves.toEqual({ success: true, data: [1, 2] });
  });

  it('302 重定向 -> 抛端点不可用', async () => {
    const c = clientReturning(302, '');
    await expect(c.get('/x')).rejects.toThrowError(/302 重定向/);
  });

  it('200 空 body -> 抛端点不可用', async () => {
    const c = clientReturning(200, '');
    await expect(c.get('/x')).rejects.toThrowError(/返回空响应/);
  });

  it('4xx -> 抛 Apifox API 错误(带 errorMessage)', async () => {
    const c = clientReturning(422, { success: false, errorCode: '422001', errorMessage: 'Invalid Parameter' });
    await expect(c.get('/x')).rejects.toThrowError(/Invalid Parameter/);
  });

  it('错误对象为 ApifoxError 且带 status', async () => {
    const c = clientReturning(404, { errorMessage: 'Not found' });
    await c.get('/x').catch((e) => {
      expect(e).toBeInstanceOf(ApifoxError);
      expect((e as ApifoxError).status).toBe(404);
    });
  });
});

describe('HttpClient.resolveProjectId 优先级', () => {
  const original = process.env.APIFOX_PROJECT_ID;
  beforeEach(() => {
    delete process.env.APIFOX_PROJECT_ID;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.APIFOX_PROJECT_ID;
    else process.env.APIFOX_PROJECT_ID = original;
  });

  it('调用参数优先级最高', () => {
    const c = new HttpClient({ ...baseConfig, defaultProjectId: 'def' });
    process.env.APIFOX_PROJECT_ID = 'env';
    expect(c.resolveProjectId(999)).toBe('999');
  });

  it('其次用默认 projectId', () => {
    const c = new HttpClient({ ...baseConfig, defaultProjectId: 'def' });
    expect(c.resolveProjectId()).toBe('def');
  });

  it('再次用环境变量', () => {
    const c = new HttpClient({ ...baseConfig });
    process.env.APIFOX_PROJECT_ID = 'env';
    expect(c.resolveProjectId()).toBe('env');
  });

  it('全无 -> 抛 ApifoxError', () => {
    const c = new HttpClient({ ...baseConfig });
    expect(() => c.resolveProjectId()).toThrow(ApifoxError);
  });
});
