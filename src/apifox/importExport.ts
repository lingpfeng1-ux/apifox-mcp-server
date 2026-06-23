/**
 * 导入 / 导出能力。
 *
 * 重要:import-data 的正确请求体是 { data: <spec字符串>, importFormat: 'openapi' }。
 * 旧实现用 { input, inputType, options } 实际不生效(createCount 恒为 0),已废弃。
 *
 * 覆盖模式(逆向 Apifox 客户端得到):
 *  - schemaOverwriteMode:数据模型同名时的处理。"ignore"(默认)|"name"(按名覆盖更新)|
 *    "nameAndFolder"|"merge"。改已有模型字段用 "name"。
 *  - apiOverwriteMode:接口同名时的处理。"ignore"(默认)|"methodAndPath"|
 *    "methodAndPathAndFolder"|"merge"。
 *
 * export-openapi 必须用 POST,且可通过顶层 moduleId 指定按模块导出;
 * addFoldersToTags=true 时目录会以 tag / x-apifox-folder 形式出现(供目录关联使用)。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';
import { ImportSummary } from './types';

export type SchemaOverwriteMode = 'ignore' | 'name' | 'nameAndFolder' | 'merge';
export type ApiOverwriteMode = 'ignore' | 'methodAndPath' | 'methodAndPathAndFolder' | 'merge';

export interface ExportOptions {
  projectId?: string | number;
  moduleId?: number;
  /** 目录是否输出为 tag(目录关联时需要 true) */
  addFoldersToTags?: boolean;
  /** 是否包含 x-apifox-* 扩展字段 */
  includeExtensions?: boolean;
  oasVersion?: '2.0' | '3.0' | '3.1';
}

export interface ImportOptions {
  projectId?: string | number;
  /** 接口同名覆盖模式,默认 ignore */
  apiOverwriteMode?: ApiOverwriteMode;
  /** 数据模型同名覆盖模式,默认 ignore;改已有模型字段用 "name" */
  schemaOverwriteMode?: SchemaOverwriteMode;
  /** 透传给 Apifox 的其它额外导入选项 */
  extra?: Record<string, unknown>;
}

export class ImportExportService {
  constructor(private readonly http: HttpClient) {}

  /** 导出项目/模块为 OpenAPI(返回 OpenAPI 对象本身) */
  async exportOpenAPI(opts: ExportOptions = {}): Promise<any> {
    const pid = this.http.resolveProjectId(opts.projectId);
    const payload: Record<string, any> = {
      scope: { type: 'ALL', excludedByTags: [] },
      options: {
        includeApifoxExtensionProperties: opts.includeExtensions ?? true,
        addFoldersToTags: opts.addFoldersToTags ?? false,
      },
      oasVersion: opts.oasVersion ?? '3.0',
      exportFormat: 'JSON',
    };
    if (opts.moduleId != null) payload.moduleId = opts.moduleId;
    return this.http.post(`/api/v1/projects/${pid}/export-openapi`, payload);
  }

  /**
   * 导入 OpenAPI 规范字符串。
   * - apiOverwriteMode / schemaOverwriteMode 控制同名接口/模型的覆盖行为(默认 ignore)。
   *   用 schemaOverwriteMode="name" 可覆盖更新已有数据模型字段。
   * - 校验导入统计:若接口/目录/模型的创建与更新数全为 0,抛错(避免"导入成功但啥都没动")。
   */
  async importOpenAPI(spec: string, opts: ImportOptions = {}): Promise<ImportSummary> {
    const pid = this.http.resolveProjectId(opts.projectId);
    const payload: Record<string, any> = {
      data: spec,
      importFormat: 'openapi',
      ...(opts.extra || {}),
    };
    if (opts.apiOverwriteMode) payload.apiOverwriteMode = opts.apiOverwriteMode;
    if (opts.schemaOverwriteMode) payload.schemaOverwriteMode = opts.schemaOverwriteMode;

    const body = await this.http.post(`/api/v1/projects/${pid}/import-data`, payload);

    const data = (body?.data ?? body) as any;
    const apiItem = data?.apiCollection?.item ?? {};
    const apiFolder = data?.apiCollection?.folder ?? {};
    const schemaItem = data?.schemaCollection?.item ?? {};
    const summary: ImportSummary = {
      endpointCreateCount: Number(apiItem.createCount ?? 0),
      endpointUpdateCount: Number(apiItem.updateCount ?? 0),
      folderCreateCount: Number(apiFolder.createCount ?? 0),
      schemaCreateCount: Number(schemaItem.createCount ?? 0),
      schemaUpdateCount: Number(schemaItem.updateCount ?? 0),
    };

    const changed =
      summary.endpointCreateCount +
      summary.endpointUpdateCount +
      summary.folderCreateCount +
      summary.schemaCreateCount +
      summary.schemaUpdateCount;
    if (changed === 0) {
      throw new ApifoxError(
        '导入完成但未创建/更新任何接口、目录或数据模型;若想覆盖已有内容,请设置 apiOverwriteMode / schemaOverwriteMode',
        { endpoint: 'import-data' }
      );
    }
    return summary;
  }
}
