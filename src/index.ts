import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import fetch from "node-fetch";
import { z } from "zod";
import express from "express";

// Define the bakery client API URL
const BAKERY_API_URL = "https://bakery-client-production.up.railway.app";

// Create a new MCP server
const server = new McpServer({
  name: "bakery-client-wrapper",
  version: "1.0.0",
});

// Store active sessions
const sessions: Record<string, string> = {};

// Create a prompt for chat with Claude
server.prompt(
  "chat",
  { message: z.string() },
  async ({ message }) => {
    // Generate a unique session ID if needed
    if (!sessions.currentSessionId) {
      await initSession();
    }

    // Send message to the bakery client API
    try {
      const response = await fetch(`${BAKERY_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessions.currentSessionId,
          message,
        }),
      });

      const data = await response.json() as { response: string; toolUsed: string | null };

      // Return the response as a message
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: message,
            },
          },
          {
            role: "assistant",
            content: {
              type: "text",
              text: data.response + (data.toolUsed ? `\n\n(Tool used: ${data.toolUsed})` : ""),
            },
          },
        ],
      };
    } catch (error) {
      console.error("Error sending message to bakery client:", error);
      throw new Error(`Failed to chat with Claude: ${error}`);
    }
  }
);

// Define a tool to fetch a website through the bakery client
server.tool(
  "fetchWebsite",
  { url: z.string().url() },
  async ({ url }) => {
    // Ensure we have an active session
    if (!sessions.currentSessionId) {
      await initSession();
    }

    try {
      // Send message to use the fetchWebsite tool
      const response = await fetch(`${BAKERY_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessions.currentSessionId,
          message: `Please use the fetchWebsite tool to get the content from ${url}`,
        }),
      });

      const data = await response.json() as { response: string; toolUsed: string | null };

      return {
        content: [
          {
            type: "text",
            text: data.response,
          },
        ],
      };
    } catch (error) {
      console.error("Error fetching website:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error fetching website: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Define a tool for direct requests to the bakery client
server.tool(
  "RequestBakery",
  { text: z.string() },
  async ({ text }) => {
    // Ensure we have an active session
    if (!sessions.currentSessionId) {
      await initSession();
    }

    try {
      // Send message directly to the bakery client API
      const response = await fetch(`${BAKERY_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessions.currentSessionId,
          message: text,
        }),
      });

      const data = await response.json() as { response: string; toolUsed: string | null };

      return {
        content: [
          {
            type: "text",
            text: data.response + (data.toolUsed ? `\n\n(Tool used: ${data.toolUsed})` : ""),
          },
        ],
      };
    } catch (error) {
      console.error("Error sending message to bakery client:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error communicating with Claude: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Helper function to initialize a session
async function initSession(): Promise<void> {
  try {
    const sessionId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const response = await fetch(`${BAKERY_API_URL}/api/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json() as { message: string; tools: any[] };
    
    if (data.message === "Session initialized successfully") {
      sessions.currentSessionId = sessionId;
      console.log(`Initialized session: ${sessionId}`);
      
      // Log available tools from the bakery client
      console.log("Available tools:", data.tools);
    } else {
      throw new Error("Failed to initialize session");
    }
  } catch (error) {
    console.error("Error initializing session:", error);
    throw new Error(`Failed to initialize session: ${error}`);
  }
}

// Start the MCP server using stdio transport (default for Claude Desktop)
async function startStdioServer() {
  try {
    console.log("Starting MCP server with stdio transport...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("MCP server connected!");
  } catch (error) {
    console.error("Error starting MCP server:", error);
  }
}

// Start the MCP server using HTTP/SSE transport
async function startHttpServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  // To support multiple simultaneous connections we have a lookup object from sessionId to transport
  const transports: Record<string, SSEServerTransport> = {};
  
  // Simple homepage
  app.get('/', (_, res) => {
    res.send(`
      <html>
        <head>
          <title>MCP Bakery Client Wrapper</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
            #output { margin-top: 20px; padding: 10px; border: 1px solid #ccc; }
            button { padding: 8px 12px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <h1>MCP Bakery Client Wrapper</h1>
          <p>This is a simple MCP server that wraps the bakery client API.</p>
          <p>To use with MCP clients, connect to:</p>
          <ul>
            <li>SSE Endpoint: <code>http://localhost:${PORT}/sse</code></li>
            <li>Message Endpoint: <code>http://localhost:${PORT}/messages?sessionId=SESSION_ID</code></li>
          </ul>
          
          <button id="connectBtn">Test SSE Connection</button>
          <div id="output">Connection status will appear here...</div>
          
          <script>
            document.getElementById('connectBtn').addEventListener('click', () => {
              const output = document.getElementById('output');
              output.textContent = 'Connecting to SSE...';

              const evtSource = new EventSource('/sse');

              evtSource.onopen = () => {
                output.textContent += '\\nConnected to SSE!';
              };

              evtSource.onerror = (err) => {
                output.textContent += '\\nError with SSE connection: ' + JSON.stringify(err);
                evtSource.close();
              };

              evtSource.onmessage = (event) => {
                output.textContent += '\\nReceived: ' + event.data;
              };
            });
          </script>
        </body>
      </html>
    `);
  });
  
  // Health check endpoint
  app.get('/health', (_, res) => {
    res.status(200).send('OK');
  });
  
  // SSE endpoint for MCP clients to connect to
  app.get('/sse', async (req, res) => {
    try {
      console.log("New SSE connection");
      
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Create transport for this connection
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport;
      
      console.log(`Created new SSE transport with session ID: ${sessionId}`);
      
      // Clean up when connection is closed
      req.on("close", () => {
        console.log(`SSE connection closed: ${sessionId}`);
        delete transports[sessionId];
      });
      
      // Connect the MCP server to this transport
      await server.connect(transport);
    } catch (error) {
      console.error("Error in SSE connection:", error);
      res.end();
    }
  });
  
  // Message endpoint for MCP clients to send messages
  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId parameter" });
    }
    
    const transport = transports[sessionId];
    
    if (!transport) {
      return res.status(404).json({ error: `No transport found for sessionId: ${sessionId}` });
    }
    
    try {
      console.log(`Received message for sessionId: ${sessionId}`);
      
      // Pass the request directly to the handlePostMessage function
      // Let the SDK handle the body parsing
      await transport.handlePostMessage(req, res);
    } catch (error) {
      console.error("Error handling message:", error);
      // Only send a response if one hasn't been sent already
      if (!res.headersSent) {
        res.status(500).json({ error: `Error handling message: ${error}` });
      }
    }
  });
  
  // Start the HTTP server
  const httpServer = app.listen(PORT, async () => {
    console.log(`HTTP server listening on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} for more information`);
  });
  
  // Handle server shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    httpServer.close();
    process.exit(0);
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const serverMode = args[0] || 'stdio';

// Start the server in the appropriate mode
if (serverMode === 'http') {
  console.log("Starting in HTTP/SSE server mode");
  startHttpServer();
} else {
  console.log("Starting in stdio server mode (default)");
  startStdioServer();
} 