import { appendFileSync } from 'node:fs';

export function debugEvent(event, layer, state = {}, note = '') {
  const tracePath = process.env.DEBUG_TRACE_PATH;
  if (!tracePath) {
    return;
  }

  const payload = {
    ts_ms: Date.now(),
    event,
    layer,
    state,
  };
  if (note) {
    payload.note = note;
  }

  try {
    appendFileSync(tracePath, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {
    // Debug tracing must never take down the MCP transport.
  }
}
