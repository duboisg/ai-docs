import { BrowserBridge } from '../src/bridge.js';

const bridge = new BrowserBridge({
  host: '127.0.0.1',
  port: Number.parseInt(process.env.BROWSER_AGENT_BRIDGE_PORT ?? '32145', 10),
  requestTimeoutMs: 30_000,
}).start();

function findLinkIndex(snapshot) {
  const actionables = Array.isArray(snapshot.actionables) ? snapshot.actionables : [];
  return actionables.findIndex((actionable) => actionable.tag === 'a');
}

try {
  console.error('smoke: waiting for extension');
  const clientInfo = await bridge.waitForClient(30_000);
  console.error('smoke: opening initial tab');
  const opened = await bridge.call('open_tab', {
    url: 'https://example.com/',
    active: true,
  });
  const tabId = opened.tabId;

  console.error('smoke: waiting for initial page');
  await bridge.call('wait', { tabId, ms: 1500 });

  console.error('smoke: snapshotting initial page');
  const initialSnapshot = await bridge.call('snapshot_tab', {
    tabId,
    maxTextChars: 5000,
    maxActionables: 100,
  });

  const linkIndex = findLinkIndex(initialSnapshot);
  if (linkIndex < 0) {
    throw new Error('Could not find the expected link on example.com.');
  }

  console.error('smoke: clicking documentation link');
  await bridge.call('click', {
    tabId,
    actionIndex: linkIndex,
  });

  console.error('smoke: waiting for destination page');
  await bridge.call('wait', { tabId, ms: 2000 });

  console.error('smoke: snapshotting destination page');
  const destinationSnapshot = await bridge.call('snapshot_tab', {
    tabId,
    maxTextChars: 5000,
    maxActionables: 100,
  });

  console.log(JSON.stringify({
    clientInfo,
    initialPage: {
      title: initialSnapshot.title,
      url: initialSnapshot.url,
      visibleText: initialSnapshot.visibleText,
      linkIndex,
    },
    destinationPage: {
      title: destinationSnapshot.title,
      url: destinationSnapshot.url,
      visibleText: destinationSnapshot.visibleText,
    },
  }, null, 2));
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await bridge.close();
}
