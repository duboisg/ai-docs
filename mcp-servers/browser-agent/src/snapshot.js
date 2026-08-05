function toStringValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

function clip(text, maxChars) {
  const value = toStringValue(text);
  if (!value) {
    return null;
  }
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}…`;
}

function normalizeRect(rect) {
  if (!rect || typeof rect !== 'object') {
    return null;
  }
  const x = Number(rect.x ?? rect.left ?? 0);
  const y = Number(rect.y ?? rect.top ?? 0);
  const width = Number(rect.width ?? rect.w ?? 0);
  const height = Number(rect.height ?? rect.h ?? 0);
  return { x, y, width, height };
}

function normalizeActionable(actionable, index) {
  return {
    index,
    frameId: Number(actionable.frameId ?? 0),
    frameActionIndex: Number(actionable.frameActionIndex ?? index),
    tag: toStringValue(actionable.tag),
    role: toStringValue(actionable.role),
    name: clip(actionable.name, 160),
    text: clip(actionable.text, 200),
    href: clip(actionable.href, 300),
    type: toStringValue(actionable.type),
    value: clip(actionable.value, 120),
    checked: Boolean(actionable.checked),
    disabled: Boolean(actionable.disabled),
    placeholder: clip(actionable.placeholder, 120),
    ariaLabel: clip(actionable.ariaLabel, 160),
    title: clip(actionable.title, 160),
    rect: normalizeRect(actionable.rect),
  };
}

export function compactTab(tab) {
  return {
    id: tab.id,
    windowId: tab.windowId ?? null,
    index: tab.index ?? null,
    active: Boolean(tab.active),
    audible: Boolean(tab.audible),
    pinned: Boolean(tab.pinned),
    discarded: Boolean(tab.discarded),
    incognito: Boolean(tab.incognito),
    status: toStringValue(tab.status),
    title: clip(tab.title, 200),
    url: clip(tab.url, 500),
    favIconUrl: clip(tab.favIconUrl, 300),
    lastAccessed: tab.lastAccessed ?? null,
  };
}

export function compactSnapshot(snapshot, {
  maxTextChars = 6000,
  maxActionables = 120,
} = {}) {
  const actionables = Array.isArray(snapshot.actionables)
    ? snapshot.actionables.slice(0, maxActionables).map(normalizeActionable)
    : [];

  return {
    tabId: snapshot.tabId ?? null,
    windowId: snapshot.windowId ?? null,
    title: clip(snapshot.title, 200),
    url: clip(snapshot.url, 500),
    readyState: toStringValue(snapshot.readyState),
    loading: Boolean(snapshot.loading),
    viewport: snapshot.viewport && typeof snapshot.viewport === 'object'
      ? {
          width: Number(snapshot.viewport.width ?? 0),
          height: Number(snapshot.viewport.height ?? 0),
          scrollX: Number(snapshot.viewport.scrollX ?? 0),
          scrollY: Number(snapshot.viewport.scrollY ?? 0),
        }
      : null,
    activeElement: snapshot.activeElement && typeof snapshot.activeElement === 'object'
      ? {
          tag: toStringValue(snapshot.activeElement.tag),
          role: toStringValue(snapshot.activeElement.role),
          name: clip(snapshot.activeElement.name, 160),
          text: clip(snapshot.activeElement.text, 160),
          type: toStringValue(snapshot.activeElement.type),
          value: clip(snapshot.activeElement.value, 120),
        }
      : null,
    headings: Array.isArray(snapshot.headings)
      ? snapshot.headings.slice(0, 40).map((heading) => ({
          frameId: Number(heading.frameId ?? 0),
          level: Number(heading.level ?? 0),
          text: clip(heading.text, 200),
          rect: normalizeRect(heading.rect),
        }))
      : [],
    actionables,
    visibleText: clip(snapshot.visibleText, maxTextChars),
    visibleTextTruncated: typeof snapshot.visibleText === 'string'
      ? snapshot.visibleText.length > maxTextChars
      : false,
    frameCount: Number(snapshot.frameCount ?? 1),
    notes: clip(snapshot.notes, 500),
  };
}
