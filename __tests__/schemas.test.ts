import { describe, it, expect } from 'vitest';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpClient } from '../src/apifox/http';
import { SchemaService } from '../src/apifox/schemas';
import { AppConfig } from '../src/config';

const cfg: AppConfig = {
  accessToken: 'tok',
  defaultProjectId: '1',
  baseURL: 'https://api.test',
  apiVersion: '2024-03-28',
};

describe('SchemaService.list', () => {
  it('请求 /data-schemas 并返回模型列表', async () => {
    let url = '';
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        url = c.url || '';
        return { status: 200, data: { data: [{ id: 1, name: 'A' }] } };
      },
    } as unknown as AxiosInstance;
    const svc = new SchemaService(new HttpClient(cfg, fake));
    const r = await svc.list();
    expect(url).toBe('/api/v1/projects/1/data-schemas');
    expect(r).toEqual([{ id: 1, name: 'A' }]);
  });

  it('带 moduleId 过滤', async () => {
    let params: any;
    const fake = {
      request: async (c: AxiosRequestConfig) => {
        params = c.params;
        return { status: 200, data: { data: [] } };
      },
    } as unknown as AxiosInstance;
    await new SchemaService(new HttpClient(cfg, fake)).list(undefined, 99);
    expect(params).toEqual({ moduleId: 99 });
  });
});
