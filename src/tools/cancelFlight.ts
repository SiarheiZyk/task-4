import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AirportState } from '../state.js';

export function registerCancelFlight(server: McpServer, state: AirportState) {
  server.registerTool(
    'cancel_flight',
    {
      title: 'Cancel a flight',
      description:
        'Cancels a flight and marks dependent flights for re-scheduling. ' +
        'It is recommended to re-run generate_schedule after calling this.',
      inputSchema: {
        flightNumber: z.string().describe('Flight number to cancel'),
      },
      annotations: { destructiveHint: true },
    },
    async ({ flightNumber }) => {
      try {
        state.cancelFlight(flightNumber);
        const dependents = state
          .getFlights()
          .filter((f) => f.dependencies.includes(flightNumber))
          .map((f) => f.flightNumber);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  cancelled: flightNumber,
                  affectedDependents: dependents,
                  note: 'Re-run generate_schedule to refresh the plan.',
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );
}
