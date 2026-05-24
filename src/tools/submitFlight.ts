import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AirportState } from '../state.js';

export function registerSubmitFlight(server: McpServer, state: AirportState) {
  server.registerTool(
    'submit_flight',
    {
      title: 'Submit a new flight',
      description:
        'Registers an arrival or departure in the ATC system. ' +
        'Returns acceptance confirmation. Does not trigger scheduling.',
      inputSchema: {
        flightNumber: z.string().min(2).max(10).describe('Unique flight number, e.g. SU1234'),
        operationType: z
          .enum(['arrival', 'departure'])
          .describe('Operation type: arrival or departure'),
        priority: z.enum(['high', 'medium', 'low']).default('medium').describe('Flight priority'),
        dependencies: z
          .array(z.string())
          .default([])
          .describe('Flight numbers that must complete before this flight'),
        minRunwayLengthMeters: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Minimum required runway length in meters'),
      },
    },
    async ({ flightNumber, operationType, priority, dependencies, minRunwayLengthMeters }) => {
      try {
        const flight = state.addFlight({
          flightNumber,
          operationType,
          priority,
          dependencies,
          runwayRequirements: minRunwayLengthMeters
            ? { minLengthMeters: minRunwayLengthMeters }
            : undefined,
        });
        return {
          content: [
            {
              type: 'text',
              text:
                `Flight ${flight.flightNumber} accepted (status: pending). ` +
                `Call generate_schedule to plan.`,
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
