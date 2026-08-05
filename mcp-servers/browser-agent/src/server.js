import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BrowserBridge } from './bridge.js';
import { compactSnapshot, compactTab } from './snapshot.js';
import { BrowserSupervisor } from './browser-supervisor.js';
import { debugEvent } from './debug-trace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf8'));

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to acquire a free bridge port')));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
        } else {
          resolve(port);
        }
      });
    });
  });
}

const bridgePort = Number.parseInt(process.env.BROWSER_AGENT_BRIDGE_PORT ?? String(await getFreePort()), 10);
const bridgeHost = process.env.BROWSER_AGENT_BRIDGE_HOST ?? '127.0.0.1';
const bridgeTimeoutMs = Number.parseInt(process.env.BROWSER_AGENT_BRIDGE_TIMEOUT_MS ?? '30000', 10);

const bridge = new BrowserBridge({
  port: bridgePort,
  host: bridgeHost,
  requestTimeoutMs: bridgeTimeoutMs,
}).start();
const browserSupervisor = new BrowserSupervisor();

bridge.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  debugEvent('server.bridge.error', 'service', { message });
  console.error(`[browser-agent] bridge error: ${message}`);
});

bridge.on('disconnect', () => {
  browserSupervisor.reset();
});

const server = new Server(
  {
    name: packageJson.name,
    version: packageJson.version,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

function jsonText(value) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function ok(value) {
  return jsonText(value);
}

function fail(error) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  };
}

function assertNumber(value, name) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Expected ${name} to be a number`);
  }
}

async function ensureBrowserReady() {
  debugEvent('server.ensure_browser.before', 'service', {
    bridge_port: bridgePort,
    bridge_connected: bridge.status().connected,
  });
  process.env.BROWSER_AGENT_BRIDGE_PORT = String(bridgePort);
  await browserSupervisor.ensureStarted();
  await bridge.waitForClient();
  debugEvent('server.ensure_browser.after', 'service', {
    bridge_port: bridgePort,
    bridge_connected: bridge.status().connected,
  });
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'browser_list_tabs',
      description: 'List open Chromium tabs with explicit IDs and window metadata.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'browser_open_tab',
      description: 'Open a new tab in the live Chromium session.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to open. Defaults to about:blank.' },
          active: { type: 'boolean', default: true },
        },
      },
    },
    {
      name: 'browser_focus_tab',
      description: 'Focus the tab with the given tab_id.',
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'number' },
        },
      },
    },
    {
      name: 'browser_snapshot_tab',
      description: 'Return a compact DOM and accessibility digest for one explicit tab_id.',
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'number' },
          max_text_chars: { type: 'number', default: 6000 },
          max_actionables: { type: 'number', default: 120 },
        },
      },
    },
    {
      name: 'browser_click',
      description: 'Click an actionable element in a tab by snapshot index.',
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'number' },
          action_index: { type: 'number' },
          x: { type: 'number' },
          y: { type: 'number' },
          button: { type: 'string', default: 'left' },
        },
      },
    },
    {
      name: 'browser_type',
      description: 'Type text into an actionable element in a tab by snapshot index.',
      inputSchema: {
        type: 'object',
        required: ['tab_id', 'text'],
        properties: {
          tab_id: { type: 'number' },
          action_index: { type: 'number' },
          text: { type: 'string' },
          clear: { type: 'boolean', default: true },
          press_enter: { type: 'boolean', default: false },
        },
      },
    },
    {
      name: 'browser_scroll',
      description: 'Scroll a tab by the requested deltas.',
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'number' },
          delta_x: { type: 'number', default: 0 },
          delta_y: { type: 'number', default: 800 },
        },
      },
    },
    {
      name: 'browser_wait',
      description: 'Wait for a tab or for a fixed duration.',
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'number' },
          ms: { type: 'number', default: 1000 },
        },
      },
    },
    {
      name: 'browser_close_tab',
      description: 'Close one explicit tab_id.',
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'number' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args = {} } = request.params;

    if (name === 'browser_list_tabs') {
      await ensureBrowserReady();
      const tabs = await bridge.call('list_tabs', {});
      return ok({
        bridge: bridge.status(),
        tabs: Array.isArray(tabs.tabs) ? tabs.tabs.map(compactTab) : [],
        focusedWindowId: tabs.focusedWindowId ?? null,
      });
    }

    if (name === 'browser_open_tab') {
      await ensureBrowserReady();
      const result = await bridge.call('open_tab', {
        url: typeof args.url === 'string' ? args.url : 'about:blank',
        active: args.active !== false,
      });
      return ok(result);
    }

    if (name === 'browser_focus_tab') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      return ok(await bridge.call('focus_tab', { tabId: args.tab_id }));
    }

    if (name === 'browser_snapshot_tab') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      const snapshot = await bridge.call('snapshot_tab', {
        tabId: args.tab_id,
        maxTextChars: typeof args.max_text_chars === 'number' ? args.max_text_chars : 6000,
        maxActionables: typeof args.max_actionables === 'number' ? args.max_actionables : 120,
      });
      return ok(compactSnapshot(snapshot, {
        maxTextChars: typeof args.max_text_chars === 'number' ? args.max_text_chars : 6000,
        maxActionables: typeof args.max_actionables === 'number' ? args.max_actionables : 120,
      }));
    }

    if (name === 'browser_click') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      const payload = {
        tabId: args.tab_id,
        actionIndex: typeof args.action_index === 'number' ? args.action_index : null,
        x: typeof args.x === 'number' ? args.x : null,
        y: typeof args.y === 'number' ? args.y : null,
        button: typeof args.button === 'string' ? args.button : 'left',
      };
      return ok(await bridge.call('click', payload));
    }

    if (name === 'browser_type') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      return ok(await bridge.call('type', {
        tabId: args.tab_id,
        actionIndex: typeof args.action_index === 'number' ? args.action_index : null,
        text: String(args.text ?? ''),
        clear: args.clear !== false,
        pressEnter: Boolean(args.press_enter),
      }));
    }

    if (name === 'browser_scroll') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      return ok(await bridge.call('scroll', {
        tabId: args.tab_id,
        deltaX: typeof args.delta_x === 'number' ? args.delta_x : 0,
        deltaY: typeof args.delta_y === 'number' ? args.delta_y : 800,
      }));
    }

    if (name === 'browser_wait') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      return ok(await bridge.call('wait', {
        tabId: args.tab_id,
        ms: typeof args.ms === 'number' ? args.ms : 1000,
      }));
    }

    if (name === 'browser_close_tab') {
      assertNumber(args.tab_id, 'tab_id');
      await ensureBrowserReady();
      return ok(await bridge.call('close_tab', { tabId: args.tab_id }));
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return fail(error);
  }
});

process.on('SIGINT', async () => {
  await bridge.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bridge.close();
  process.exit(0);
});

async function main() {
  debugEvent('server.transport.connect.before', 'service', { transport: 'stdio' });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugEvent('server.transport.connect.after', 'service', { transport: 'stdio' });
}

main().catch(async (error) => {
  console.error(error);
  await bridge.close();
  process.exit(1);
});
