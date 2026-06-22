/**
 * 目录能力。
 *
 * Apifox 的原生目录树端点(/api-tree、/api-tree-folders)对 personal token 不可用
 * (返回空 / 302),因此目录信息通过两段可用数据关联重建:
 *   1. export-openapi(按模块, addFoldersToTags) —— method+path -> 目录名(x-apifox-folder)
 *   2. http-apis?moduleId                       —— method+path -> folderId
 * 以 method+path 为连接键,得到 目录名 <-> folderId。
 */

import { HttpClient } from './http';
import { ApifoxError } from '../errors';
import { ProjectService } from './projects';
import { EndpointService } from './endpoints';
import { ImportExportService } from './importExport';
import { FolderInfo, FindFolderResult } from './types';

export class FolderService {
  constructor(
    private readonly http: HttpClient,
    private readonly projects: ProjectService,
    private readonly endpoints: EndpointService,
    private readonly importExport: ImportExportService
  ) {}

  /**
   * 列出指定模块下的所有目录(folderName <-> folderId)。
   */
  async listFolders(moduleName: string, projectId?: string | number): Promise<FolderInfo[]> {
    const module = await this.projects.resolveModule(moduleName, projectId);
    const folderPathByKey = await this.buildFolderPathMap(module.id, projectId);
    const apis = await this.endpoints.list(projectId, module.id);

    const byFolderId = new Map<number, FolderInfo>();
    for (const api of apis) {
      const key = apiKey(api.method, api.path);
      const folderPath = folderPathByKey.get(key);
      if (folderPath == null || api.folderId == null) continue;
      if (!byFolderId.has(api.folderId)) {
        byFolderId.set(api.folderId, {
          moduleId: module.id,
          moduleName: module.name,
          folderId: api.folderId,
          folderName: lastSegment(folderPath),
          folderPath,
        });
      }
    }
    return [...byFolderId.values()];
  }

  /**
   * 根据模块名 + 目录名定位 folderId。
   */
  async findFolder(
    moduleName: string,
    folderName: string,
    projectId?: string | number
  ): Promise<FindFolderResult> {
    const pid = this.http.resolveProjectId(projectId);
    const module = await this.projects.resolveModule(moduleName, projectId);
    const folders = await this.listFolders(moduleName, projectId);

    const matched = folders.find((f) => folderMatches(f.folderPath, folderName));
    if (!matched) {
      const names = folders.map((f) => f.folderName).join(', ');
      throw new ApifoxError(
        `模块「${moduleName}」下未找到目录「${folderName}」。可用目录:${names || '(无)'}`
      );
    }

    return {
      projectId: pid,
      moduleId: module.id,
      folderId: matched.folderId,
      moduleName: module.name,
      folderName,
    };
  }

  /** 构建 method+path -> 目录路径(来自 export 的 x-apifox-folder / tag) */
  private async buildFolderPathMap(
    moduleId: number,
    projectId?: string | number
  ): Promise<Map<string, string>> {
    const openapi = await this.importExport.exportOpenAPI({
      projectId,
      moduleId,
      addFoldersToTags: true,
      includeExtensions: true,
    });
    const map = new Map<string, string>();
    const paths = openapi?.paths || {};
    for (const [path, methods] of Object.entries<any>(paths)) {
      for (const [method, op] of Object.entries<any>(methods || {})) {
        const folderPath = op?.['x-apifox-folder'];
        if (folderPath != null) map.set(apiKey(method, path), String(folderPath));
      }
    }
    return map;
  }
}

function apiKey(method: string, path: string): string {
  return `${String(method).toUpperCase()} ${path}`;
}

function lastSegment(folderPath: string): string {
  return folderPath.split('/').pop() || folderPath;
}

function folderMatches(folderPath: string, folderName: string): boolean {
  const norm = (s: string) => String(s).replace(/\s+/g, '').toLowerCase();
  const target = norm(folderName);
  if (norm(folderPath) === target) return true;
  return norm(lastSegment(folderPath)) === target;
}
