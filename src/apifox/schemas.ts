/**
 * 数据模型(data schema)能力。
 *
 * 端点说明(personal token 实测 + 逆向 Apifox 客户端):
 *  - GET  /api/v1/projects/{id}/data-schemas        可用(读模型列表)
 *  - POST/PUT/PATCH /api/v1/projects/{id}/data-schemas  302 不可用
 *  - DELETE /api/v1/api-schemas/{id}                可用(全局端点,需带 X-Project-Id header)
 * 创建/更新模型请用 import_openapi(components.schemas + schemaOverwriteMode)。
 *
 * 上下文优化:list 默认只返回索引字段(id/name/folderId),不带 jsonSchema;
 * 取单个模型完整结构用 get();全量模型列表带 jsonSchema 很大(实测百余模型近 100KB)。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';

export interface DataSchema {
  id: number;
  name: string;
  displayName?: string;
  jsonSchema?: unknown;
  folderId?: number;
  moduleId?: number;
  description?: string;
}

/** 模型索引(精简,用于列表/搜索,不含 jsonSchema) */
export interface SchemaIndex {
  id: number;
  name: string;
  folderId?: number;
  description?: string;
}

export interface ListSchemasParams {
  moduleId?: string | number;
  /** 关键词:匹配模型名/描述(不区分大小写) */
  keyword?: string;
  /** 最多返回条数,默认 50,最大 200 */
  limit?: number;
}

export class SchemaService {
  constructor(private readonly http: HttpClient) {}

  /** 拉取项目全部数据模型(完整,含 jsonSchema;内部用) */
  private async fetchAll(projectId?: string | number, moduleId?: string | number): Promise<DataSchema[]> {
    const pid = this.http.resolveProjectId(projectId);
    const params: Record<string, any> = {};
    if (moduleId !== undefined && moduleId !== null && String(moduleId).trim() !== '') {
      params.moduleId = moduleId;
    }
    const body = await this.http.get(`/api/v1/projects/${pid}/data-schemas`, params);
    return (body?.data ?? body) as DataSchema[];
  }

  /**
   * 列出数据模型索引(精简:id/name/folderId/description,不含 jsonSchema)。
   * 支持 keyword 过滤,避免一次返回上百个模型的完整定义污染上下文。
   * 需要某个模型的完整结构时用 get()。
   */
  async list(projectId?: string | number, params: ListSchemasParams = {}): Promise<SchemaIndex[]> {
    const all = await this.fetchAll(projectId, params.moduleId);
    const keyword = params.keyword?.toLowerCase();
    const limit = Math.min(params.limit ?? 50, 200);

    const filtered = keyword
      ? all.filter(
          (s) =>
            s.name?.toLowerCase().includes(keyword) ||
            s.description?.toLowerCase().includes(keyword)
        )
      : all;

    return filtered.slice(0, limit).map(({ id, name, folderId, description }) => ({
      id, name, folderId, description,
    }));
  }

  /**
   * 取单个数据模型的完整结构(含 jsonSchema),按 id 或名称定位。
   * 改模型流程:get() 拿 jsonSchema -> 改 -> import_openapi(schemaOverwriteMode="name")。
   */
  async get(idOrName: number | string, projectId?: string | number): Promise<DataSchema> {
    const all = await this.fetchAll(projectId);
    const found =
      typeof idOrName === 'number' || /^\d+$/.test(String(idOrName))
        ? all.find((s) => s.id === Number(idOrName))
        : all.find((s) => s.name === idOrName) ??
          all.find((s) => s.name?.toLowerCase() === String(idOrName).toLowerCase());
    if (!found) {
      throw new ApifoxError(`未找到数据模型「${idOrName}」`, { endpoint: 'data-schemas' });
    }
    return found;
  }

  /**
   * 删除数据模型。
   * 逆向得到:DELETE /api/v1/api-schemas/{id}(全局端点,必须带 X-Project-Id header)。
   */
  async remove(schemaId: number, projectId?: string | number): Promise<{ deleted: true }> {
    const pid = this.http.resolveProjectId(projectId);
    await this.http.request('delete', `/api/v1/api-schemas/${schemaId}`, {
      headers: { 'X-Project-Id': pid },
    });
    return { deleted: true };
  }
}
