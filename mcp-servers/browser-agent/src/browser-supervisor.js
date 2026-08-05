import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { debugEvent } from './debug-trace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runPowerShell(scriptPath) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
    ], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Browser agent Windows launcher exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      }
    });
  });
}

export class BrowserSupervisor {
  constructor({
    startScript = join(__dirname, '..', 'scripts', 'start-windows.ps1'),
  } = {}) {
    this.startScript = startScript;
    this.startPromise = null;
    this.started = false;
  }

  async ensureStarted() {
    if (this.started) {
      return;
    }

    if (!this.startPromise) {
      debugEvent('browser.start.requested', 'service', { start_script: this.startScript });
      this.startPromise = this._start().catch((error) => {
        debugEvent('browser.start.failed', 'service', {
          start_script: this.startScript,
          message: error instanceof Error ? error.message : String(error),
        });
        this.startPromise = null;
        throw error;
      });
    }

    await this.startPromise;
    this.started = true;
    debugEvent('browser.start.ready', 'service', { start_script: this.startScript });
  }

  reset() {
    this.started = false;
    debugEvent('browser.start.reset', 'service', { start_script: this.startScript });
  }

  async _start() {
    if (!(await pathExists(this.startScript))) {
      throw new Error(`Browser agent start script not found: ${this.startScript}`);
    }
    await runPowerShell(this.startScript);
  }
}
