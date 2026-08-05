import { EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';
import { debugEvent } from './debug-trace.js';

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}

export class BrowserBridge extends EventEmitter {
  constructor({
    host = '127.0.0.1',
    port = 32145,
    requestTimeoutMs = 30_000,
  } = {}) {
    super();
    this.host = host;
    this.port = port;
    this.requestTimeoutMs = requestTimeoutMs;
    this.server = null;
    this.client = null;
    this.clientInfo = null;
    this.pending = new Map();
    this.nextRequestId = 1;
    this._waiters = [];
  }

  start() {
    if (this.server) {
      return this;
    }

    debugEvent('bridge.start.before', 'service', { host: this.host, port: this.port });
    this.server = new WebSocketServer({ host: this.host, port: this.port });
    this.server.on('connection', (socket, request) => {
      if (this.client) {
        const previousClient = this.client;
        previousClient.terminate();
      }

      this.client = socket;
      this.clientInfo = {
        remoteAddress: request.socket?.remoteAddress ?? null,
        remotePort: request.socket?.remotePort ?? null,
      };
      debugEvent('bridge.client.connected', 'service', {
        port: this.port,
        remote_address: this.clientInfo.remoteAddress,
        pending_count: this.pending.size,
      });
      this.emit('connect', this.clientInfo);
      this._flushWaiters();

      socket.on('message', (data) => this._handleMessage(data));
      socket.on('close', () => this._handleDisconnect(socket));
      socket.on('error', (error) => this._reportError(error, 'socket'));

      this._send({
        type: 'hello',
        bridgePort: this.port,
        requestTimeoutMs: this.requestTimeoutMs,
      }).catch((error) => this.emit('error', error));

      for (const [id, pending] of this.pending) {
        this._send({
          type: 'request',
          id,
          method: pending.method,
          params: pending.params,
        }).catch((error) => {
          clearTimeout(pending.timer);
          this.pending.delete(id);
          pending.reject(error);
        });
      }
    });

    this.server.on('error', (error) => this._reportError(error, 'server'));
    debugEvent('bridge.start.after', 'service', { host: this.host, port: this.port });
    return this;
  }

  async close() {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('browser bridge closed'));
    }
    this.pending.clear();

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    if (this.server) {
      await new Promise((resolve) => this.server.close(resolve));
      this.server = null;
    }
  }

  async waitForClient(timeoutMs = this.requestTimeoutMs) {
    if (this.client?.readyState === 1) {
      return this.clientInfo;
    }

    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this._waiters = this._waiters.filter((item) => item !== wrappedResolve);
        reject(new Error(`Timed out waiting for browser extension connection after ${timeoutMs}ms`));
      }, timeoutMs);

      const wrappedResolve = (value) => {
        clearTimeout(timeout);
        resolve(value);
      };

      this._waiters.push(wrappedResolve);
    });
  }

  async call(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    await this.waitForClient(timeoutMs);

    const id = this.nextRequestId++;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for browser response to ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer, method, params });
      this._send({ type: 'request', id, method, params }).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  status() {
    return {
      connected: Boolean(this.client && this.client.readyState === 1),
      port: this.port,
      host: this.host,
      client: this.clientInfo,
      pending: this.pending.size,
    };
  }

  async _send(message) {
    if (!this.client || this.client.readyState !== 1) {
      throw new Error('browser extension is not connected');
    }

    this.client.send(JSON.stringify(message));
  }

  _flushWaiters() {
    const waiters = this._waiters.splice(0, this._waiters.length);
    for (const resolve of waiters) {
      resolve(this.clientInfo);
    }
  }

  _handleDisconnect(socket = this.client) {
    if (socket !== this.client) {
      return;
    }
    this.client = null;
    this.clientInfo = null;
    debugEvent('bridge.client.disconnected', 'service', {
      port: this.port,
      pending_count: this.pending.size,
    });
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('browser extension disconnected'));
    }
    this.pending.clear();
    this.emit('disconnect');
  }

  _reportError(error, source) {
    const message = error instanceof Error ? error.message : String(error);
    debugEvent('bridge.error', 'service', {
      port: this.port,
      source,
      message,
      listener_count: this.listenerCount('error'),
    });

    // EventEmitter treats an unhandled `error` event as fatal. A transient
    // WebSocket failure must not close the MCP stdio transport.
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    } else {
      console.error(`[browser-agent] bridge ${source} error: ${message}`);
    }
  }

  _handleMessage(data) {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    const parsed = safeJsonParse(text);
    if (!parsed.ok) {
      this.emit('error', parsed.error);
      return;
    }

    const message = parsed.value;
    if (message?.type === 'response') {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) {
        pending.resolve(message.result);
      } else {
        pending.reject(new Error(message.error?.message ?? 'browser call failed'));
      }
      return;
    }

    if (message?.type === 'event') {
      this.emit(message.name ?? 'event', message.payload);
    }
  }
}
