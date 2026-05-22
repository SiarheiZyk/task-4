import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState } from '../state.js';
import { generateSchedule } from '../scheduler.js';

export function registerGenerateSchedule(server: McpServer, state: AirportState) {
  server.registerTool(
    'generate_schedule',
    {
      title: 'Сгенерировать расписание аэропорта',
      description:
        'Рассчитывает новое расписание для текущей очереди рейсов. ' +
        'Полностью заменяет предыдущее расписание.',
      inputSchema: {},
      annotations: { idempotentHint: true },
    },
    async () => {
      const result = generateSchedule(state);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                scheduled_count: result.scheduled.length,
                unschedulable_count: result.unschedulable.length,
                makespan_sec: result.makespanSec,
                scheduled: result.scheduled,
                unschedulable: result.unschedulable,
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
