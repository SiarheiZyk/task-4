import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AirportState } from '../state.js';

export function registerSubmitFlight(server: McpServer, state: AirportState) {
  server.registerTool(
    'submit_flight',
    {
      title: 'Подать новый рейс',
      description:
        'Регистрирует прилёт или вылет в системе ATC. ' +
        'Возвращает подтверждение приёма. Не запускает планирование.',
      inputSchema: {
        flightNumber: z.string().min(2).max(10).describe('Уникальный номер рейса, например SU1234'),
        operationType: z
          .enum(['arrival', 'departure'])
          .describe('Тип операции: arrival (прилёт) или departure (вылет)'),
        priority: z.enum(['high', 'medium', 'low']).default('medium').describe('Приоритет рейса'),
        dependencies: z
          .array(z.string())
          .default([])
          .describe('Номера рейсов, которые должны быть обслужены раньше'),
        minRunwayLengthMeters: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Требуемая минимальная длина ВПП в метрах'),
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
