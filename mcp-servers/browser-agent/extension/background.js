const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:32145';
const CONFIG_URL = chrome.runtime.getURL('bridge-config.json');
const WORKER_ID = crypto.randomUUID();

let socket = null;
let config = { bridgeUrl: DEFAULT_BRIDGE_URL };
let reconnectTimer = null;

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: 'no-store' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (data && typeof data.bridgeUrl === 'string') {
      config = data;
    }
  } catch {
    config = { bridgeUrl: DEFAULT_BRIDGE_URL };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(socketRef, message) {
  if (socketRef && socketRef.readyState === WebSocket.OPEN) {
    socketRef.send(JSON.stringify(message));
  }
}

function callChrome(invoke) {
  return new Promise((resolve, reject) => {
    invoke((result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

function isRemovedFrameError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /frame with id .* was removed|no frame with id/i.test(message);
}

async function invokeOnTab(tabId, fn, args = []) {
  const results = await callChrome((done) => chrome.scripting.executeScript({
    target: { tabId },
    func: fn,
    args,
    injectImmediately: true,
  }, done));
  return results?.[0]?.result ?? null;
}

async function invokeOnAllFrames(tabId, fn, args = []) {
  const results = await callChrome((done) => chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: fn,
    args,
    injectImmediately: true,
  }, done));
  return Array.isArray(results) ? results : [];
}

async function invokeOnFrame(tabId, frameId, fn, args = []) {
  const results = await callChrome((done) => chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: fn,
    args,
    injectImmediately: true,
  }, done));
  return results?.[0]?.result ?? null;
}

function orderFrameResults(results) {
  return [...results].sort((left, right) => Number(left.frameId ?? 0) - Number(right.frameId ?? 0));
}

function mergeFrameSnapshots(tabId, results) {
  const ordered = orderFrameResults(results).filter((entry) => entry?.result);
  const top = ordered.find((entry) => entry.frameId === 0)?.result ?? ordered[0]?.result ?? {};
  const headings = [];
  const actionables = [];
  const visibleTextParts = [];

  for (const entry of ordered) {
    const frameId = Number(entry.frameId ?? 0);
    const snapshot = entry.result;
    if (snapshot.visibleText) {
      visibleTextParts.push(frameId === 0 ? snapshot.visibleText : `[Embedded frame ${frameId}] ${snapshot.visibleText}`);
    }
    for (const heading of snapshot.headings ?? []) {
      headings.push({ ...heading, frameId });
    }
    for (let frameActionIndex = 0; frameActionIndex < (snapshot.actionables ?? []).length; frameActionIndex += 1) {
      actionables.push({
        ...snapshot.actionables[frameActionIndex],
        frameId,
        frameActionIndex,
      });
    }
  }

  return {
    tabId,
    ...top,
    headings,
    actionables,
    visibleText: visibleTextParts.join(' '),
    frameCount: ordered.length,
  };
}

async function resolveActionableFrame(tabId, globalIndex, maxActionables = 5000) {
  const results = orderFrameResults(await invokeOnAllFrames(tabId, extractSnapshot, [{
    maxTextChars: 1,
    maxActionables,
  }]));
  let remaining = globalIndex;
  for (const entry of results) {
    const count = entry?.result?.actionables?.length ?? 0;
    if (remaining < count) {
      return { frameId: Number(entry.frameId ?? 0), frameActionIndex: remaining };
    }
    remaining -= count;
  }
  return null;
}

function sanitizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length ? text : null;
}

