/**
 * 能力层门面:装配 HttpClient 与各领域 Service,供工具层调用。
 *
 * 注:schema 相关端点(/schemas GET 空、POST 302)对 personal token 不可用,
 * 已不提供对应能力。建目录请通过 import_openapi(导入带 tag 的接口时自动建目录)。
 */

import { AppConfig } from '../config';
import { HttpClient } from './http';
import { ProjectService } from './projects';
import { EndpointService } from './endpoints';
import { ImportExportService } from './importExport';
import { FolderService } from './folders';

export class Apifox {
  readonly http: HttpClient;
  readonly projects: ProjectService;
  readonly endpoints: EndpointService;
  readonly importExport: ImportExportService;
  readonly folders: FolderService;

  constructor(config: AppConfig) {
    this.http = new HttpClient(config);
    this.projects = new ProjectService(this.http);
    this.endpoints = new EndpointService(this.http);
    this.importExport = new ImportExportService(this.http);
    this.folders = new FolderService(this.http, this.projects, this.endpoints, this.importExport);
  }
}

export { HttpClient } from './http';
export { ProjectService } from './projects';
export { EndpointService } from './endpoints';
export { ImportExportService } from './importExport';
export { FolderService } from './folders';
export * from './types';
