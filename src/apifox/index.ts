/**
 * 能力层门面:装配 HttpClient 与各领域 Service,供工具层调用。
 *
 * 数据模型(data schema):GET /data-schemas 可读,但写端点(POST/PUT/PATCH/DELETE)
 * 对 personal token 返回 302 不可用,故只提供只读(SchemaService.list)。
 * 创建模型请用 import_openapi(components.schemas);修改/删除模型需在 Apifox UI 操作。
 * 同理,建目录通过 import_openapi(导入带 tag 的接口时自动建目录)。
 */

import { AppConfig } from '../config';
import { HttpClient } from './http';
import { ProjectService } from './projects';
import { EndpointService } from './endpoints';
import { ImportExportService } from './importExport';
import { FolderService } from './folders';
import { SchemaService } from './schemas';

export class Apifox {
  readonly http: HttpClient;
  readonly projects: ProjectService;
  readonly endpoints: EndpointService;
  readonly importExport: ImportExportService;
  readonly folders: FolderService;
  readonly schemas: SchemaService;

  constructor(config: AppConfig) {
    this.http = new HttpClient(config);
    this.projects = new ProjectService(this.http);
    this.endpoints = new EndpointService(this.http);
    this.importExport = new ImportExportService(this.http);
    this.folders = new FolderService(this.http, this.projects, this.endpoints, this.importExport);
    this.schemas = new SchemaService(this.http);
  }
}

export { HttpClient } from './http';
export { ProjectService } from './projects';
export { EndpointService } from './endpoints';
export { ImportExportService } from './importExport';
export { FolderService } from './folders';
export { SchemaService } from './schemas';
export * from './types';
