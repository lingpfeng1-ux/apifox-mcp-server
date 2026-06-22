/**
 * 导入 / 导出能力。
 *
 * 重要:import-data 的正确请求体是 { data: <spec字符串>, importFormat: 'openapi' }。
 * 旧实现用 { input, inputType, options } 实际不生效(createCount 恒为 0),已废弃。
 *
 * export-openapi 必须用 POST,且可通过顶层 moduleId 指定按模块导出;
 * addFoldersToTags=true 时目录会以 tag / x-apifox-folder 形式出现(供目录关联使用)。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';
import { ImportSummary } from './types';

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
  /** 透传给 Apifox 的额外导入选项(如 endpointOverwriteBehavior 等) */
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
   * 校验导入统计:若接口与目录创建/更新数全为 0,抛错(避免"导入成功但啥都没建"的假象)。
   */
  async importOpenAPI(spec: string, opts: ImportOptions = {}): Promise<ImportSummary> {
    const pid = this.http.resolveProjectId(opts.projectId);
    const body = await this.http.post(`/api/v1/projects/${pid}/import-data`, {
      data: spec,
      importFormat: 'openapi',
      ...(opts.extra || {}),
    });

    const data = (body?.data ?? body) as any;
    const item = data?.apiCollection?.item ?? {};
    const folder = data?.apiCollection?.folder ?? {};
    const summary: ImportSummary = {
      raw: data,
      endpointCreateCount: Number(item.createCount ?? 0),
      endpointUpdateCount: Number(item.updateCount ?? 0),
      folderCreateCount: Number(folder.createCount ?? 0),
    };

    if (
      summary.endpointCreateCount === 0 &&
      summary.endpointUpdateCount === 0 &&
      summary.folderCreateCount === 0
    ) {
      throw new ApifoxError(
        '导入完成但未创建/更新任何接口或目录,请检查 spec 内容或字段格式',
        { endpoint: 'import-data' }
      );
    }
    return summary;
  }
}