function isVisibleElement(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return false;
  }
  const style = getComputedStyle(element);
  if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function collectActionables(options = {}) {
  const maxActionables = Number.isFinite(options.maxActionables) ? options.maxActionables : 120;
  const nodes = Array.from(document.querySelectorAll([
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[tabindex]',
  ].join(',')));

  const actionables = [];
  for (const element of nodes) {
    if (!isVisibleElement(element)) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const tag = element.tagName.toLowerCase();
    const text = sanitizeText(element.innerText ?? element.textContent);
    const ariaLabel = sanitizeText(element.getAttribute('aria-label'));
    const title = sanitizeText(element.getAttribute('title'));
    const name = ariaLabel ?? text ?? title ?? sanitizeText(element.getAttribute('name'));
    const role = sanitizeText(element.getAttribute('role'));
    actionables.push({
      tag,
      role,
      name,
      text,
      href: tag === 'a' ? sanitizeText(element.href) : null,
      type: sanitizeText(element.getAttribute('type')),
      value: sanitizeText('value' in element ? element.value : null),
      checked: 'checked' in element ? Boolean(element.checked) : null,
      disabled: 'disabled' in element ? Boolean(element.disabled) : false,
      placeholder: sanitizeText(element.getAttribute('placeholder')),
      ariaLabel,
      title,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    });
    if (actionables.length >= maxActionables) {
      break;
    }
  }
  return actionables;
}

function collectHeadings() {
  return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .filter(isVisibleElement)
    .slice(0, 40)
    .map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: sanitizeText(heading.innerText ?? heading.textContent),
      rect: (() => {
        const rect = heading.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })(),
    }));
}

function collectActiveElement() {
  const element = document.activeElement;
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect?.();
  return {
    tag: element.tagName?.toLowerCase?.() ?? null,
    role: sanitizeText(element.getAttribute?.('role')),
    name: sanitizeText(element.getAttribute?.('aria-label') ?? element.getAttribute?.('title') ?? element.getAttribute?.('name')),
    text: sanitizeText(element.innerText ?? element.textContent),
    type: sanitizeText(element.getAttribute?.('type')),
    value: sanitizeText('value' in element ? element.value : null),
    rect: rect ? {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    } : null,
  };
}

function extractSnapshot(options = {}) {
  function sanitizeText(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text.length ? text : null;
  }
  function isVisibleElement(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
    const style = getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function collectActionables(options = {}) {
    const maxActionables = Number.isFinite(options.maxActionables) ? options.maxActionables : 120;
    const selector = 'a,button,input,textarea,select,label,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[tabindex]';
    const actionables = [];
    for (const element of document.querySelectorAll(selector)) {
      if (!isVisibleElement(element)) continue;
      const rect = element.getBoundingClientRect();
      const tag = element.tagName.toLowerCase();
      const text = sanitizeText(element.innerText ?? element.textContent);
      const ariaLabel = sanitizeText(element.getAttribute('aria-label'));
      const title = sanitizeText(element.getAttribute('title'));
      actionables.push({
        tag,
        role: sanitizeText(element.getAttribute('role')),
        name: ariaLabel ?? text ?? title ?? sanitizeText(element.getAttribute('name')),
        text,
        href: tag === 'a' ? sanitizeText(element.href) : null,
        type: sanitizeText(element.getAttribute('type')),
        value: sanitizeText('value' in element ? element.value : null),
        checked: 'checked' in element ? Boolean(element.checked) : null,
        disabled: 'disabled' in element ? Boolean(element.disabled) : false,
        placeholder: sanitizeText(element.getAttribute('placeholder')),
        ariaLabel,
        title,
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      });
      if (actionables.length >= maxActionables) break;
    }
    return actionables;
  }
  function collectHeadings() {
    return Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(isVisibleElement).slice(0, 40).map((heading) => {
      const rect = heading.getBoundingClientRect();
      return { level: Number(heading.tagName.slice(1)), text: sanitizeText(heading.innerText ?? heading.textContent), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } };
    });
  }
  function collectActiveElement() {
    const element = document.activeElement;
    if (!element) return null;
    const rect = element.getBoundingClientRect?.();
    return {
      tag: element.tagName?.toLowerCase?.() ?? null,
      role: sanitizeText(element.getAttribute?.('role')),
      name: sanitizeText(element.getAttribute?.('aria-label') ?? element.getAttribute?.('title') ?? element.getAttribute?.('name')),
      text: sanitizeText(element.innerText ?? element.textContent),
      type: sanitizeText(element.getAttribute?.('type')),
      value: sanitizeText('value' in element ? element.value : null),
      rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
    };
  }
  const maxTextChars = Number.isFinite(options.maxTextChars) ? options.maxTextChars : 6000;
  const maxActionables = Number.isFinite(options.maxActionables) ? options.maxActionables : 120;
  const bodyText = sanitizeText(document.body?.innerText ?? document.documentElement?.innerText ?? '');
  const visibleText = bodyText && bodyText.length > maxTextChars
    ? `${bodyText.slice(0, maxTextChars)}…`
    : bodyText;

  return {
    title: sanitizeText(document.title),
    url: sanitizeText(location.href),
    readyState: sanitizeText(document.readyState),
    loading: document.readyState !== 'complete',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    activeElement: collectActiveElement(),
    headings: collectHeadings(),
    actionables: collectActionables({ maxActionables }),
    visibleText,
  };
}

