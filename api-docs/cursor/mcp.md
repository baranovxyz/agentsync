# Model Context Protocol (MCP)

## [What is MCP?](https://cursor.com/docs/context/mcp#what-is-mcp)

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) enables Cursor to connect to external tools and data sources.

## [Servers](https://cursor.com/docs/context/mcp#servers)

Browse available MCP servers. Click "Add to Cursor" to install them directly.

Filters

| Name     | Install                                                                                                                                     | Description                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Figma    | [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=Figma&config=eyJ1cmwiOiJodHRwczovL21jcC5maWdtYS5jb20vbWNwIn0%3D)        | Design and collaboration platform for teams.                  |
| Notion   | [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=Notion&config=eyJ1cmwiOiJodHRwczovL21jcC5ub3Rpb24uY29tL21jcCJ9)         | All-in-one workspace for notes, docs, and project management. |
| Linear   | [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=Linear&config=eyJ1cmwiOiJodHRwczovL21jcC5saW5lYXIuYXBwL3NzZSJ9)         | Issue tracking and project management for development teams.  |
| Context7 | [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=Context7&config=eyJ1cmwiOiJodHRwczovL21jcC5jb250ZXh0Ny5jb20vbWNwIn0%3D) | Up-to-date code documentation.                                |
| Sentry   | [Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=Sentry&config=eyJ1cmwiOiJodHRwczovL21jcC5zZW50cnkuZGV2L21jcCJ9)         | Error tracking and performance monitoring.                    |

Show more servers

### [Why use MCP?](https://cursor.com/docs/context/mcp#why-use-mcp)

MCP connects Cursor to external systems and data. Instead of explaining your project structure repeatedly, integrate directly with your tools.

Write MCP servers in any language that can print to `stdout` or serve an HTTP endpoint - Python, JavaScript, Go, etc.

### [How it works](https://cursor.com/docs/context/mcp#how-it-works)

MCP servers expose capabilities through the protocol, connecting Cursor to external tools or data sources.

Cursor supports three transport methods:

| Transport             | Execution environment | Deployment       | Users          | Input                   | Auth   |
| --------------------- | --------------------- | ---------------- | -------------- | ----------------------- | ------ |
| **`stdio`**           | Local                 | Cursor manages   | Single user    | Shell command           | Manual |
| **`SSE`**             | Local/Remote          | Deploy as server | Multiple users | URL to an SSE endpoint  | OAuth  |
| **`Streamable HTTP`** | Local/Remote          | Deploy as server | Multiple users | URL to an HTTP endpoint | OAuth  |

### [Protocol support](https://cursor.com/docs/context/mcp#protocol-support)

Cursor supports these MCP protocol capabilities:

| Feature         | Support   | Description                                                     |
| --------------- | --------- | --------------------------------------------------------------- |
| **Tools**       | Supported | Functions for the AI model to execute                           |
| **Prompts**     | Supported | Templated messages and workflows for users                      |
| **Resources**   | Supported | Structured data sources that can be read and referenced         |
| **Roots**       | Supported | Server-initiated inquiries into URI or filesystem boundaries    |
| **Elicitation** | Supported | Server-initiated requests for additional information from users |

## [Installing MCP servers](https://cursor.com/docs/context/mcp#installing-mcp-servers)

### [One-click installation](https://cursor.com/docs/context/mcp#one-click-installation)

Install MCP servers from our collection and authenticate with OAuth.

