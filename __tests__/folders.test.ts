import { describe, it, expect } from 'vitest';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { HttpClient } from '../src/apifox/http';
import { ProjectService } from '../src/apifox/projects';
import { EndpointService } from '../src/apifox/endpoints';
import { ImportExportService } from '../src/apifox/importExport';
import { FolderService } from '../src/apifox/folders';
import { AppConfig } from '../src/config';

const cfg: AppConfig = {
  accessToken: 'tok',
  defaultProjectId: '1',
  baseURL: 'https://api.test',
  apiVersion: '2024-03-28',
};

const MODULES = [{ id: 1, name: 'ModA' }];
const APIS = [
  { id: 10, method: 'post', path: '/a/ping', folderId: 111 },
  { id: 11, method: 'get', path: '/b/list', folderId: 222 },
];
const OPENAPI = {
  paths: {
    '/a/ping': { post: { 'x-apifox-folder': 'FolderA' } },
    '/b/list': { get: { 'x-apifox-folder': 'Parent/FolderB' } },
  },
};

function buildFolderService(): FolderService {
  const fake = {
    request: async (c: AxiosRequestConfig) => {
      const url = c.url || '';
      const method = (c.method || 'get').toLowerCase();
      if (url.endsWith('/modules')) return { status: 200, data: { data: MODULES } };
      if (url.includes('/http-apis')) return { status: 200, data: { data: APIS } };
      if (url.endsWith('/export-openapi') && method === 'post') return { status: 200, data: OPENAPI };
      return { status: 404, data: { errorMessage: 'not found' } };
    },
  } as unknown as AxiosInstance;

  const http = new HttpClient(cfg, fake);
  const projects = new ProjectService(http);
  const endpoints = new EndpointService(http);
  const ie = new ImportExportService(http);
  return new FolderService(http, projects, endpoints, ie);
}

describe('FolderService.listFolders', () => {
  it('关联 export + http-apis 得到目录列表', async () => {
    const folders = await buildFolderService().listFolders('ModA');
    expect(folders).toHaveLength(2);
    const a = folders.find((f) => f.folderId === 111)!;
    expect(a.folderName).toBe('FolderA');
    const b = folders.find((f) => f.folderId === 222)!;
    expect(b.folderName).toBe('FolderB'); // 取多级路径最后一段
    expect(b.folderPath).toBe('Parent/FolderB');
  });
});

describe('FolderService.findFolder', () => {
  it('精确匹配目录名', async () => {
    const r = await buildFolderService().findFolder('ModA', 'FolderA');
    expect(r.folderId).toBe(111);
    expect(r.moduleId).toBe(1);
    expect(r.projectId).toBe('1');
  });

  it('多级路径用最后一段匹配', async () => {
    const r = await buildFolderService().findFolder('ModA', 'FolderB');
    expect(r.folderId).toBe(222);
  });

  it('模块名大小写/空格宽松匹配', async () => {
    const r = await buildFolderService().findFolder('  moda ', 'FolderA');
    expect(r.moduleId).toBe(1);
  });

  it('目录不存在 -> 抛错并列出可用目录', async () => {
    await expect(buildFolderService().findFolder('ModA', 'Nope')).rejects.toThrowError(/未找到目录/);
  });
});