function elementByIndex(index, maxActionables = 120) {
  const nodes = Array.from(document.querySelectorAll([
    'a',
    'button',
    'input',
    'textarea',
    'select',
    'label',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[tabindex]',
  ].join(',')));

  let current = -1;
  for (const element of nodes) {
    if (!isVisibleElement(element)) {
      continue;
    }
    current += 1;
    if (current === index) {
      return element;
    }
    if (current >= maxActionables) {
      break;
    }
  }
  return null;
}

function clickByIndex(index, options = {}) {
  function isVisibleElement(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
  }
  function elementByIndex(index, maxActionables = 120) {
    const selector = 'a,button,input,textarea,select,label,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[tabindex]';
    let current = -1;
    for (const element of document.querySelectorAll(selector)) {
      if (!isVisibleElement(element)) continue;
      current += 1;
      if (current === index) return element;
      if (current >= maxActionables) break;
    }
    return null;
  }
  const candidate = elementByIndex(index, Number.isFinite(options.maxActionables) ? options.maxActionables : 120);
  const coordinateTarget = Number.isFinite(options.x) && Number.isFinite(options.y)
    ? document.elementFromPoint(options.x, options.y)
    : null;
  const element = coordinateTarget ?? candidate;
  if (!element) {
    return { ok: false, error: `No actionable element found at index ${index}` };
  }

  element.scrollIntoView({ block: 'center', inline: 'center' });
  const rect = element.getBoundingClientRect();
  const x = Number.isFinite(options.x) ? Math.round(options.x) : Math.round(rect.left + rect.width / 2);
  const y = Number.isFinite(options.y) ? Math.round(options.y) : Math.round(rect.top + rect.height / 2);
  window.__browserAgentLastClick = { x, y };
  if (typeof element.focus === 'function') {
    element.focus({ preventScroll: true });
  }
  const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'];
  for (const type of events) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
    }));
  }
  if (typeof element.click === 'function') {
    element.click();
  }

  return { ok: true, clicked: true, x, y };
}

