import { describe, it, expect } from 'vitest';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpClient } from '../src/apifox/http';
import { SchemaService } from '../src/apifox/schemas';
import { ImportExportService } from '../src/apifox/importExport';
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

function schemaService(fake: AxiosInstance): SchemaService {
  const http = new HttpClient(cfg, fake);
  return new SchemaService(http, new ImportExportService(http));
}

function svcReturning(data: unknown[], capture?: (c: AxiosRequestConfig) => void): SchemaService {
  const fake = {
    request: async (c: AxiosRequestConfig) => {
      capture?.(c);
      return { status: 200, data: { data } };
    },
  } as unknown as AxiosInstance;
  return schemaService(fake);
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
    const svc = schemaService(fake);
    const r = await svc.remove(123, 1);
    expect(method).toBe('delete');
    expect(url).toBe('/api/v1/api-schemas/123');
    expect(headers['X-Project-Id']).toBe('1');
    expect(r).toEqual({ deleted: true });
  });
});

describe('SchemaService.upsert / update', () => {
  it('upsert 组装最小 OpenAPI 并带 schemaOverwriteMode=name,返回 id/created', async () => {
    let body: any;
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        const url = c.url || '';
        // 回查 id 的 GET
        if ((c.method || 'get').toLowerCase() === 'get' && url.endsWith('/data-schemas')) {
          return { status: 200, data: { data: [{ id: 999, name: 'UserReq', jsonSchema: {} }] } };
        }
        body = c.data; // import 的 POST body
        return { status: 200, data: { data: { schemaCollection: { item: { createCount: 1, updateCount: 0 } } } } };
      },
    } as unknown as AxiosInstance;
    const svc = schemaService(fake);
    const r = await svc.upsert('UserReq', { type: 'object', required: ['name'] });
    expect(body.importFormat).toBe('openapi');
    expect(body.schemaOverwriteMode).toBe('name');
    expect(JSON.parse(body.data).components.schemas.UserReq).toEqual({ type: 'object', required: ['name'] });
    // 返回精简明确结果
    expect(r).toEqual({ name: 'UserReq', id: 999, created: true, updated: false });
  });

  it('update 按 id 精确 PUT(带 X-Project-Id),不走按名 import', async () => {
    let putUrl = '', putHeaders: any, putBody: any;
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        const url = c.url || '';
        const method = (c.method || 'get').toLowerCase();
        if (method === 'get' && url.endsWith('/data-schemas')) {
          return { status: 200, data: { data: SCHEMAS } };
        }
        if (method === 'put') {
          putUrl = url; putHeaders = c.headers; putBody = c.data;
          return { status: 200, data: { data: { id: 2, name: 'UserResp', jsonSchema: c.data.jsonSchema } } };
        }
        return { status: 404, data: { errorMessage: 'x' } };
      },
    } as unknown as AxiosInstance;
    const svc = schemaService(fake);
    const r = await svc.update(2, { type: 'object', properties: { id: { type: 'integer' } } }, 1);
    expect(putUrl).toBe('/api/v1/api-schemas/2');     // 精确到 id=2,非按名
    expect(putHeaders['X-Project-Id']).toBe('1');
    expect(putBody.jsonSchema).toEqual({ type: 'object', properties: { id: { type: 'integer' } } });
    expect(r.id).toBe(2);
  });

  it('传名称且有多个同名时报错并列出 id', async () => {
    const dup = [
      { id: 100, name: 'Dup', moduleId: 1, jsonSchema: {} },
      { id: 200, name: 'Dup', moduleId: 2, jsonSchema: {} },
    ];
    const svc = svcReturning(dup);
    await expect(svc.update('Dup', { type: 'object' })).rejects.toThrowError(/请改用 id 精确指定/);
  });
});
