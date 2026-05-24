import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { AirportState } from './state.js';

// Tools
import { registerSubmitFlight } from './tools/submitFlight.js';
import { registerGenerateSchedule } from './tools/generateSchedule.js';
import { registerGetStatus } from './tools/getStatus.js';
import { registerCancelFlight } from './tools/cancelFlight.js';
import { registerBottleneck } from './tools/bottleneck.js';

// Resources
import { registerFlightQueueResource } from './resources/flightQueue.js';
import { registerRunwaysResource } from './resources/runways.js';
import { registerTimelineResource } from './resources/timeline.js';

async function main() {
  // Load and validate configuration
  const config = loadConfig();
  const state = new AirportState(config);

  // Create MCP server
  const server = new McpServer({
    name: 'atc-mcp-server',
    version: '1.0.0',
  });

  // Register tools
  registerSubmitFlight(server, state);
  registerGenerateSchedule(server, state);
  registerGetStatus(server, state);
  registerCancelFlight(server, state);
  registerBottleneck(server, state);

  // Register resources
  registerFlightQueueResource(server, state);
  registerRunwaysResource(server, state);
  registerTimelineResource(server, state);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[atc-mcp] Server started via stdio');
}

main().catch((err) => {
  console.error('[atc-mcp] Fatal error:', err);
  process.exit(1);
});
