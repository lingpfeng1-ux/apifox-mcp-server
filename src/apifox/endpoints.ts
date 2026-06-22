/**
 * 接口(HTTP API)CRUD 能力。
 * 写操作带真实成功校验:不再靠"没抛异常"就报成功。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';
import { EndpointInput, HttpApi } from './types';

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
    // 复杂结构原样透传(调用方可先 get 拿现有结构再改)
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
        if (err instanceof ApifoxError && err.status === 404) {
          // 预期:删除后查不到
          return { deleted: true };
        }
        if (err instanceof ApifoxError && err.message.includes('仍可查到')) throw err;
        // 其它错误(如 404 以外)忽略,视为已删
      }
    }
    return { deleted: true };
  }
}
