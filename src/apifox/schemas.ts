/**
 * 数据模型(data schema)能力。
 *
 * 端点说明(personal token 实测):
 *  - GET  /data-schemas        可用(读模型列表,含 id/name/jsonSchema/folderId 等)
 *  - POST/PUT/PATCH/DELETE     302 不可用(token 不开放模型写)
 * 因此本服务只提供只读;创建模型请用 import_openapi(components.schemas),
 * 修改/删除模型需在 Apifox UI 操作。
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
}
