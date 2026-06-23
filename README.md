# Apifox MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for Apifox API management, with multi-project
switching and read/write/import capabilities. Based on the Apifox API.

> v2.0 是一次完整重构:分层架构、修复对 personal token 失效的端点、新增测试套件。
> 工具集做了破坏性调整(详见下方迁移说明)。

## Features

所有工具都支持可选 `projectId` 参数,在调用时覆盖默认项目(多项目切换)。

返回均做了**上下文优化**:列表类工具返回精简索引(不含大字段),需要完整结构时用对应的 `get_*` 工具。

### 读 / 检索
- `apifox_get_project` — 项目详情
- `apifox_list_modules` — 模块列表
- `apifox_list_folders` — 列出指定模块下的目录(返回 moduleId/folderId/folderName/folderPath)
- `apifox_find_folder` — 按模块名 + 目录名定位 moduleId/folderId
- `apifox_list_endpoints` — 接口索引列表(精简:id/name/method/path/folderId)
- `apifox_search_endpoints` — 按 keyword/method/folderId 检索接口(精简索引,避免上下文爆炸)
- `apifox_get_endpoint` — 接口详情(默认精简字段,`raw=true` 拿全量)
- `apifox_list_schemas` — 数据模型索引(精简:id/name/folderId/description,支持 keyword 过滤)
- `apifox_get_schema` — 单个数据模型完整 jsonSchema(按 id 或名称)

### 写操作
- `apifox_create_endpoint` — 创建接口(带真实成功校验;支持 parameters/requestBody/responses)
- `apifox_update_endpoint` — 更新接口(支持改 name/method/path/description 及 parameters/requestBody/responses)
- `apifox_delete_endpoint` — 删除接口(可选 `verify` 删除后回查)
- `apifox_delete_schema` — 删除数据模型
- `apifox_delete_folder` — 删除接口目录

### 导入导出
- `apifox_import_openapi` — 导入 OpenAPI/Swagger;含 `components.schemas` 时创建/覆盖数据模型(`schemaOverwriteMode`)
- `apifox_export_openapi` — 导出项目/模块为 OpenAPI(可按 moduleId、可选目录转 tag)

## 推荐工作流(给 AI 高效使用)

- **改某个接口**:`search_endpoints`(关键词找到 apiId)→ `get_endpoint`(拿结构)→ `update_endpoint`
- **改某个数据模型字段**:`list_schemas`(keyword 找模型)→ `get_schema`(拿 jsonSchema)→ 修改 → `import_openapi`(`schemaOverwriteMode:"name"`)
- 列表类工具只给索引,不要直接拿全量详情灌进上下文

## 接口的参数 / 请求体 / 响应

`create_endpoint` / `update_endpoint` 支持 `parameters` / `requestBody` / `responses`,
原样透传给 Apifox。改复杂结构时,建议**先 `get_endpoint` 拿到现有结构,改完整体传回**,
避免字段格式出错。

`parameters` 形如 `{ path:[], query:[], header:[], cookie:[] }`,每个参数含
`name/required/enable/type/schema` 等字段。

## 数据模型(data schema)工作流

数据模型的 `data-schemas` 写端点(`POST`/`PUT`/`PATCH`/`DELETE`)对 personal token 返回 302,
但**读和"改/建"都能通过可用端点完成**:

- **读**:`apifox_list_schemas`(`GET /data-schemas`)列出项目数据模型(id/name/jsonSchema 等)。
- **建**:`import_openapi`——在 `components.schemas` 定义模型、`paths` 用 `$ref` 引用,一次导入即创建模型并让接口引用。
- **改字段(required/描述/属性)**:`import_openapi` 重导同名模型并传
  **`schemaOverwriteMode: "name"`**,即按模型名覆盖更新(默认 `ignore` 不覆盖,这是关键参数)。
  同理改已有接口用 `apiOverwriteMode: "methodAndPath"`。
- **删**:仍需在 Apifox UI 操作(删除端点 302)。

> `schemaOverwriteMode` 可选值:`ignore`(默认)/ `name` / `nameAndFolder` / `merge`。

```jsonc
apifox_import_openapi({
  spec: JSON.stringify({
    openapi: "3.0.1",
    info: { title: "x", version: "1.0.0" },
    paths: {
      "/user/create": {
        post: {
          tags: ["User"],
          requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UserReq" } } } },
          responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/UserResp" } } } } }
        }
      }
    },
    components: {
      schemas: {
        UserReq: { type: "object", properties: { name: { type: "string" } } },
        UserResp: { type: "object", properties: { id: { type: "integer" } } }
      }
    }
  })
})
// 导入后:数据模型 UserReq / UserResp 被创建,接口 /user/create 引用它们
```

> 注意:数据模型**可改字段**(`import_openapi` + `schemaOverwriteMode:"name"`),但**无法经 API 删除**
> (删除端点 302),删除需在 Apifox UI 操作。

