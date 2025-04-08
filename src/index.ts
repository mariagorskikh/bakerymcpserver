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
  name: "Flour Bakery Gateway",
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

// Define the main bakery request tool - central interface to the Flour Bakery API
server.tool(
  "BakeryRequest",
  {
    prompt: z.string().describe("The prompt or request to send to the Flour Bakery. This can be any question, instruction, or request for content processing."),
  },
  async ({ prompt }) => {
    // Ensure we have an active session
    if (!sessions.currentSessionId) {
      await initSession();
    }

    try {
      console.log(`Sending request to Flour Bakery: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
      
      // Send request to the Flour Bakery API
      const response = await fetch(`${BAKERY_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessions.currentSessionId,
          message: prompt,
        }),
      });

      const data = await response.json() as { response: string; toolUsed: string | null };
      console.log(`Response received from Flour Bakery${data.toolUsed ? ` (used tool: ${data.toolUsed})` : ''}`);

      return {
        content: [
          {
            type: "text",
            text: data.response,
          },
        ],
        metadata: {
          toolUsed: data.toolUsed
        }
      };
    } catch (error) {
      console.error("Error processing request with Flour Bakery:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error communicating with Flour Bakery: ${error}`,
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
      console.log(`Initialized session with Flour Bakery: ${sessionId}`);
      
      // Log available tools from the bakery client
      console.log("Available Flour Bakery tools:", data.tools);
    } else {
      throw new Error("Failed to initialize session with Flour Bakery");
    }
  } catch (error) {
    console.error("Error initializing session with Flour Bakery:", error);
    throw new Error(`Failed to initialize session: ${error}`);
  }
}

// Start the MCP server using stdio transport (default for Claude Desktop)
async function startStdioServer() {
  try {
    console.log("Starting Flour Bakery Gateway with stdio transport...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Flour Bakery Gateway connected!");
  } catch (error) {
    console.error("Error starting Flour Bakery Gateway:", error);
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
          <title>Flour Bakery Gateway</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
            #output { margin-top: 20px; padding: 10px; border: 1px solid #ccc; }
            button { padding: 8px 12px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <h1>Flour Bakery Gateway</h1>
          <p>This MCP server provides access to the Flour Bakery API through the Model Context Protocol.</p>
          <p>To use with MCP clients, connect to:</p>
          <ul>
            <li>SSE Endpoint: <code>${process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`}/sse</code></li>
            <li>Message Endpoint: <code>${process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`}/messages?sessionId=SESSION_ID</code></li>
          </ul>
          
          <h2>Available Capabilities</h2>
          <ul>
            <li><strong>BakeryRequest Tool</strong>: Send any prompt to the Flour Bakery for processing</li>
            <li><strong>Chat Prompt</strong>: Standard conversational interface with Claude</li>
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
    console.log(`Flour Bakery Gateway listening on port ${PORT}`);
    const publicUrl = process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`;
    console.log(`Visit ${publicUrl} for more information`);
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
  console.log("Starting Flour Bakery Gateway in HTTP/SSE server mode");
  startHttpServer();
} else {
  console.log("Starting Flour Bakery Gateway in stdio server mode (default)");
  startStdioServer();
} 