import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function safeContext(context = {}) {
  return {
    peerNodeId: typeof context.peerNodeId === 'string' ? context.peerNodeId : null,
    transport: typeof context.transport === 'string' ? context.transport : null
  };
}

function serializedError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : null,
    message: typeof error?.message === 'string' ? error.message : 'durable_work_failed'
  };
}

function restoredError(value) {
  const error = new Error(value?.message || 'durable_work_failed');
  if (value?.code) error.code = value.code;
  return error;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const handle = await open(temp, 'w', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, path);
}

export class DurableAcceptedWorkInbox {
  constructor({ filePath, maxCompleted = 10_000 } = {}) {
    if (!filePath) throw new Error('durable inbox filePath is required');
    if (!Number.isInteger(maxCompleted) || maxCompleted < 1) throw new Error('maxCompleted must be a positive integer');
    this.filePath = filePath;
    this.maxCompleted = maxCompleted;
    this.entries = new Map();
    this.inFlight = new Map();
    this.loaded = false;
    this.writeQueue = Promise.resolve();
  }

  async load() {
    if (this.loaded) return this.snapshot();
    let value = { version: 1, entries: [] };
    try {
      value = JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (value?.version !== 1 || !Array.isArray(value.entries)) throw new Error('invalid_durable_inbox_state');
    this.entries.clear();
    for (const entry of value.entries) {
      if (!entry?.id || !['pending', 'completed', 'failed'].includes(entry.status) || !entry.envelope) {
        throw new Error('invalid_durable_inbox_entry');
      }
      this.entries.set(entry.id, entry);
    }
    this.loaded = true;
    return this.snapshot();
  }

  snapshot() {
    const counts = { pending: 0, completed: 0, failed: 0 };
    for (const entry of this.entries.values()) counts[entry.status] += 1;
    return {
      filePath: this.filePath,
      total: this.entries.size,
      pending: counts.pending,
      completed: counts.completed,
      failed: counts.failed,
      inFlight: this.inFlight.size,
      guarantee: 'at-least-once-recovery'
    };
  }

  pending() {
    return [...this.entries.values()]
      .filter((entry) => entry.status === 'pending')
      .sort((a, b) => String(a.acceptedAt).localeCompare(String(b.acceptedAt)))
      .map(clone);
  }

  async #persist() {
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      entries: [...this.entries.values()]
    };
    this.writeQueue = this.writeQueue.then(() => atomicJson(this.filePath, snapshot));
    await this.writeQueue;
  }

  #trimCompleted() {
    const completed = [...this.entries.values()]
      .filter((entry) => entry.status === 'completed')
      .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)));
    while (completed.length > this.maxCompleted) {
      const entry = completed.shift();
      this.entries.delete(entry.id);
    }
  }

  async accept(envelope, context = {}) {
    await this.load();
    if (!envelope?.id) throw new Error('durable inbox envelope id is required');
    const existing = this.entries.get(envelope.id);
    if (existing) return clone(existing);
    const now = new Date().toISOString();
    const entry = {
      id: envelope.id,
      status: 'pending',
      envelope: clone(envelope),
      context: safeContext(context),
      attempts: 0,
      acceptedAt: now,
      updatedAt: now,
      result: null,
      error: null
    };
    this.entries.set(entry.id, entry);
    await this.#persist();
    return clone(entry);
  }

  async #complete(id, result) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('durable inbox entry missing');
    entry.status = 'completed';
    entry.result = clone(result);
    entry.error = null;
    entry.updatedAt = new Date().toISOString();
    this.#trimCompleted();
    await this.#persist();
  }

  async #fail(id, error) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error('durable inbox entry missing');
    entry.status = 'failed';
    entry.result = null;
    entry.error = serializedError(error);
    entry.updatedAt = new Date().toISOString();
    await this.#persist();
  }

  async run(envelope, context, handler) {
    if (typeof handler !== 'function') throw new Error('durable inbox handler is required');
    await this.load();
    const existing = this.entries.get(envelope?.id);
    if (existing?.status === 'completed') return clone(existing.result);
    if (existing?.status === 'failed') throw restoredError(existing.error);
    if (this.inFlight.has(envelope?.id)) return this.inFlight.get(envelope.id);
    const entry = existing || await this.accept(envelope, context);
    const execution = (async () => {
      entry.attempts = (entry.attempts || 0) + 1;
      entry.updatedAt = new Date().toISOString();
      await this.#persist();
      try {
        const result = await handler(clone(entry.envelope), { ...clone(entry.context), recovered: entry.attempts > 1 });
        await this.#complete(entry.id, result);
        return clone(result);
      } catch (error) {
        await this.#fail(entry.id, error);
        throw error;
      } finally {
        this.inFlight.delete(entry.id);
      }
    })();
    this.inFlight.set(entry.id, execution);
    return execution;
  }

  async recover(handler) {
    await this.load();
    const results = [];
    for (const entry of this.pending()) {
      try {
        const result = await this.run(entry.envelope, entry.context, handler);
        results.push({ id: entry.id, ok: true, result });
      } catch (error) {
        results.push({ id: entry.id, ok: false, error: serializedError(error) });
      }
    }
    return results;
  }
}