function typeByIndex(index, text, options = {}) {
  function isVisibleElement(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
  }
  function elementByIndex(index, maxActionables = 120) {
    const selector = 'a,button,input,textarea,select,[contenteditable="true"],[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[role="radio"],[role="tab"],[role="menuitem"],[tabindex]';
    let current = -1;
    for (const element of document.querySelectorAll(selector)) {
      if (!isVisibleElement(element)) continue;
      current += 1;
      if (current === index) return element;
      if (current >= maxActionables) break;
    }
    return null;
  }
  const candidate = elementByIndex(index, Number.isFinite(options.maxActionables) ? options.maxActionables : 120);
  const coordinateTarget = Number.isFinite(options.x) && Number.isFinite(options.y)
    ? document.elementFromPoint(options.x, options.y)
    : null;
  const element = coordinateTarget ?? candidate;
  if (!element) {
    return { ok: false, error: `No actionable element found at index ${index}` };
  }

  element.scrollIntoView({ block: 'center', inline: 'center' });
  element.focus();

  const clear = options.clear !== false;
  const tagName = element.tagName?.toLowerCase?.() ?? '';
  const inputType = element.getAttribute?.('type')?.toLowerCase?.() ?? '';
  const textLikeInputTypes = ['', 'text', 'search', 'email', 'tel', 'url', 'password', 'number', 'date'];
  if (tagName === 'input' && !textLikeInputTypes.includes(inputType)) {
    return { ok: false, error: `Cannot type text into input type ${inputType || 'unknown'}` };
  }
  if (element.isContentEditable) {
    if (clear) {
      element.textContent = '';
    }
  }

  if (element.isContentEditable) {
    document.execCommand('insertText', false, String(text));
  } else if ('value' in element) {
    if (clear && typeof element.select === 'function') {
      element.select();
    } else if (!clear && typeof element.setSelectionRange === 'function') {
      const end = String(element.value ?? '').length;
      element.setSelectionRange(end, end);
    }
    const inserted = document.execCommand('insertText', false, String(text));
    if (!inserted) {
      const nextValue = clear ? String(text) : `${element.value ?? ''}${text}`;
      element.value = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    }
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  } else {
    document.execCommand('insertText', false, String(text));
  }

  if (options.pressEnter) {
    const form = element.form ?? element.closest?.('form');
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    }
  }

  return { ok: true, typed: String(text).length, inputMethod: 'native-edit-command' };
}

