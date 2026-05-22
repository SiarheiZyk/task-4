import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState } from '../state.js';

export function registerRunwaysResource(server: McpServer, state: AirportState) {
  server.registerResource(
    'runways',
    'atc://runways',
    {
      title: 'Полосы аэропорта',
      description: 'Информация о ВПП и их использовании в текущем расписании',
      mimeType: 'application/json',
    },
    async (uri) => {
      const runways = state.getRunways();
      const schedule = state.getLastSchedule();
      const usage = runways.map((rw) => {
        const ops = schedule
          .filter((op) => op.runwayId === rw.id)
          .sort((a, b) => a.startTime - b.startTime);
        return {
          ...rw,
          operationCount: ops.length,
          operations: ops.map((op) => ({
            flightNumber: op.flightNumber,
            operationType: op.operationType,
            startTime: op.startTime,
            endTime: op.endTime,
          })),
        };
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(usage, null, 2),
          },
        ],
      };
    },
  );
}
