function normalizeCapabilities(capabilities) {
  const values = typeof capabilities === 'function' ? capabilities() : capabilities;
  if (!Array.isArray(values) || values.length === 0) throw new Error('Adapter must expose at least one capability');
  return values.map((value) => {
    if (typeof value === 'string') return { name: value };
    if (!value || typeof value.name !== 'string' || value.name.length === 0) throw new Error('Invalid adapter capability');
    return value;
  });
}

export function validateAdapter(adapter) {
  if (!adapter || typeof adapter.execute !== 'function') throw new Error('Adapter execute(request) is required');
  const capabilities = normalizeCapabilities(adapter.capabilities);
  return {
    name: adapter.name || 'truyn-adapter',
    version: adapter.version || '0.1.0',
    capabilities,
    execute: adapter.execute.bind(adapter)
  };
}

export function createFunctionAdapter({ name = 'function-adapter', version = '0.1.0', capabilities, execute }) {
  return validateAdapter({ name, version, capabilities, execute });
}

export class TruynAdapterHost {
  constructor({ node, adapter, pollIntervalMs = 500, fastPath = false, longPollMs = 25_000 }) {
    if (!node) throw new Error('node is required');
    this.node = node;
    this.adapter = validateAdapter(adapter);
    this.pollIntervalMs = pollIntervalMs;
    this.fastPath = fastPath;
    this.longPollMs = longPollMs;
    this.running = false;
    this.registered = false;
    this.offerIds = [];
    this.loopPromise = null;
  }

  async ensureRegistered() {
    if (this.registered && this.node.sessionToken) return;
    await this.node.register({ name: this.adapter.name });
    this.registered = true;
  }

  async publishCapabilities() {
    await this.ensureRegistered();
    if (this.offerIds.length > 0) return this.offerIds;
    for (const capability of this.adapter.capabilities) {
      const result = await this.node.offer(capability.name, {
        adapter: this.adapter.name,
        adapterVersion: this.adapter.version,
        description: capability.description || null,
        fastPath: this.fastPath
      });
      this.offerIds.push(result.offerId);
    }
    return this.offerIds;
  }

  async runOnce() {
    await this.publishCapabilities();
    const polled = this.fastPath
      ? await this.node.pollCompact({ waitMs: this.longPollMs })
      : await this.node.poll();
    let handled = 0;

    for (const event of polled.events) {
      if (event.kind !== 'NEED' || !event.verification?.ok) continue;
      const compact = Boolean(event.frame);
      const need = compact
        ? { id: event.frame.i, from: event.from, payload: event.payload, compact: true }
        : event.envelope;
      const capability = need.payload?.capability?.name || need.payload?.capability;
      if (!this.adapter.capabilities.some((item) => item.name === capability)) continue;

      const startedAt = Date.now();
      try {
        const execution = await this.adapter.execute({
          capability,
          input: need.payload?.input,
          policy: need.payload?.policy || {},
          need,
          node: this.node
        });
        const normalized = execution && typeof execution === 'object' && 'output' in execution
          ? execution
          : { output: execution, metadata: {} };
        const metadata = {
          adapter: this.adapter.name,
          adapterVersion: this.adapter.version,
          latencyMs: Date.now() - startedAt,
          ...(normalized.metadata || {})
        };
        if (compact) await this.node.compactResult(need.id, normalized.output, metadata);
        else await this.node.result(need.id, normalized.output, metadata);
      } catch (error) {
        const metadata = {
          adapter: this.adapter.name,
          adapterVersion: this.adapter.version,
          latencyMs: Date.now() - startedAt,
          error: error.message,
          failed: true
        };
        if (compact) await this.node.compactResult(need.id, null, metadata);
        else await this.node.result(need.id, null, metadata);
      }
      handled += 1;
    }
    return { handled, events: polled.events.length };
  }

  async start() {
    if (this.running) return;
    await this.publishCapabilities();
    this.running = true;
    this.loopPromise = (async () => {
      while (this.running) {
        await this.runOnce();
        if (!this.running) break;
        if (!this.fastPath && this.pollIntervalMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
        }
      }
    })();
  }

  async stop() {
    this.running = false;
    if (this.loopPromise) await this.loopPromise;
  }
}