## 多项目支持

每个工具都接受可选 `projectId`。实际项目 ID 的解析优先级:

1. 工具调用参数里的 `projectId`(最高)
2. 启动参数 `--project=<id>`
3. 环境变量 `APIFOX_PROJECT_ID`
4. 以上都没有 → 返回明确错误

因此 `--project` 是**可选**的,可只靠 `APIFOX_PROJECT_ID` 或每次调用传 `projectId`。

```jsonc
// 用默认项目
apifox_get_project({})
// 覆盖到指定项目
apifox_list_modules({ projectId: 7834388 })
// 按名定位目录
apifox_find_folder({ projectId: 7834388, moduleName: "KAZ-PDP -接口", folderName: "Client-Image" })
// => { projectId:"7834388", moduleId:7586044, folderId:83801899, moduleName:"KAZ-PDP -接口", folderName:"Client-Image" }
```

## 已知限制(personal access token)

使用个人访问令牌(`afxp_`)时,Apifox 的部分旧内部端点不可用,本服务据此做了取舍:

- **目录无法通过 API 创建/删除**:`/api-tree-folders` 返回 302。`list_folders`/`find_folder`
  通过 `export-openapi` + `http-apis` 关联重建目录信息;要新建目录,请用 `import_openapi`
  导入带 tag 的接口,Apifox 会按 tag 自动建目录。
- **数据模型(schema)读 + 建/改**:`GET /data-schemas` 可读(`list_schemas`);创建与改字段
  通过 `import_openapi`(改字段用 `schemaOverwriteMode:"name"`)。仅**删除**需在 Apifox UI(端点 302)。
- **失效端点不再静默**:底层 HTTP 客户端会把 302 重定向与 200 空 body 识别为"端点不可用"
  并抛出明确错误,避免旧实现里"假成功"的问题。

## 安装

```bash
git clone https://github.com/lingpfeng1-ux/apifox-mcp-server.git
cd apifox-mcp-server
npm install
npm run build
```

## 配置

### 获取 Access Token
登录 Apifox → 头像 → 账号设置 → API 访问令牌 → 新建并保存。

### MCP 客户端配置

```jsonc
{
  "mcpServers": {
    "Apifox": {
      "command": "node",
      "args": [
        "/abs/path/dist/index.js",
        "--project=YOUR_PROJECT_ID"     // 可选
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

启动参数(均可选):
- `--project=<id>` 默认项目 ID
- `--base-url=<url>` API 基址(默认 `https://api.apifox.com`)
- `--api-version=<version>` 接口版本头(默认 `2024-03-28`)

## 测试

```bash
npm test                 # 单元测试(mock HTTP,无副作用)
npm run test:integration # opt-in 集成 smoke(真实 API,需环境变量)
```

集成 smoke 需要(默认 skip,有副作用步骤再受 `APIFOX_RUN_WRITE` 二次开关控制):

```bash
APIFOX_RUN_INTEGRATION=1 \
APIFOX_RUN_WRITE=1 \
APIFOX_ACCESS_TOKEN=<token> \
APIFOX_TEST_PROJECT_ID=<projectId> \
APIFOX_TEST_MODULE_ID=<moduleId> \
npm run test:integration
```

## 架构

```
src/
  index.ts            入口:启动 MCP server、注册 handler、统一错误包装
  config.ts           配置解析(token / 默认 projectId / baseURL / api 版本)
  errors.ts           统一错误类型 ApifoxError
  apifox/
    http.ts           底层 HTTP:鉴权、302/空 body 识别、错误归一化、resolveProjectId
    projects.ts       项目 / 模块能力
    endpoints.ts      接口 CRUD(写操作带成功校验)
    folders.ts        目录能力(export + http-apis 关联重建)
    importExport.ts   import-data 导入 / export-openapi 导出
    types.ts          类型定义
    index.ts          能力层门面 Apifox
  tools/
    registry.ts       MCP 工具注册表(schema + handler)
__tests__/            vitest 单元测试 + opt-in 集成 smoke
docs/plans/           设计文档
```

## 从 v1 迁移(破坏性变更)

| v1 工具 | v2 | 说明 |
|---|---|---|
| `apifox_get_modules` | `apifox_list_modules` | 重命名 |
| `apifox_get_endpoints` | `apifox_list_endpoints` | 重命名 |
| `apifox_get_folders` | `apifox_list_folders` | 重命名 + 重写(原实现失效) |
| `apifox_create_folder` | (移除) | API 不支持;改用 `import_openapi` 建目录 |
| `apifox_create_schema` / `apifox_get_schemas` | `apifox_list_schemas`(只读) | 仅保留读;写端点 302,创建走 import |

其余工具名不变,但写操作增加了真实成功校验,导入改用了正确的请求格式。

## License

MIT License — see [LICENSE](LICENSE).
