import { describe, it, expect } from 'vitest';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpClient } from '../src/apifox/http';
import { SchemaService } from '../src/apifox/schemas';
import { ApifoxError } from '../src/errors';
import { AppConfig } from '../src/config';

const cfg: AppConfig = {
  accessToken: 'tok',
  defaultProjectId: '1',
  baseURL: 'https://api.test',
  apiVersion: '2024-03-28',
};

const SCHEMAS = [
  { id: 1, name: 'UserReq', folderId: 10, description: '用户请求', jsonSchema: { type: 'object' }, creatorId: 9 },
  { id: 2, name: 'UserResp', folderId: 10, description: '用户响应', jsonSchema: { type: 'object' } },
  { id: 3, name: 'OrderReq', folderId: 20, jsonSchema: { type: 'object' } },
];

function svcReturning(data: unknown[], capture?: (c: AxiosRequestConfig) => void): SchemaService {
  const fake = {
    request: async (c: AxiosRequestConfig) => {
      capture?.(c);
      return { status: 200, data: { data } };
    },
  } as unknown as AxiosInstance;
  return new SchemaService(new HttpClient(cfg, fake));
}

describe('SchemaService.list 精简索引', () => {
  it('默认只返回 id/name/folderId/description,不含 jsonSchema', async () => {
    let url = '';
    const svc = svcReturning(SCHEMAS, (c) => { url = c.url || ''; });
    const r = await svc.list();
    expect(url).toBe('/api/v1/projects/1/data-schemas');
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ id: 1, name: 'UserReq', folderId: 10, description: '用户请求' });
    expect((r[0] as any).jsonSchema).toBeUndefined();
    expect((r[0] as any).creatorId).toBeUndefined();
  });

  it('keyword 过滤(匹配名/描述)', async () => {
    const svc = svcReturning(SCHEMAS);
    const r = await svc.list(undefined, { keyword: 'user' });
    expect(r.map((s) => s.name)).toEqual(['UserReq', 'UserResp']);
  });
});

describe('SchemaService.get 单模型详情', () => {
  it('按名称返回完整 jsonSchema', async () => {
    const svc = svcReturning(SCHEMAS);
    const r = await svc.get('UserReq');
    expect(r.id).toBe(1);
    expect(r.jsonSchema).toEqual({ type: 'object' });
  });

  it('按 id 定位', async () => {
    const svc = svcReturning(SCHEMAS);
    const r = await svc.get(2);
    expect(r.name).toBe('UserResp');
  });

  it('找不到抛错', async () => {
    const svc = svcReturning(SCHEMAS);
    await expect(svc.get('Nope')).rejects.toThrowError(ApifoxError);
  });
});

describe('SchemaService.remove', () => {
  it('删除走全局端点并带 X-Project-Id header', async () => {
    let url = '', method = '', headers: any;
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        url = c.url || ''; method = c.method || ''; headers = c.headers;
        return { status: 200, data: { success: true, data: null } };
      },
    } as unknown as AxiosInstance;
    const svc = new SchemaService(new HttpClient(cfg, fake));
    const r = await svc.remove(123, 1);
    expect(method).toBe('delete');
    expect(url).toBe('/api/v1/api-schemas/123');
    expect(headers['X-Project-Id']).toBe('1');
    expect(r).toEqual({ deleted: true });
  });
});
