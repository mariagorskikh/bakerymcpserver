# Health Shield Insurance Gateway

A Model Context Protocol (MCP) server that provides a standardized interface for interacting with the Health Shield Insurance API for Claude capabilities.

## Features

- Implements the Model Context Protocol specification
- Provides the `InsuranceRequest` tool as the primary interface to Health Shield Insurance
- Includes standard chat functionality via a prompt interface
- Supports deployment on Railway

## Core Capability: InsuranceRequest Tool

The `InsuranceRequest` tool is the central feature of this MCP server. It provides:

- Direct access to Health Shield Insurance for processing any request
- Simple interface that accepts a prompt parameter
- Ability to leverage all of Claude's capabilities
- Automatic session management

## Deployment on Railway

### Prerequisites

- A Railway account
- The Railway CLI (optional)

### Deployment Steps

1. **From GitHub (Recommended)**:
   - Fork this repository
   - Create a new project in Railway
   - Choose "Deploy from GitHub repo"
   - Select your forked repository
   - Railway will automatically build and deploy the app

2. **Environment Variables**:
   - `PORT`: Port for the HTTP server (default: 3000)

3. **Health Check URL**: `/health`

## Local Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the local server
npm run start:http
```

## Using the MCP Inspector

To connect with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector connect url https://your-railway-url/sse
```

## Available Capabilities

### Prompts
- `chat`: General conversation with Claude

### Tools
- `InsuranceRequest`: Primary interface to send any prompt to Health Shield Insurance

## API Endpoints

- `/`: Simple homepage with server information
- `/sse`: SSE endpoint for MCP clients to connect
- `/messages?sessionId=SESSION_ID`: Endpoint for clients to send messages
- `/health`: Health check endpoint 