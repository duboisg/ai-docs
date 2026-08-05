import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const serverRoot = join(dirname(__filename), '..');
const transport = new StdioClientTransport({
  command: process.execPath,
  cwd: serverRoot,
  env: process.env,
  args: [join(serverRoot, 'src', 'server.js')],
});
const client = new Client({ name: 'browser-agent-mcp-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const toolNames = listed.tools.map((tool) => tool.name);
  const expectedTools = [
    'browser_list_tabs',
    'browser_open_tab',
    'browser_focus_tab',
    'browser_snapshot_tab',
    'browser_click',
    'browser_type',
    'browser_scroll',
    'browser_wait',
    'browser_close_tab',
  ];
  if (JSON.stringify(toolNames) !== JSON.stringify(expectedTools)) {
    throw new Error(`Unexpected MCP tool surface: ${JSON.stringify(toolNames)}`);
  }

  const result = await client.callTool({ name: 'browser_list_tabs', arguments: {} });
  if (result.isError) {
    throw new Error(result.content?.[0]?.text ?? 'browser_list_tabs failed');
  }
  const payload = JSON.parse(result.content?.[0]?.text ?? '{}');
  if (!payload.bridge?.connected || !Array.isArray(payload.tabs)) {
    throw new Error(`Invalid browser_list_tabs response: ${JSON.stringify(payload)}`);
  }

  console.log(JSON.stringify({ toolNames, bridge: payload.bridge, tabCount: payload.tabs.length }, null, 2));
} finally {
  await client.close();
}
