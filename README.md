# Bakery MCP Server

A Model Context Protocol (MCP) server that wraps the Bakery API for Claude, providing a standardized interface for AI interactions.

## Features

- Implements the Model Context Protocol specification
- Provides chat functionality via a prompt interface
- Exposes `fetchWebsite` tool for retrieving web content
- Includes `RequestBakery` tool for direct message passing
- Supports deployment on Railway

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
- `fetchWebsite`: Retrieves content from a specified URL
- `RequestBakery`: Direct interface to Bakery API (alternative to chat prompt)

## API Endpoints

- `/`: Simple homepage with server information
- `/sse`: SSE endpoint for MCP clients to connect
- `/messages?sessionId=SESSION_ID`: Endpoint for clients to send messages
- `/health`: Health check endpoint 