[

Browse MCP Tools

Browse available MCP servers

](https://cursor.com/docs/context/mcp/directory)[

Add to Cursor Button

Create an "Add to Cursor" button

](https://cursor.com/docs/context/mcp/install-links)

### [Using`mcp.json`](https://cursor.com/docs/context/mcp#using-mcpjson)

Configure custom MCP servers with a JSON file:

CLI Server - Node.js

```
{  "mcpServers": {    "server-name": {      "command": "npx",      "args": ["-y", "mcp-server"],      "env": {        "API_KEY": "value"      }    }  }}
```

CLI Server - Python

```
{  "mcpServers": {    "server-name": {      "command": "python",      "args": ["mcp-server.py"],      "env": {        "API_KEY": "value"      }    }  }}
```

Remote Server

```
// MCP server using HTTP or SSE - runs on a server{  "mcpServers": {    "server-name": {      "url": "http://localhost:3000/mcp",      "headers": {        "API_KEY": "value"      }    }  }}
```

### [STDIO server configuration](https://cursor.com/docs/context/mcp#stdio-server-configuration)

For STDIO servers (local command-line servers), configure these fields in your `mcp.json`:

| Field       | Required | Description                                                                                             | Examples                                  |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **type**    | Yes      | Server connection type                                                                                  | `"stdio"`                                 |
| **command** | Yes      | Command to start the server executable. Must be available on your system path or contain its full path. | `"npx"`, `"node"`, `"python"`, `"docker"` |
| **args**    | No       | Array of arguments passed to the command                                                                | `["server.py", "--port", "3000"]`         |
| **env**     | No       | Environment variables for the server                                                                    | `{"API_KEY": "${env:api-key}"}`           |
| **envFile** | No       | Path to an environment file to load more variables                                                      | `".env"`, `"${workspaceFolder}/.env"`     |

### [Using the Extension API](https://cursor.com/docs/context/mcp#using-the-extension-api)

For programmatic MCP server registration, Cursor provides an extension API that allows dynamic configuration without modifying `mcp.json` files. This is particularly useful for enterprise environments and automated setup workflows.

[

MCP Extension API Reference

Learn how to register MCP servers programmatically using `vscode.cursor.mcp.registerServer()`

](https://cursor.com/docs/context/mcp-extension-api)

### [Configuration locations](https://cursor.com/docs/context/mcp#configuration-locations)

Project Configuration

Create `.cursor/mcp.json` in your project for project-specific tools.

Global Configuration

Create `~/.cursor/mcp.json` in your home directory for tools available everywhere.

### [Config interpolation](https://cursor.com/docs/context/mcp#config-interpolation)

Use variables in `mcp.json` values. Cursor resolves variables in these fields: `command`, `args`, `env`, `url`, and `headers`.

Supported syntax:

- `${env:NAME}` environment variables
- `${userHome}` path to your home folder
- `${workspaceFolder}` project root (the folder that contains `.cursor/mcp.json`)
- `${workspaceFolderBasename}` name of the project root
- `${pathSeparator}` and `${/}` OS path separator

Examples

```
{  "mcpServers": {    "local-server": {      "command": "python",      "args": ["${workspaceFolder}/tools/mcp_server.py"],      "env": {        "API_KEY": "${env:API_KEY}"      }    }  }}
```

```
{  "mcpServers": {    "remote-server": {      "url": "https://api.example.com/mcp",      "headers": {        "Authorization": "Bearer ${env:MY_SERVICE_TOKEN}"      }    }  }}
```

### [Authentication](https://cursor.com/docs/context/mcp#authentication)

MCP servers use environment variables for authentication. Pass API keys and tokens through the config.

Cursor supports OAuth for servers that require it.

## [Using MCP in chat](https://cursor.com/docs/context/mcp#using-mcp-in-chat)

The Composer Agent automatically uses MCP tools listed under `Available Tools` when relevant. Ask for a specific tool by name or describe what you need. Enable or disable tools from settings.

### [Toggling tools](https://cursor.com/docs/context/mcp#toggling-tools)

Enable or disable MCP tools directly from the chat interface. Click a tool name in the tools list to toggle it. Disabled tools won't be loaded into context or available to Agent.

### [Tool approval](https://cursor.com/docs/context/mcp#tool-approval)

Agent asks for approval before using MCP tools by default. Click the arrow next to the tool name to see arguments.

![Tool confirmation prompt](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fcontext%2Fmcp%2Ftool-confirm.png&w=1920&q=75)

#### [Auto-run](https://cursor.com/docs/context/mcp#auto-run)

Enable auto-run for Agent to use MCP tools without asking. Works like terminal commands. Read more about Auto-run settings [here](https://cursor.com/docs/agent/tools#auto-run).

### [Tool response](https://cursor.com/docs/context/mcp#tool-response)

Cursor shows the response in chat with expandable views of arguments and responses:

![MCP tool call result](https://cursor.com/docs-static/_next/image?url=%2Fdocs-static%2Fimages%2Fcontext%2Fmcp%2Ftool-call.png&w=1920&q=75)

### [Images as context](https://cursor.com/docs/context/mcp#images-as-context)

MCP servers can return images - screenshots, diagrams, etc. Return them as base64 encoded strings:

```
const RED_CIRCLE_BASE64 = "/9j/4AAQSkZJRgABAgEASABIAAD/2w...";// ^ full base64 clipped for readabilityserver.tool("generate_image", async (params) => {  return {    content: [      {        type: "image",        data: RED_CIRCLE_BASE64,        mimeType: "image/jpeg",      },    ],  };});
```

See this [example server](https://github.com/msfeldstein/mcp-test-servers/blob/main/src/image-server.js) for implementation details. Cursor attaches returned images to the chat. If the model supports images, it analyzes them.

## [Security considerations](https://cursor.com/docs/context/mcp#security-considerations)

When installing MCP servers, consider these security practices:

- **Verify the source**: Only install MCP servers from trusted developers and repositories
- **Review permissions**: Check what data and APIs the server will access
- **Limit API keys**: Use restricted API keys with minimal required permissions
- **Audit code**: For critical integrations, review the server's source code

Remember that MCP servers can access external services and execute code on your behalf. Always understand what a server does before installation.

##
