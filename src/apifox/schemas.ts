/**
 * 数据模型(data schema)能力。
 *
 * 端点说明(personal token 实测 + 逆向 Apifox 客户端):
 *  - GET  /api/v1/projects/{id}/data-schemas        可用(读模型列表)
 *  - POST/PUT/PATCH /api/v1/projects/{id}/data-schemas  302 不可用
 *  - DELETE /api/v1/api-schemas/{id}                可用(全局端点,需带 X-Project-Id header)
 * 创建/更新模型请用 import_openapi(components.schemas + schemaOverwriteMode)。
 */

import { HttpClient } from './http';

export interface DataSchema {
  id: number;
  name: string;
  displayName?: string;
  jsonSchema?: unknown;
  folderId?: number;
  moduleId?: number;
  description?: string;
}

export class SchemaService {
  constructor(private readonly http: HttpClient) {}

  /** 列出项目的数据模型(可按 moduleId 过滤) */
  async list(projectId?: string | number, moduleId?: string | number): Promise<DataSchema[]> {
    const pid = this.http.resolveProjectId(projectId);
    const params: Record<string, any> = {};
    if (moduleId !== undefined && moduleId !== null && String(moduleId).trim() !== '') {
      params.moduleId = moduleId;
    }
    const body = await this.http.get(`/api/v1/projects/${pid}/data-schemas`, params);
    return (body?.data ?? body) as DataSchema[];
  }

  /**
   * 删除数据模型。
   * 逆向得到:DELETE /api/v1/api-schemas/{id}(全局端点,必须带 X-Project-Id header)。
   * projectId 用于解析 X-Project-Id，模型本身无需属于该项目之外的校验。
   */
  async remove(schemaId: number, projectId?: string | number): Promise<{ deleted: true }> {
    const pid = this.http.resolveProjectId(projectId);
    await this.http.request('delete', `/api/v1/api-schemas/${schemaId}`, {
      headers: { 'X-Project-Id': pid },
    });
    return { deleted: true };
  }
}
