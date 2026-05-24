import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState } from '../state.js';

export function registerGetStatus(server: McpServer, state: AirportState) {
  server.registerTool(
    'get_airport_status',
    {
      title: 'Get airport status',
      description:
        'Returns aggregated status: flight counts, resource usage, ' +
        'unscheduled flights with reasons.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const flights = state.getFlights();
      const schedule = state.getLastSchedule();
      const config = state.getConfig();

      const counts = {
        total: flights.length,
        pending: flights.filter((f) => f.status === 'pending').length,
        scheduled: flights.filter((f) => f.status === 'scheduled').length,
        cancelled: flights.filter((f) => f.status === 'cancelled').length,
        unschedulable: flights.filter((f) => f.status === 'unschedulable').length,
        arrivals: flights.filter((f) => f.operationType === 'arrival').length,
        departures: flights.filter((f) => f.operationType === 'departure').length,
      };

      const runwayUsage = new Map<string, number>();
      const gateUsage = new Map<string, number>();
      for (const op of schedule) {
        runwayUsage.set(op.runwayId, (runwayUsage.get(op.runwayId) ?? 0) + 1);
        if (op.gateId) gateUsage.set(op.gateId, (gateUsage.get(op.gateId) ?? 0) + 1);
      }

      const blocked = flights
        .filter((f) => f.status === 'unschedulable')
        .map((f) => ({ flightNumber: f.flightNumber, reason: f.unschedulableReason }));

      const completionTime = schedule.length ? Math.max(...schedule.map((op) => op.endTime)) : null;

      const resourcePressure = {
        runways: { capacity: config.runwayCount, used: runwayUsage.size },
        gates: { capacity: config.gateCount, used: gateUsage.size },
        groundCrew: { capacity: config.groundCrewCount, used: Math.min(schedule.length, config.groundCrewCount) },
      };

      const status = {
        flights: counts,
        resources: resourcePressure,
        blockedFlights: blocked,
        scheduleCompletionTimeSec: completionTime,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
      };
    },
  );
}
