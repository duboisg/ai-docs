import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSupervisor } from '../src/browser-supervisor.js';

test('BrowserSupervisor uses the native Windows launcher by default', () => {
  const supervisor = new BrowserSupervisor();
  assert.match(supervisor.startScript, /scripts[\\/]start-windows\.ps1$/);
  assert.equal(supervisor.started, false);
});
