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

  /**
   * 统计删除某目录会连带影响的接口(用于删除前预览)。
   * 实测确认:Apifox 删目录会**递归**删子目录及其接口,故需统计整个子树。
   *
   * 有 moduleId 时:用 export 的 folderPath(多级路径)关联,统计目标目录及其所有子目录下的接口,
   *   返回 includesSubfolders=true。
   * 无 moduleId(无法关联 folderPath)或目标为空目录无法定位路径时:退化为只统计直接子接口,
   *   返回 includesSubfolders=false(调用方应据此提示"子目录接口也会被递归删除")。
   */
  async endpointsInFolder(
    folderId: number,
    projectId?: string | number,
    moduleId?: string | number
  ): Promise<{
    endpoints: { id: number; name: string; method: string; path: string }[];
    includesSubfolders: boolean;
  }> {
    const apis = await this.endpoints.list(projectId, moduleId);
    const direct = apis
      .filter((a) => a.folderId === folderId)
      .map((a) => ({ id: a.id, name: a.name, method: a.method, path: a.path }));

    if (moduleId === undefined || moduleId === null || String(moduleId).trim() === '') {
      return { endpoints: direct, includesSubfolders: false };
    }

    // 用 export 的 folderPath 关联,算整棵子树
    const pathByKey = await this.buildFolderPathMap(Number(moduleId), projectId);
    const sample = apis.find((a) => a.folderId === folderId);
    const targetPath = sample ? pathByKey.get(apiKey(sample.method, sample.path)) : undefined;
    if (!targetPath) {
      // 空目录或无法定位路径,退化为直接子接口
      return { endpoints: direct, includesSubfolders: false };
    }

    const subtree = apis
      .filter((a) => {
        const fp = pathByKey.get(apiKey(a.method, a.path));
        return fp != null && (fp === targetPath || fp.startsWith(`${targetPath}/`));
      })
      .map((a) => ({ id: a.id, name: a.name, method: a.method, path: a.path }));
    return { endpoints: subtree, includesSubfolders: true };
  }

  /**
   * 删除接口目录。
   * 逆向得到的端点:DELETE /api/v1/projects/{id}/api-folders/{folderId}(personal token 可用)。
   * ⚠️ 实测:Apifox 会递归删除该目录及其子目录下的所有接口。
   *
   * dryRun=true 时不删除,只返回将受影响的接口(传 moduleId 可统计整棵子树)。
   */
  async removeFolder(
    folderId: number,
    projectId?: string | number,
    opts: { dryRun?: boolean; moduleId?: string | number } = {}
  ): Promise<
    | {
        dryRun: true;
        folderId: number;
        includesSubfolders: boolean;
        affectedEndpoints: { id: number; name: string; method: string; path: string }[];
      }
    | { deleted: true; folderId: number; deletedEndpointCount: number; includesSubfolders: boolean }
  > {
    const pid = this.http.resolveProjectId(projectId);
    const { endpoints, includesSubfolders } = await this.endpointsInFolder(folderId, pid, opts.moduleId);

    if (opts.dryRun) {
      return { dryRun: true, folderId, includesSubfolders, affectedEndpoints: endpoints };
    }

    await this.http.delete(`/api/v1/projects/${pid}/api-folders/${folderId}`);
    return { deleted: true, folderId, deletedEndpointCount: endpoints.length, includesSubfolders };
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
