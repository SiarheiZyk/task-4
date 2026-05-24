import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState } from '../state.js';
import { findBottleneck } from '../scheduler.js';

export function registerBottleneck(server: McpServer, state: AirportState) {
  server.registerTool(
    'analyze_bottleneck',
    {
      title: 'Analyze bottleneck',
      description:
        'Finds the longest chain of dependent scheduled flights ' +
        'that drives the total schedule duration (critical path).',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const result = findBottleneck(state);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                critical_chain: result.chain,
                total_duration_sec: result.totalDurationSec,
                chain_length: result.chain.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
