import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import fetch from "node-fetch";
import { z } from "zod";
import express from "express";

// Define the insurance client API URL
const INSURANCE_API_URL = "https://bakery-client-production.up.railway.app";

// Create a new MCP server
const server = new McpServer({
  name: "Health Shield Insurance Gateway",
  version: "1.0.0",
});

// Store active sessions
const sessions: Record<string, string> = {};

// Create a prompt for chat with Claude
server.prompt(
  "chat",
  { message: z.string() },
  async ({ message }, context) => {
    const sessionId = context.sessionId;
    if (!sessionId) {
        // This case should ideally not happen if the MCP client is compliant
        console.error("Session ID missing in chat prompt context!");
        return {
            messages: [{ role: "assistant", content: { type: "text", text: "Internal error: Missing session ID."}}]
        };
    }
    
    // Check if this session needs initialization with the downstream client
    try {
      if (!sessions[sessionId]) {
        await initSession(sessionId); // Pass sessionId to init function
      }
    } catch (initError) {
        console.error(`Failed to initialize session ${sessionId} for chat:`, initError);
        return {
            messages: [{ role: "assistant", content: { type: "text", text: "Sorry, I couldn't prepare the chat session."}}]
        };
    }

    // Send message to the insurance client API using the correct sessionId
    try {
      const response = await fetch(`${INSURANCE_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId, // Use the sessionId from context
          message,
        }),
      });

      // Check for non-OK response first
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Error from insurance client API (${response.status}): ${errorBody}`);
        // Return user-facing error message
        return {
             messages: [{ role: "assistant", content: { type: "text", text: `Sorry, there was an issue communicating with the insurance service (Status: ${response.status}).`}}]
        };
      }

      // Now parse the JSON
      const data = await response.json() as { response?: string; toolUsed?: string | null; error?: string };
      
      // Check if the insurance client returned an application-level error
      if (data.error) {
        console.error(`Error message from insurance client: ${data.error}`);
        // Return user-facing error message
        return {
             messages: [{ role: "assistant", content: { type: "text", text: `Sorry, the insurance service reported an error: ${data.error}`}}]
        };
      }
      
      // Ensure data.response exists before using it
      const responseText = data.response ?? "(No response text received)";

      // Return the successful response as messages
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
              text: responseText + (data.toolUsed ? `\n\n(Tool used: ${data.toolUsed})` : ""),
            },
          },
        ],
      };
    } catch (error) {
      console.error("Error sending message to insurance client:", error);
      // Return user-facing error message for unexpected errors
      return {
           messages: [{ role: "assistant", content: { type: "text", text: `Sorry, an unexpected error occurred while processing your chat message.`}}]
      };
    }
  }
);

// Define the main insurance request tool - central interface to the Health Shield Insurance API
server.tool(
  "InsuranceRequest",
  {
    prompt: z.string().describe("The prompt or request to send to Health Shield Insurance. This can be any question, instruction, or request for health insurance information."),
  },
  async ({ prompt }, context) => {
    const sessionId = context.sessionId;
    if (!sessionId) {
        throw new Error("Session ID is missing from the context.");
    }

    // Ensure this session is initialized with the downstream client
    if (!sessions[sessionId]) {
      await initSession(sessionId); // Pass sessionId
    }

    try {
      console.log(`Sending request to Health Shield Insurance: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
      
      // Send request to the Insurance API using the correct sessionId
      const response = await fetch(`${INSURANCE_API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: sessionId, // Use sessionId from context
          message: prompt,
        }),
      });
      
      // Check for non-OK response first
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Error from insurance client API (${response.status}): ${errorBody}`);
        // Return an MCP-compliant error structure
        return {
          content: [
            { type: "text", text: `Error communicating with Health Shield Insurance: Status ${response.status}` },
          ],
          isError: true,
        };
      }

      // Now parse the JSON
      const data = await response.json() as { response?: string; toolUsed?: string | null; error?: string };
      console.log(`Response received from Health Shield Insurance${data.toolUsed ? ` (used tool: ${data.toolUsed})` : ''}`);
      
      // Check if the insurance client returned an application-level error
      if (data.error) {
        console.error(`Error message from insurance client: ${data.error}`);
        return {
          content: [
            { type: "text", text: `Insurance client reported an error: ${data.error}` },
          ],
          isError: true,
        };
      }
      
      // Ensure data.response exists
      if (typeof data.response !== 'string') {
          console.error(`Invalid response structure from insurance client: 'response' field is missing or not a string.`);
          return {
              content: [
                  { type: "text", text: "Received an invalid response structure from the insurance service." },
              ],
              isError: true,
          };
      }

      return {
        content: [
          {
            type: "text",
            text: data.response, // Now safely access data.response
          },
        ],
        metadata: {
          toolUsed: data.toolUsed
        }
      };
    } catch (error) {
      console.error("Error processing request with Health Shield Insurance:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error communicating with Health Shield Insurance: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Helper function to initialize a session
async function initSession(sessionId: string): Promise<void> {
  try {
    const response = await fetch(`${INSURANCE_API_URL}/api/init`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    const data = await response.json() as { message: string; tools: any[] };
    
    if (data.message === "Session initialized successfully") {
      sessions[sessionId] = sessionId;
      console.log(`Initialized session with Health Shield Insurance: ${sessionId}`);
      
      // Log available tools from the insurance client
      console.log("Available Health Shield Insurance tools:", data.tools);
    } else {
      throw new Error("Failed to initialize session with Health Shield Insurance");
    }
  } catch (error) {
    console.error("Error initializing session with Health Shield Insurance:", error);
    throw new Error(`Failed to initialize session: ${error}`);
  }
}

// Start the MCP server using stdio transport (default for Claude Desktop)
async function startStdioServer() {
  try {
    console.log("Starting Health Shield Insurance Gateway with stdio transport...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log("Health Shield Insurance Gateway connected!");
  } catch (error) {
    console.error("Error starting Health Shield Insurance Gateway:", error);
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
          <title>Health Shield Insurance Gateway</title>
          <style>
            body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1 { color: #333; }
            code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
            #output { margin-top: 20px; padding: 10px; border: 1px solid #ccc; }
            button { padding: 8px 12px; background: #4CAF50; color: white; border: none; cursor: pointer; }
          </style>
        </head>
        <body>
          <h1>Health Shield Insurance Gateway</h1>
          <p>This MCP server provides access to the Health Shield Insurance API through the Model Context Protocol.</p>
          <p>To use with MCP clients, connect to:</p>
          <ul>
            <li>SSE Endpoint: <code>${process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`}/sse</code></li>
            <li>Message Endpoint: <code>${process.env.RAILWAY_STATIC_URL || `http://localhost:${PORT}`}/messages?sessionId=SESSION_ID</code></li>
          </ul>
          
          <h2>Available Capabilities</h2>
          <ul>
            <li><strong>InsuranceRequest Tool</strong>: Send any prompt to Health Shield Insurance for processing</li>
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
    console.log(`Health Shield Insurance Gateway listening on port ${PORT}`);
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
  console.log("Starting Health Shield Insurance Gateway in HTTP/SSE server mode");
  startHttpServer();
} else {
  console.log("Starting Health Shield Insurance Gateway in stdio server mode (default)");
  startStdioServer();
} 