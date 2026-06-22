# Apifox MCP Server 重构设计

日期：2026-06-22
范围：大重构(允许破坏性重设工具集)

## 背景与动机

原项目(基于 lishuji 的实现)大量使用 Apifox 的**旧内部端点**,这些端点对 personal access token(`afxp_`)不可用,导致多个工具失效或假成功:

| 端点 | 现象 | 影响的工具 |
|---|---|---|
| `GET /api-tree` | 200 但空 body | `get_folders` 返回空 |
| `POST /api-tree-folders` | 302 重定向 | `create_folder` **假成功**(误报 success=true,目录未建) |
| `GET /schemas` | 200 但空 body | `get_schemas` 返回空 |
| `GET /export-openapi` | 200 但空 body | `export_openapi` 返回空 |

实测确认**稳定可用**的端点(token `afxp_`,版本头 `2024-03-28`):
- `GET /api/v1/projects/{id}` 项目详情
- `GET /api/v1/projects/{id}/modules` 模块列表
- `GET /api/v1/projects/{id}/http-apis?moduleId=` 接口列表(含 folderId)
- `GET/POST/PUT/DELETE /http-apis[/{apiId}]` 接口 CRUD(已端到端验证)
- `POST /api/v1/projects/{id}/export-openapi`(顶层 `moduleId` + scope ALL + `addFoldersToTags`)
- `POST /api/v1/projects/{id}/import-data` 导入(端点存在,待集成验证)

根因:`find_folder` 之所以可行,是因为它只用可用端点(modules + export POST + http-apis)三段关联。重构要把这个思路推广到所有能力。

## 已确认决策

1. **范围**:大重构(结构重组 + 升级 SDK/依赖 + 测试套件 + 工具集重组)
2. **兼容性**:允许破坏性重设工具集(工具名/参数可调整)
3. **失效能力**:用可用端点重建能读的;写不了的用 `import-data` 间接实现或移除
4. **测试**:单元为主(mock HTTP)+ opt-in 集成 smoke(默认关闭)

## 架构与分层

```
src/
  index.ts              入口:启动 MCP server、注册 handlers
  config.ts             配置解析(token / 默认 projectId / baseURL / api 版本)
  apifox/
    http.ts             底层 HTTP 客户端(axios):请求封装、错误归一化、
                        302 与空 body 识别(核心修复点)
    projects.ts         项目、模块能力(getProject / listModules)
    endpoints.ts        接口 CRUD(list/get/create/update/delete + 成功校验)
    folders.ts          目录能力(基于 export+http-apis 重建:listFolders/findFolder)
    importExport.ts     import-data 导入 / POST export-openapi 导出
    schemas.ts          数据模型(可用端点尝试,不可用明确报错)
    types.ts            类型定义
  tools/
    registry.ts         工具注册表:name -> { schema, handler }
    *.ts                各域工具定义(薄封装,调用 apifox/* 能力层)
  errors.ts             统一错误类型
__tests__/              vitest 单元测试 + opt-in 集成 smoke
```

原则:
- HTTP 层与能力层分离:`http.ts` 只管请求 + 把 302/空 body/HTTP 错误归一化成异常。
- 工具层是薄封装:只做参数解析 + 调能力层 + 包装结果,不含业务逻辑。
- 能力层不静默失败:失效端点抛明确异常,杜绝假成功。

## 工具集重设

统一命名:前缀 `apifox_`,列表类用 `list_`。所有工具支持可选 `projectId` 覆盖默认项目。

| 新工具 | 对应旧工具 | 变化 |
|---|---|---|
| `apifox_get_project` | 同 | 保留 |
| `apifox_list_modules` | `apifox_get_modules` | 重命名 |
| `apifox_list_endpoints` | `apifox_get_endpoints` | 重命名,支持 moduleId/folderId 过滤 |
| `apifox_get_endpoint` | 同 | 保留 |
| `apifox_create_endpoint` | 同 | 加成功校验(校验返回真实 id) |
| `apifox_update_endpoint` | 同 | 加成功校验 |
| `apifox_delete_endpoint` | 同 | 加删除后回查校验 |
| `apifox_list_folders` | `apifox_get_folders` | 重写:export+http-apis 关联出 moduleId/folderId/name/path |
| `apifox_find_folder` | 同 | 保留 |
| `apifox_import_openapi` | 同 | 改用 `/import-data` + 真实校验 |
| `apifox_export_openapi` | 同 | 改 POST 版,支持按 moduleId/scope 导出 |

待定项(实现时先用集成 smoke 实测端点,再按结果决定):

1. `apifox_create_folder`:`/api-tree-folders` 返回 302 不可用。
   - 若 `/import-data` 的 `syncFolder` 能间接建目录 → 改造成基于 import 实现;
   - 否则 → 移除该工具,文档注明"建目录请用 import_openapi"。
2. `apifox_create_schema` / schema 读取:`/schemas` GET 失效。
   - 实测 POST `/schemas` 能否建模型 → 能则保留 create_schema、移除失效 list;
   - 不能则整体移除 schema 工具。

## HTTP 客户端与错误处理

- axios 配 `maxRedirects: 0`:302 不再被静默跟随到 HTML 页,直接当错误抛出。
- 空 body 识别:预期 JSON 的请求,200 但 body 完全为空 → 抛明确异常。区分 `{success:true,data:[]}`(合法空列表)≠ 空 body(端点失效信号)。
- 版本头 `X-Apifox-Api-Version` 常量化、可配。

返回值策略(重要变化):
- 能力层方法直接返回数据或抛异常,不再用 `{success,data,error}` 包裹。
- 工具层统一 try/catch:成功包成 MCP 文本结果,失败包成 `isError:true` 结果。

写操作成功校验:
- `create_*` 校验返回含真实 id,否则抛"创建未返回 id,可能失败"。
- `delete_*` 可选回查确认。

## 配置

- token(必需,env `APIFOX_ACCESS_TOKEN`)
- 默认 projectId(可选,`--project` / env `APIFOX_PROJECT_ID`)
- baseURL(默认 `https://api.apifox.com`)
- apiVersion(默认 `2024-03-28`)
- `resolveProjectId` 优先级:调用参数 > 默认 projectId > env > 报错

## 测试与依赖

- 框架 `vitest`;`vi.mock` / `axios-mock-adapter` 模拟 HTTP。
- 单元覆盖:`resolveProjectId`、302/空 body 识别、`find_folder` 关联逻辑、各能力 happy/error path。
- opt-in 集成 smoke:`APIFOX_RUN_INTEGRATION=1` 才跑,打 8190737,有副作用步骤自带清理。
- 依赖升级:`@modelcontextprotocol/sdk`→最新 1.x、`axios`→最新、新增 `vitest`。

## 验证标准

- `npm run build` 通过,`npm test`(单元)全绿。
- 集成 smoke(opt-in)对 8190737 跑通:list_modules / list_endpoints / find_folder / list_folders / endpoint CRUD。
- 现有能力(get_project / list_modules / find_folder / endpoint CRUD)行为与重构前一致或更好。
- 失效工具的最终去留按集成实测结果落定,并在 README 反映。