function scrollByDelta(deltaX = 0, deltaY = 800) {
  const isScrollable = (element) => {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    const canScrollY = element.scrollHeight > element.clientHeight
      && /(auto|scroll)/.test(style.overflowY);
    const canScrollX = element.scrollWidth > element.clientWidth
      && /(auto|scroll)/.test(style.overflowX);
    return (deltaY !== 0 && canScrollY) || (deltaX !== 0 && canScrollX);
  };

  let target = document.activeElement;
  if (!target || target === document.body) {
    const point = window.__browserAgentLastClick;
    target = point && Number.isFinite(point.x) && Number.isFinite(point.y)
      ? document.elementFromPoint(point.x, point.y)
      : null;
  }
  while (target && target !== document.body && !isScrollable(target)) {
    target = target.parentElement;
  }

  if (target && target !== document.body && isScrollable(target)) {
    target.scrollBy(deltaX, deltaY);
    return {
      ok: true,
      target: 'active-scroll-container',
      scrollX: target.scrollLeft,
      scrollY: target.scrollTop,
    };
  }

  window.scrollBy(deltaX, deltaY);
  return {
    ok: true,
    target: 'window',
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

async function handleRequest(message) {
  switch (message.method) {
    case 'list_tabs': {
      const tabs = await callChrome((done) => chrome.tabs.query({}, done));
      const windows = await callChrome((done) => chrome.windows.getAll({ populate: false }, done));
      const focusedWindow = windows.find((window) => window.focused);
      return {
        tabs: tabs.map((tab) => ({
          id: tab.id,
          windowId: tab.windowId,
          index: tab.index,
          active: tab.active,
          audible: tab.audible,
          pinned: tab.pinned,
          discarded: tab.discarded,
          incognito: tab.incognito,
          status: tab.status,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl ?? null,
          lastAccessed: tab.lastAccessed ?? null,
        })),
        focusedWindowId: focusedWindow?.id ?? null,
      };
    }

    case 'open_tab': {
      const tab = await chrome.tabs.create({
        url: message.params?.url || 'about:blank',
        active: message.params?.active !== false,
      });
      return {
        tabId: tab.id,
        windowId: tab.windowId,
        index: tab.index,
        url: tab.url,
        active: tab.active,
      };
    }

    case 'focus_tab': {
      const tabId = message.params?.tabId;
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      const updated = await chrome.tabs.update(tabId, { active: true });
      return {
        tabId: updated.id,
        windowId: updated.windowId,
        active: updated.active,
      };
    }

    case 'snapshot_tab': {
      const tabId = message.params?.tabId;
      const snapshots = await invokeOnAllFrames(tabId, extractSnapshot, [{
        maxTextChars: message.params?.maxTextChars,
        maxActionables: message.params?.maxActionables,
      }]);
      return mergeFrameSnapshots(tabId, snapshots);
    }

    case 'click': {
      const tabId = message.params?.tabId;
      const globalIndex = message.params?.actionIndex ?? -1;
      const target = await resolveActionableFrame(tabId, globalIndex, message.params?.maxActionables ?? 5000);
      if (!target) {
        throw new Error(`No actionable element found at index ${globalIndex}`);
      }
      let result;
      try {
        result = await invokeOnFrame(tabId, target.frameId, clickByIndex, [
          target.frameActionIndex,
          {
            maxActionables: message.params?.maxActionables ?? 5000,
            x: message.params?.x,
            y: message.params?.y,
            button: message.params?.button,
          },
        ]);
      } catch (error) {
        if (!isRemovedFrameError(error)) {
          throw error;
        }
        result = { ok: true, clicked: true, navigationStarted: true };
      }
      if (!result?.ok) {
        throw new Error(result?.error ?? 'Click failed');
      }
      return { tabId, frameId: target.frameId, ...result };
    }

    case 'type': {
      const tabId = message.params?.tabId;
      const result = await invokeOnTab(tabId, typeByIndex, [
        message.params?.actionIndex ?? -1,
        message.params?.text ?? '',
        {
          maxActionables: message.params?.maxActionables ?? 5000,
          clear: message.params?.clear !== false,
          pressEnter: Boolean(message.params?.pressEnter),
        },
      ]);
      if (!result?.ok) {
        throw new Error(result?.error ?? 'Type failed');
      }
      return { tabId, ...result };
    }

    case 'scroll': {
      const tabId = message.params?.tabId;
      const result = await invokeOnTab(tabId, scrollByDelta, [
        message.params?.deltaX ?? 0,
        message.params?.deltaY ?? 800,
      ]);
      return { tabId, ...result };
    }

    case 'wait': {
      const ms = Number(message.params?.ms ?? 1000);
      await sleep(ms);
      const tab = await chrome.tabs.get(message.params?.tabId);
      return {
        ok: true,
        tabId: tab.id,
        waitedMs: ms,
        status: tab.status,
        url: tab.url,
      };
    }

    case 'close_tab': {
      const tabId = message.params?.tabId;
      await chrome.tabs.remove(tabId);
      return { tabId, closed: true };
    }

    default:
      throw new Error(`Unknown browser bridge method: ${message.method}`);
  }
}

async function connect() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }
  await loadConfig();
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    return;
  }
  let socketRef;
  try {
    socketRef = new WebSocket(config.bridgeUrl);
    socket = socketRef;
  } catch {
    await sleep(1000);
    scheduleReconnect();
    return;
  }

  socketRef.onopen = () => {
    send(socketRef, {
      type: 'event',
      name: 'bridge.connected',
      payload: {
        bridgeUrl: config.bridgeUrl,
        workerId: WORKER_ID,
      },
    });
  };

  socketRef.onmessage = async (event) => {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      send(socketRef, {
        type: 'event',
        name: 'bridge.error',
        payload: { message: String(error) },
      });
      return;
    }

    if (message.type === 'request') {
      try {
        const result = await handleRequest(message);
        send(socketRef, { type: 'response', id: message.id, ok: true, result });
      } catch (error) {
        send(socketRef, {
          type: 'response',
          id: message.id,
          ok: false,
          error: {
            message: `${message.method}: ${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    }
  };

  socketRef.onerror = () => {
    // Reconnect path handles the recovery.
  };

  socketRef.onclose = () => {
    if (socket === socketRef) {
      socket = null;
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await connect();
  }, 1000);
}

chrome.runtime.onInstalled.addListener(() => {
  connect().catch(() => scheduleReconnect());
});

chrome.runtime.onStartup.addListener(() => {
  connect().catch(() => scheduleReconnect());
});

connect().catch(() => scheduleReconnect());

setInterval(() => {
  send(socket, {
    type: 'event',
    name: 'bridge.heartbeat',
    payload: { workerId: WORKER_ID, timestamp: Date.now() },
  });
}, 10_000);
