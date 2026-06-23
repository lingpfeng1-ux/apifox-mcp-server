/**
 * 接口(HTTP API)CRUD + 搜索能力。
 * 写操作带真实成功校验:不再靠"没抛异常"就报成功。
 *
 * 上下文优化:
 *  - list/search 默认返回索引字段(id/name/method/path/folderId),不返回完整结构。
 *  - get 默认返回精简字段(去 createdAt/creatorId/preProcessors 等噪音),raw=true 拿全量。
 * 注:Apifox /http-apis 服务端只支持 moduleId/ids 过滤,无服务端关键词搜索,
 * search() 在 MCP 层做内存过滤。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';
import { EndpointInput, HttpApi } from './types';

/** 接口索引(精简,用于列表/搜索) */
export interface EndpointIndex {
  id: number;
  name: string;
  method: string;
  path: string;
  folderId?: number;
}

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

/** get 精简模式保留的字段(AI 改接口真正需要的业务字段) */
const ENDPOINT_DETAIL_FIELDS = [
  'id', 'name', 'method', 'path', 'description', 'status', 'tags',
  'folderId', 'moduleId', 'parameters', 'commonParameters', 'requestBody',
  'responses', 'auth', 'security', 'serverId', 'operationId',
] as const;

export function pickEndpointFields(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of ENDPOINT_DETAIL_FIELDS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

function toIndex(api: HttpApi): EndpointIndex {
  return { id: api.id, name: api.name, method: api.method, path: api.path, folderId: api.folderId };
}

export class EndpointService {
  constructor(private readonly http: HttpClient) {}

  /** 拉取接口全量(完整字段;内部用) */
  private async fetchAll(projectId?: string | number, moduleId?: string | number): Promise<HttpApi[]> {
    const pid = this.http.resolveProjectId(projectId);
    const params: Record<string, any> = {};
    if (moduleId !== undefined && moduleId !== null && String(moduleId).trim() !== '') {
      params.moduleId = moduleId;
    }
    const body = await this.http.get(`/api/v1/projects/${pid}/http-apis`, params);
    return (body?.data ?? body) as HttpApi[];
  }

  /**
   * 接口列表(精简索引:id/name/method/path/folderId)。可按 moduleId 过滤。
   * 需要完整结构用 get();按关键词找接口用 search()。
   */
  async list(projectId?: string | number, moduleId?: string | number): Promise<EndpointIndex[]> {
    const all = await this.fetchAll(projectId, moduleId);
    return all.map(toIndex);
  }

  /**
   * 搜索接口:拉取后在 MCP 层按关键词/方法/目录过滤,返回精简索引。
   * 避免 AI 拿全量接口列表导致上下文爆炸。
   */
  async search(projectId?: string | number, params: SearchEndpointsParams = {}): Promise<EndpointIndex[]> {
    const all = await this.fetchAll(projectId, params.moduleId);
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

    return filtered.slice(0, limit).map(toIndex);
  }

  /**
   * 接口详情。默认返回精简字段(去掉 createdAt/creatorId/preProcessors 等噪音),
   * raw=true 时返回 Apifox 原始全量对象。
   */
  async get(apiId: number, projectId?: string | number, raw = false): Promise<Record<string, any>> {
    const pid = this.http.resolveProjectId(projectId);
    const body = await this.http.get(`/api/v1/projects/${pid}/http-apis/${apiId}`);
    const data = (body?.data ?? body) as Record<string, any>;
    return raw ? data : pickEndpointFields(data);
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
        // 仅 404 视为删除成功;其它错误(含"仍可查到"、302、空响应、网络错)一律重抛,
        // 不再默默当成功,避免误报删除结果。
        if (err instanceof ApifoxError && err.status === 404) return { deleted: true };
        throw err;
      }
    }
    return { deleted: true };
  }
}
