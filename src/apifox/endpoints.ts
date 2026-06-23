/**
 * 接口(HTTP API)CRUD + 搜索能力。
 * 写操作带真实成功校验:不再靠"没抛异常"就报成功。
 *
 * 注:Apifox /http-apis 服务端只支持 moduleId/ids 过滤,无服务端关键词搜索。
 * search() 在 MCP 层做内存过滤,避免 AI 拿全量列表导致上下文爆炸。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';
import { EndpointInput, HttpApi } from './types';

export interface SearchEndpointsParams {
  /** 关键词:匹配接口名称或路径(不区分大小写) */
  keyword?: string;
  /** 按 HTTP 方法过滤(GET/POST/PUT/DELETE/PATCH) */
  method?: string;
  /** 按 folderId 过滤 */
  folderId?: number;
  /** 模块 ID */
  moduleId?: string | number;
  /** 最多返回条数,默认 20,最大 100 */
  limit?: number;
}

export class EndpointService {
  constructor(private readonly http: HttpClient) {}

  /** 接口列表,可按 moduleId 过滤(模块化项目需要 moduleId 才能拿到对应接口) */
  async list(projectId?: string | number, moduleId?: string | number): Promise<HttpApi[]> {
    const pid = this.http.resolveProjectId(projectId);
    const params: Record<string, any> = {};
    if (moduleId !== undefined && moduleId !== null && String(moduleId).trim() !== '') {
      params.moduleId = moduleId;
    }
    const body = await this.http.get(`/api/v1/projects/${pid}/http-apis`, params);
    return (body?.data ?? body) as HttpApi[];
  }

  /**
   * 搜索接口:先拉取指定模块下的列表,再在 MCP 层按关键词/方法/目录过滤。
   * 避免 AI 拿全量接口列表导致上下文爆炸。
   * 返回精简字段(id/name/method/path/folderId),需要完整详情再用 get()。
   */
  async search(
    projectId?: string | number,
    params: SearchEndpointsParams = {}
  ): Promise<Pick<HttpApi, 'id' | 'name' | 'method' | 'path' | 'folderId'>[]> {
    const all = await this.list(projectId, params.moduleId);
    const keyword = params.keyword?.toLowerCase();
    const method = params.method?.toUpperCase();
    const limit = Math.min(params.limit ?? 20, 100);

    const filtered = all.filter((api) => {
      if (method && api.method?.toUpperCase() !== method) return false;
      if (params.folderId != null && api.folderId !== params.folderId) return false;
      if (keyword) {
        const nameMatch = api.name?.toLowerCase().includes(keyword);
        const pathMatch = api.path?.toLowerCase().includes(keyword);
        if (!nameMatch && !pathMatch) return false;
      }
      return true;
    });

    return filtered.slice(0, limit).map(({ id, name, method, path, folderId }) => ({
      id, name, method, path, folderId,
    }));
  }

  /** 接口详情 */
  async get(apiId: number, projectId?: string | number): Promise<HttpApi> {
    const pid = this.http.resolveProjectId(projectId);
    const body = await this.http.get(`/api/v1/projects/${pid}/http-apis/${apiId}`);
    return (body?.data ?? body) as HttpApi;
  }

  /** 创建接口,校验返回真实 id */
  async create(input: EndpointInput, projectId?: string | number): Promise<HttpApi> {
    const pid = this.http.resolveProjectId(projectId);
    const payload: Record<string, any> = {
      name: input.name,
      method: input.method.toUpperCase(),
      path: input.path,
      folderId: input.folderId ?? 0,
      status: input.status || 'developing',
      description: input.description || '',
      tags: input.tags || [],
    };
    if (input.parameters !== undefined) payload.parameters = input.parameters;
    if (input.requestBody !== undefined) payload.requestBody = input.requestBody;
    if (input.responses !== undefined) payload.responses = input.responses;

    const body = await this.http.post(`/api/v1/projects/${pid}/http-apis`, payload);
    const data = (body?.data ?? body) as HttpApi;
    if (!data || data.id == null) {
      throw new ApifoxError('创建接口未返回有效 id,可能创建失败', { endpoint: 'http-apis' });
    }
    return data;
  }

  /** 更新接口 */
  async update(apiId: number, patch: Partial<EndpointInput>, projectId?: string | number): Promise<HttpApi> {
    const pid = this.http.resolveProjectId(projectId);
    const payload: Record<string, any> = { ...patch };
    if (patch.method) payload.method = patch.method.toUpperCase();
    const body = await this.http.put(`/api/v1/projects/${pid}/http-apis/${apiId}`, payload);
    return (body?.data ?? body) as HttpApi;
  }

  /**
   * 删除接口。verify=true 时删除后回查确认(查到则抛错)。
   */
  async remove(apiId: number, projectId?: string | number, verify = false): Promise<{ deleted: true }> {
    const pid = this.http.resolveProjectId(projectId);
    await this.http.delete(`/api/v1/projects/${pid}/http-apis/${apiId}`);
    if (verify) {
      try {
        await this.get(apiId, pid);
        throw new ApifoxError(`删除后接口 ${apiId} 仍可查到,删除可能失败`, { endpoint: 'http-apis' });
      } catch (err) {
        if (err instanceof ApifoxError && err.status === 404) return { deleted: true };
        if (err instanceof ApifoxError && err.message.includes('仍可查到')) throw err;
      }
    }
    return { deleted: true };
  }
}

