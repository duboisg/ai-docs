import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserBridge } from '../src/bridge.js';

test('BrowserBridge round trips a request through a connected extension client', async () => {
  const bridge = new BrowserBridge({
    host: '127.0.0.1',
    port: 0,
    requestTimeoutMs: 2000,
  });

  const sent = [];
  bridge.client = {
    readyState: 1,
    send(payload) {
      sent.push(JSON.parse(payload));
    },
    close() {},
  };
  bridge.clientInfo = {
    remoteAddress: '127.0.0.1',
    remotePort: 12345,
  };

  const responsePromise = bridge.call('list_tabs', {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'request');
  assert.equal(sent[0].method, 'list_tabs');

  bridge._handleMessage(JSON.stringify({
    type: 'response',
    id: sent[0].id,
    ok: true,
    result: {
      tabs: [
        {
          id: 5,
          windowId: 2,
          index: 0,
          active: true,
          title: 'Example tab',
          url: 'https://example.com',
        },
      ],
      focusedWindowId: 2,
    },
  }));

  const result = await responsePromise;
  assert.equal(result.tabs[0].id, 5);
  assert.equal(result.tabs[0].title, 'Example tab');
  assert.equal(result.focusedWindowId, 2);
});

test('BrowserBridge does not crash when a socket error has no listener', () => {
  const bridge = new BrowserBridge({ host: '127.0.0.1', port: 0 });
  const originalConsoleError = console.error;
  const messages = [];
  console.error = (message) => messages.push(message);

  try {
    assert.doesNotThrow(() => bridge._reportError(new Error('transient socket failure'), 'socket'));
    assert.equal(messages.length, 1);
    assert.match(messages[0], /transient socket failure/);
  } finally {
    console.error = originalConsoleError;
  }
});
