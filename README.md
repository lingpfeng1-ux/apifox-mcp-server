# Apifox MCP Server

[![npm version](https://badge.fury.io/js/apifox-mcp-server.svg)](https://www.npmjs.com/package/apifox-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server for Apifox API management with read/write/import capabilities, based on [Apifox Open API](https://apifox-openapi.apifox.cn/).

## Features

### Read Operations
- `apifox_get_project` - Get project details
- `apifox_get_folders` - Get folder list (directory structure)
- `apifox_get_modules` - Get module list of a project
- `apifox_find_folder` - Resolve moduleId + folderId by module name and folder name
- `apifox_get_endpoints` - Get API endpoint list
- `apifox_get_endpoint` - Get endpoint details
- `apifox_get_schemas` - Get data model list
- `apifox_export_openapi` - Export as OpenAPI format

### Write Operations
- `apifox_create_folder` - Create folder
- `apifox_create_endpoint` - Create API endpoint
- `apifox_update_endpoint` - Update API endpoint
- `apifox_delete_endpoint` - Delete API endpoint
- `apifox_create_schema` - Create data model

### Import Operations
- `apifox_import_openapi` - Import OpenAPI/Swagger data
- `apifox_import_openapi_from_url` - Import OpenAPI data from URL

## Installation

### From npm

```bash
npm install -g apifox-mcp-server
```

### From source

```bash
git clone https://github.com/lishuji/apifox-mcp-server.git
cd apifox-mcp-server
npm install
npm run build
```

## Multi-Project Support

Every tool accepts an **optional `projectId` parameter** to target a specific
project at call time, so a single running server can switch between multiple
Apifox projects without restarting.

The effective project ID for each call is resolved in this priority order:

1. The `projectId` passed in the tool call arguments (highest priority)
2. The `--project=<id>` startup argument
3. The `APIFOX_PROJECT_ID` environment variable
4. If none of the above is set, the call returns a clear error

Because of this fallback chain, `--project` is now **optional**: you may omit it
and rely on `APIFOX_PROJECT_ID` and/or per-call `projectId` instead.

> Note: the `projectId` argument only routes the request to the target project
> (it is used in the API URL path). It is never injected into the Apifox
> request body of create/update/import operations.

### Examples

```typescript
// Use the default project (--project / APIFOX_PROJECT_ID)
apifox_get_project({});

// Override the default project for a single call
apifox_get_project({ projectId: 7834388 });

// List modules of a specific project
apifox_get_modules({ projectId: 7834388 });

// Resolve moduleId + folderId by name
apifox_find_folder({
  projectId: 7834388,
  moduleName: "KAZ-PDP -接口",
  folderName: "Client-Image"
});
// => { projectId: "7834388", moduleId: 7586044, folderId: 83801899,
//      moduleName: "KAZ-PDP -接口", folderName: "Client-Image" }
```

## Configuration

### 1. Get API Access Token

1. Login to [Apifox](https://apifox.com)
2. Click avatar in top right → Account Settings
3. Click "API Access Token" → Create new token
4. Save the generated token

### 2. Get Project ID

1. Open your Apifox project
2. The number in the project URL is the project ID, e.g., `4051641` in `https://apifox.com/project/4051641`

### 3. Configure MCP Client

Add to your MCP client configuration (e.g., `~/.codebuddy/mcp.json` for CodeBuddy):

```json
{
  "mcpServers": {
    "Apifox": {
      "command": "npx",
      "args": [
        "apifox-mcp-server",
        "--project=YOUR_PROJECT_ID"
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "Apifox": {
      "command": "apifox-mcp-server",
      "args": [
        "--project=YOUR_PROJECT_ID"
      ],
      "env": {
        "APIFOX_ACCESS_TOKEN": "YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

## Usage Examples

### Import OpenAPI Data

```typescript
// Read local OpenAPI file content
const spec = fs.readFileSync('openapi.yaml', 'utf-8');

// Call import tool
apifox_import_openapi({
  spec: spec,
  targetFolderId: 12345,  // Target folder ID
  coverExistApi: true,    // Overwrite existing APIs
  syncFolder: true        // Sync folder structure
});
```

### Create Endpoint

```typescript
apifox_create_endpoint({
  name: "Get User List",
  method: "GET",
  path: "/api/v1/users",
  folderId: 12345,
  description: "Paginated user list",
  tags: ["User Management"]
});
```

### Create Folder

```typescript
apifox_create_folder({
  name: "User APIs",
  parentId: 0  // 0 means root directory
});
```

## API Reference

### apifox_import_openapi

Import OpenAPI/Swagger specification data.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| spec | string | Yes | OpenAPI spec content (JSON/YAML) |
| targetFolderId | number | No | Target folder ID, default 0 (root) |
| coverExistApi | boolean | No | Overwrite existing APIs, default true |
| coverExistSchema | boolean | No | Overwrite existing schemas, default true |
| syncFolder | boolean | No | Sync folder structure, default true |

### apifox_create_endpoint

Create a new API endpoint.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Endpoint name |
| method | string | Yes | HTTP method (GET, POST, PUT, DELETE, PATCH) |
| path | string | Yes | Endpoint path |
| folderId | number | No | Parent folder ID |
| description | string | No | Endpoint description |
| tags | string[] | No | Tag list |

## Notes

1. **API Version**: Uses `X-Apifox-Api-Version: 2024-03-28` header
2. **Authentication**: Bearer Token authentication
3. **Rate Limiting**: Be aware of Apifox API rate limits
4. **Permissions**: Ensure token has sufficient project operation permissions

## Related Links

- [Apifox Open API Documentation](https://apifox-openapi.apifox.cn/)
- [Apifox Help Documentation](https://docs.apifox.com/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
