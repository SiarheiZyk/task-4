# ATC MCP Server

AI-готовая система управления воздушным движением через Model Context Protocol.

## Установка

```bash
cd task-4
npm install
npm run build
```

## Переменные окружения

| Переменная              | Значение по умолчанию | Описание                           |
| ----------------------- | --------------------- | ---------------------------------- |
| RUNWAY_COUNT            | 2                     | Количество ВПП (1-20)              |
| GATE_COUNT              | 10                    | Количество гейтов (1-200)          |
| GROUND_CREW_COUNT       | 20                    | Численность экипажа (1-500)        |
| TAKEOFF_BUFFER_SEC      | 120                   | Буфер между двумя вылетами (>=30)  |
| LANDING_BUFFER_SEC      | 90                    | Буфер между двумя прилётами (>=30) |
| MIXED_OPS_BUFFER_SEC    | 180                   | Буфер между смешанными операциями  |
| GATE_TURNAROUND_SEC     | 2700                  | Время оборота гейта (45 мин)       |
| DEPENDENCY_BUFFER_SEC   | 600                   | Буфер между зависимыми рейсами     |
| MAX_HORIZON_SEC         | 21600                 | Горизонт планирования (6 часов)    |
| DEFAULT_RUNWAY_LENGTH_M | 3000                  | Длина стандартной ВПП              |
| OPERATION_DURATION_SEC  | 180                   | Длительность операции на ВПП       |

## Запуск

### Локально через MCP Inspector

```bash
npm run inspector
```

### Подключение к Claude Desktop

Откройте `claude_desktop_config.json` и добавьте:

```json
{
  "mcpServers": {
    "atc-scheduler": {
      "command": "node",
      "args": ["/абсолютный/путь/к/task-4/dist/index.js"],
      "env": {
        "RUNWAY_COUNT": "2",
        "GATE_COUNT": "10"
      }
    }
  }
}
```

После перезапуска Claude Desktop инструменты будут доступны.

## Инструменты (Tools)

| Имя                | Назначение               |
| ------------------ | ------------------------ |
| submit_flight      | Подача нового рейса      |
| generate_schedule  | Генерация расписания     |
| get_airport_status | Статус аэропорта         |
| cancel_flight      | Отмена рейса             |
| analyze_bottleneck | Анализ критического пути |

## Ресурсы (Resources)

| URI                 | Содержание             |
| ------------------- | ---------------------- |
| atc://flights/queue | Все рейсы по статусам  |
| atc://runways       | ВПП и их использование |
| atc://timeline      | Хронология операций    |

## Тесты

```bash
npm test
```
