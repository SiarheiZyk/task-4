# ATC MCP Server

An AI-ready Air Traffic Control system built as a Model Context Protocol server. It coordinates flight operations at a busy airport: accepts flight plans, schedules arrivals and departures safely, manages limited airport resources, reacts to disruptions, and exposes airport state to AI clients through MCP tools and resources.

## Installation

```bash
cd task-4
npm install
npm run build
```

## Environment Variables

All airport limits are configured through environment variables. Invalid configuration fails clearly at startup.

| Variable | Default | Constraints | Description |
|---|---|---|---|
| `RUNWAY_COUNT` | 2 | 1-20 | Number of runways |
| `GATE_COUNT` | 10 | 1-200 | Number of gates |
| `GROUND_CREW_COUNT` | 20 | 1-500 | Number of ground crew members |
| `TAKEOFF_BUFFER_SEC` | 120 | >=30 | Separation buffer between consecutive departures (seconds) |
| `LANDING_BUFFER_SEC` | 90 | >=30 | Separation buffer between consecutive arrivals (seconds) |
| `MIXED_OPS_BUFFER_SEC` | 180 | >=30 | Separation buffer when switching between arrival/departure |
| `GATE_TURNAROUND_SEC` | 2700 | >=300 | Gate turnaround time (45 min default) |
| `DEPENDENCY_BUFFER_SEC` | 600 | >=0 | Buffer between dependent flights (10 min default) |
| `MAX_HORIZON_SEC` | 21600 | >=3600 | Maximum scheduling horizon (6 hours default) |
| `DEFAULT_RUNWAY_LENGTH_M` | 3000 | >=1000 | Default runway length in meters |
| `OPERATION_DURATION_SEC` | 180 | >=30 | Runway occupancy per operation (3 min default) |

## Running the Server

### Local testing via MCP Inspector

```bash
npm run inspector
```

This opens a UI at `http://localhost:6274` where you can manually invoke tools and inspect resources.

### Connecting to Claude Desktop

Open `claude_desktop_config.json`:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the server configuration (use **absolute path**):

```json
{
  "mcpServers": {
    "atc-scheduler": {
      "command": "node",
      "args": ["/absolute/path/to/task-4/dist/index.js"],
      "env": {
        "RUNWAY_COUNT": "2",
        "GATE_COUNT": "10",
        "GROUND_CREW_COUNT": "20"
      }
    }
  }
}
```

Fully restart Claude Desktop (Quit via system tray, not just close the window).

### Development mode (no build required)

```json
{
  "mcpServers": {
    "atc-scheduler-dev": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/task-4/src/index.ts"]
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `submit_flight` | Submit a new arrival or departure. Accepts flight number, operation type, priority, dependencies, and optional runway length requirement. Returns confirmation; does not trigger scheduling. |
| `generate_schedule` | Generate or refresh the airport schedule. Replaces the current schedule with a freshly computed one based on the current flight queue and airport configuration. |
| `get_airport_status` | Get current airport status including flight counts by state and operation type, runway/gate/crew capacity and usage, blocked flights with reasons, and schedule completion time. |
| `cancel_flight` | Cancel a flight by flight number. Marks it as cancelled and resets dependent flights to pending. Re-run `generate_schedule` afterward to refresh the plan. |
| `analyze_bottleneck` | Identify the longest chain of dependent scheduled flights that drives the total schedule duration (critical path). Returns the ordered flights in the chain and total elapsed duration. |

## Resources

| URI | Description |
|---|---|
| `atc://flights/queue` | Current flight queue grouped by status: pending, scheduled, cancelled, and unschedulable flights with reasons. |
| `atc://runways` | Runway availability and usage: each runway with its length, operation count, and chronological list of assigned operations. |
| `atc://timeline` | Chronological timeline of all scheduled airport operations, sorted by start time. |

## Tests

```bash
npm test
```

Tests cover the core scheduling algorithm, all three validation scenarios (Morning Rush, Heavy Hauler, Connecting Flight), and MCP integration via `InMemoryTransport`.
