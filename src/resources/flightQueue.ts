import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState } from '../state.js';

export function registerFlightQueueResource(server: McpServer, state: AirportState) {
  server.registerResource(
    'flight-queue',
    'atc://flights/queue',
    {
      title: 'Очередь рейсов',
      description: 'Все рейсы с их статусами: pending, scheduled, cancelled, unschedulable',
      mimeType: 'application/json',
    },
    async (uri) => {
      const flights = state.getFlights();
      const grouped = {
        pending: flights.filter((f) => f.status === 'pending'),
        scheduled: flights.filter((f) => f.status === 'scheduled'),
        cancelled: flights.filter((f) => f.status === 'cancelled'),
        unschedulable: flights
          .filter((f) => f.status === 'unschedulable')
          .map((f) => ({ ...f, reason: f.unschedulableReason })),
      };
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(grouped, null, 2),
          },
        ],
      };
    },
  );
}
