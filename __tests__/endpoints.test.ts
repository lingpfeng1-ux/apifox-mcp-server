import { describe, it, expect } from 'vitest';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpClient } from '../src/apifox/http';
import { EndpointService } from '../src/apifox/endpoints';
import { ImportExportService } from '../src/apifox/importExport';
import { ApifoxError } from '../src/errors';
import { AppConfig } from '../src/config';

const cfg: AppConfig = {
  accessToken: 'tok',
  defaultProjectId: '1',
  baseURL: 'https://api.test',
  apiVersion: '2024-03-28',
};

function endpointServiceWith(postData: unknown): EndpointService {
  const fake = {
    request: async (c: AxiosRequestConfig) =>
      (c.method || 'get').toLowerCase() === 'post'
        ? { status: 200, data: postData }
        : { status: 200, data: { data: {} } },
  } as unknown as AxiosInstance;
  return new EndpointService(new HttpClient(cfg, fake));
}

describe('EndpointService.create 成功校验', () => {
  it('返回含真实 id -> 成功', async () => {
    const svc = endpointServiceWith({ data: { id: 555, name: 'x' } });
    const r = await svc.create({ name: 'x', method: 'post', path: '/x' });
    expect(r.id).toBe(555);
  });

  it('返回不含 id -> 抛错', async () => {
    const svc = endpointServiceWith({ data: {} });
    await expect(svc.create({ name: 'x', method: 'post', path: '/x' })).rejects.toThrowError(/未返回有效 id/);
  });
});

describe('EndpointService 复杂字段透传', () => {
  /** 捕获实际发出的请求 body */
  function captureClient(): { svc: EndpointService; last: () => any } {
    let captured: any;
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        captured = c.data;
        return { status: 200, data: { data: { id: 7 } } };
      },
    } as unknown as AxiosInstance;
    return { svc: new EndpointService(new HttpClient(cfg, fake)), last: () => captured };
  }

  it('create 透传 parameters/requestBody/responses', async () => {
    const { svc, last } = captureClient();
    await svc.create({
      name: 'x',
      method: 'post',
      path: '/x',
      parameters: { query: [{ name: 'q' }] },
      requestBody: { type: 'application/json' },
      responses: [{ code: 200 }],
    });
    expect(last().parameters).toEqual({ query: [{ name: 'q' }] });
    expect(last().requestBody).toEqual({ type: 'application/json' });
    expect(last().responses).toEqual([{ code: 200 }]);
  });

  it('update 透传 parameters/responses', async () => {
    const { svc, last } = captureClient();
    await svc.update(5, { parameters: { query: [{ name: 'q' }] }, responses: [{ code: 201 }] });
    expect(last().parameters).toEqual({ query: [{ name: 'q' }] });
    expect(last().responses).toEqual([{ code: 201 }]);
  });
});

describe('EndpointService.get 精简/全量', () => {
  const RAW = {
    id: 1, name: 'x', method: 'POST', path: '/x', description: 'd', status: 'developing',
    tags: ['t'], folderId: 5, moduleId: 6, parameters: {}, requestBody: {}, responses: [],
    // 噪音字段
    createdAt: '2026', creatorId: 9, operationId: 'op', preProcessors: [], advancedSettings: {},
  };
  function svc(): EndpointService {
    const fake = {
      request: async () => ({ status: 200, data: { data: RAW } }),
    } as unknown as AxiosInstance;
    return new EndpointService(new HttpClient(cfg, fake));
  }

  it('默认精简:保留业务字段,去掉噪音', async () => {
    const r = await svc().get(1);
    expect(r.name).toBe('x');
    expect(r.parameters).toBeDefined();
    expect((r as any).createdAt).toBeUndefined();
    expect((r as any).creatorId).toBeUndefined();
    expect((r as any).preProcessors).toBeUndefined();
  });

  it('raw=true 返回全量', async () => {
    const r = await svc().get(1, undefined, true);
    expect((r as any).createdAt).toBe('2026');
    expect((r as any).preProcessors).toEqual([]);
  });
});

function importServiceWith(data: unknown): ImportExportService {
  const fake = {
    request: async () => ({ status: 200, data }),
  } as unknown as AxiosInstance;
  return new ImportExportService(new HttpClient(cfg, fake));
}

describe('ImportExportService.importOpenAPI 统计校验', () => {
  it('创建数 > 0 -> 返回 summary', async () => {
    const svc = importServiceWith({
      data: { apiCollection: { item: { createCount: 1, updateCount: 0 }, folder: { createCount: 1 } } },
    });
    const s = await svc.importOpenAPI('{"openapi":"3.0.1"}');
    expect(s.endpointCreateCount).toBe(1);
    expect(s.folderCreateCount).toBe(1);
  });

  it('全部为 0 -> 抛错(避免假成功)', async () => {
    const svc = importServiceWith({
      data: { apiCollection: { item: { createCount: 0, updateCount: 0 }, folder: { createCount: 0 } } },
    });
    await expect(svc.importOpenAPI('{}')).rejects.toThrowError(ApifoxError);
  });

  it('schemaOverwriteMode 透传,且仅模型更新也算成功', async () => {
    let body: any;
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        body = c.data;
        return { status: 200, data: { data: { schemaCollection: { item: { createCount: 0, updateCount: 1 } } } } };
      },
    } as unknown as AxiosInstance;
    const svc = new ImportExportService(new HttpClient(cfg, fake));
    const s = await svc.importOpenAPI('{}', { schemaOverwriteMode: 'name', apiOverwriteMode: 'methodAndPath' });
    expect(body.schemaOverwriteMode).toBe('name');
    expect(body.apiOverwriteMode).toBe('methodAndPath');
    expect(s.schemaUpdateCount).toBe(1);
  });
});
