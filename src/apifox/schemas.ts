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
import { ImportExportService } from './importExport';
import { ImportSummary } from './types';

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
  constructor(
    private readonly http: HttpClient,
    private readonly importExport: ImportExportService
  ) {}

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
   * 创建或覆盖一个数据模型(按模型名)。
   * 内部组装最小 OpenAPI(components.schemas)并 import(schemaOverwriteMode="name"),
   * 免去 AI 手搓完整 OpenAPI 包装。同名存在则覆盖更新,不存在则创建。
   */
  async upsert(name: string, jsonSchema: unknown, projectId?: string | number): Promise<ImportSummary> {
    const spec = JSON.stringify({
      openapi: '3.0.1',
      info: { title: 'schema-upsert', version: '1.0.0' },
      paths: {},
      components: { schemas: { [name]: jsonSchema } },
    });
    return this.importExport.importOpenAPI(spec, { projectId, schemaOverwriteMode: 'name' });
  }

  /**
   * 精确更新已有数据模型的结构(按 id 或名称定位)。
   *
   * 关键:走 PUT /api/v1/api-schemas/{id}(+X-Project-Id),**按 schema id 精确更新**,
   * 不再用按名 import——因为项目里可能存在多个同名模型(不同模块/历史导入),
   * 按名覆盖会改错那一份。建议从接口的 $ref(#/definitions/{id})拿到精确 id 再传入。
   *
   * 传名称且存在多个同名时,抛错并列出各 id/moduleId,要求改用 id 指定。
   * jsonSchema 为完整新结构(建议先 get() 拿现有结构改完整传)。
   */
  async update(idOrName: number | string, jsonSchema: unknown, projectId?: string | number): Promise<DataSchema> {
    const pid = this.http.resolveProjectId(projectId);
    const all = await this.fetchAll(projectId);
    const isId = typeof idOrName === 'number' || /^\d+$/.test(String(idOrName));

    let target: DataSchema | undefined;
    if (isId) {
      target = all.find((s) => s.id === Number(idOrName));
    } else {
      const matches = all.filter(
        (s) => s.name === idOrName || s.name?.toLowerCase() === String(idOrName).toLowerCase()
      );
      if (matches.length > 1) {
        throw new ApifoxError(
          `存在 ${matches.length} 个名为「${idOrName}」的数据模型,请改用 id 精确指定:` +
            matches.map((m) => `id=${m.id}(moduleId=${m.moduleId})`).join('; '),
          { endpoint: 'api-schemas' }
        );
      }
      target = matches[0];
    }
    if (!target) {
      throw new ApifoxError(`未找到数据模型「${idOrName}」`, { endpoint: 'api-schemas' });
    }

    const resp = await this.http.request('put', `/api/v1/api-schemas/${target.id}`, {
      headers: { 'X-Project-Id': pid },
      data: { ...target, jsonSchema },
    });
    return (resp?.data ?? resp) as DataSchema;
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
