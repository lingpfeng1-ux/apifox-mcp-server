/**
 * Apifox 领域类型定义。
 */

export interface ApifoxModule {
  id: number;
  key?: string;
  name: string;
  type?: string;
  description?: string;
}

export interface HttpApi {
  id: number;
  name: string;
  method: string;
  path: string;
  folderId?: number;
  moduleId?: number;
  status?: string;
  description?: string;
  tags?: string[];
}

/** 目录信息(基于 export + http-apis 关联重建得到) */
export interface FolderInfo {
  moduleId: number;
  moduleName: string;
  folderId: number;
  folderName: string;
  /** 目录在 OpenAPI 中的完整路径(可能多级,如 "父/子") */
  folderPath: string;
}

export interface FindFolderResult {
  projectId: string;
  moduleId: number;
  folderId: number;
  moduleName: string;
  folderName: string;
}

export interface ImportSummary {
  /** Apifox import-data 原始统计返回 */
  raw: unknown;
  /** 从统计中归纳出的接口创建/更新数量(用于真实成功校验) */
  endpointCreateCount: number;
  endpointUpdateCount: number;
  folderCreateCount: number;
}

/** 接口创建/更新入参 */
export interface EndpointInput {
  name: string;
  method: string;
  path: string;
  folderId?: number;
  description?: string;
  tags?: string[];
  status?: string;
}
