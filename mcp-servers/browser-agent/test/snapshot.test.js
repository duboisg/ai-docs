import test from 'node:test';
import assert from 'node:assert/strict';
import { compactSnapshot, compactTab } from '../src/snapshot.js';

test('compactTab trims long fields', () => {
  const tab = compactTab({
    id: 3,
    windowId: 11,
    index: 2,
    active: true,
    title: 'x'.repeat(400),
    url: 'https://example.com/' + 'y'.repeat(500),
  });

  assert.equal(tab.id, 3);
  assert.equal(tab.windowId, 11);
  assert.equal(tab.title.length, 201);
  assert.equal(tab.url.length, 501);
});

test('compactSnapshot limits actionable list and visible text', () => {
  const snapshot = compactSnapshot({
    title: 'Demo',
    url: 'https://example.com',
    visibleText: 'a'.repeat(8000),
    actionables: Array.from({ length: 200 }, (_, index) => ({
      tag: 'button',
      text: `Button ${index}`,
      rect: { x: index, y: index + 1, width: 10, height: 20 },
    })),
  });

  assert.equal(snapshot.visibleText.endsWith('…'), true);
  assert.equal(snapshot.visibleTextTruncated, true);
  assert.equal(snapshot.actionables.length, 120);
});

test('compactSnapshot preserves embedded-frame metadata', () => {
  const snapshot = compactSnapshot({
    frameCount: 2,
    headings: [{ frameId: 7, level: 2, text: 'Embedded lesson' }],
    actionables: [{
      frameId: 7,
      frameActionIndex: 3,
      tag: 'button',
      text: 'Continue',
    }],
  });

  assert.equal(snapshot.frameCount, 2);
  assert.equal(snapshot.headings[0].frameId, 7);
  assert.equal(snapshot.actionables[0].frameId, 7);
  assert.equal(snapshot.actionables[0].frameActionIndex, 3);
});
