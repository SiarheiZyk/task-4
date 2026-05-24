import { describe, it, expect, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { loadConfig } from '../src/config.js';
import { AirportState } from '../src/state.js';
import { registerSubmitFlight } from '../src/tools/submitFlight.js';
import { registerGenerateSchedule } from '../src/tools/generateSchedule.js';
import { registerGetStatus } from '../src/tools/getStatus.js';
import { registerCancelFlight } from '../src/tools/cancelFlight.js';
import { registerBottleneck } from '../src/tools/bottleneck.js';
import { registerFlightQueueResource } from '../src/resources/flightQueue.js';
import { registerRunwaysResource } from '../src/resources/runways.js';
import { registerTimelineResource } from '../src/resources/timeline.js';

function createServer() {
  const config = loadConfig();
  const state = new AirportState(config);
  const server = new McpServer({ name: 'atc-mcp-test', version: '1.0.0' });

  registerSubmitFlight(server, state);
  registerGenerateSchedule(server, state);
  registerGetStatus(server, state);
  registerCancelFlight(server, state);
  registerBottleneck(server, state);
  registerFlightQueueResource(server, state);
  registerRunwaysResource(server, state);
  registerTimelineResource(server, state);

  return server;
}

async function createClientServer() {
  const server = createServer();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

describe('MCP Integration', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    const cs = await createClientServer();
    client = cs.client;
    server = cs.server;
  });

  it('lists all 5 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'analyze_bottleneck',
      'cancel_flight',
      'generate_schedule',
      'get_airport_status',
      'submit_flight',
    ]);
  });

  it('lists all 3 resources', async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([
      'atc://flights/queue',
      'atc://runways',
      'atc://timeline',
    ]);
  });

  it('submit_flight accepts a flight and returns confirmation', async () => {
    const result = await client.callTool({
      name: 'submit_flight',
      arguments: {
        flightNumber: 'AA100',
        operationType: 'arrival',
        priority: 'high',
      },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain('AA100');
    expect(text).toContain('pending');
  });

  it('submit_flight rejects duplicate flight numbers', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'DUP1', operationType: 'arrival' },
    });
    const result = await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'DUP1', operationType: 'departure' },
    });
    expect(result.isError).toBe(true);
  });

  it('generate_schedule schedules submitted flights', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'F1', operationType: 'arrival', priority: 'high' },
    });
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'F2', operationType: 'departure', priority: 'low' },
    });
    const result = await client.callTool({ name: 'generate_schedule', arguments: {} });
    const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(data.scheduled_count).toBe(2);
    expect(data.unschedulable_count).toBe(0);
  });

  it('get_airport_status returns structured status', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'S1', operationType: 'arrival' },
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });
    const result = await client.callTool({ name: 'get_airport_status', arguments: {} });
    const status = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(status.flights.total).toBe(1);
    expect(status.flights.scheduled).toBe(1);
    expect(status.resources.runways.capacity).toBeGreaterThan(0);
    expect(status.resources.gates.capacity).toBeGreaterThan(0);
    expect(status.resources.groundCrew.capacity).toBeGreaterThan(0);
  });

  it('cancel_flight cancels a flight and reports dependents', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'IN1', operationType: 'arrival' },
    });
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'OUT1', operationType: 'departure', dependencies: ['IN1'] },
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.callTool({
      name: 'cancel_flight',
      arguments: { flightNumber: 'IN1' },
    });
    const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(data.cancelled).toBe('IN1');
    expect(data.affectedDependents).toContain('OUT1');
  });

  it('analyze_bottleneck finds critical chain', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'AA', operationType: 'arrival' },
    });
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'BB', operationType: 'departure', dependencies: ['AA'] },
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.callTool({ name: 'analyze_bottleneck', arguments: {} });
    const data = JSON.parse((result.content as Array<{ type: string; text: string }>)[0].text);
    expect(data.critical_chain).toEqual(['AA', 'BB']);
    expect(data.total_duration_sec).toBeGreaterThan(0);
  });

  it('flight queue resource returns grouped flights', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'Q1', operationType: 'arrival' },
    });
    const result = await client.readResource({ uri: 'atc://flights/queue' });
    const data = JSON.parse((result.contents[0] as { text: string }).text);
    expect(data.pending.length).toBe(1);
    expect(data.pending[0].flightNumber).toBe('Q1');
  });

  it('timeline resource returns chronological operations', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'T1', operationType: 'arrival' },
    });
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'T2', operationType: 'departure' },
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.readResource({ uri: 'atc://timeline' });
    const data = JSON.parse((result.contents[0] as { text: string }).text);
    expect(data.totalOperations).toBe(2);
    expect(data.timeline[0].startTime).toBeLessThanOrEqual(data.timeline[1].startTime);
  });

  it('runways resource shows runway usage', async () => {
    await client.callTool({
      name: 'submit_flight',
      arguments: { flightNumber: 'R1', operationType: 'departure' },
    });
    await client.callTool({ name: 'generate_schedule', arguments: {} });

    const result = await client.readResource({ uri: 'atc://runways' });
    const data = JSON.parse((result.contents[0] as { text: string }).text);
    expect(data.length).toBeGreaterThan(0);
    const usedRunway = data.find((rw: { operationCount: number }) => rw.operationCount > 0);
    expect(usedRunway).toBeDefined();
    expect(usedRunway.operations[0].flightNumber).toBe('R1');
  });
});
