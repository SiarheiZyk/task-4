import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState } from '../state.js';

export function registerTimelineResource(server: McpServer, state: AirportState) {
  server.registerResource(
    'timeline',
    'atc://timeline',
    {
      title: 'Operations timeline',
      description: 'All scheduled operations in chronological order by start time',
      mimeType: 'application/json',
    },
    async (uri) => {
      const schedule = [...state.getLastSchedule()].sort(
        (a, b) => a.startTime - b.startTime || a.runwayId.localeCompare(b.runwayId),
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                totalOperations: schedule.length,
                timeline: schedule,
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
