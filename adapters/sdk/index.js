import { createProviderAccessPolicy } from '../../core/security/provider-access.js';

function normalizeCapabilities(capabilities) {
  const values = typeof capabilities === 'function' ? capabilities() : capabilities;
  if (!Array.isArray(values) || values.length === 0) throw new Error('Adapter must expose at least one capability');
  return values.map((value) => {
    if (typeof value === 'string') return { name: value };
    if (!value || typeof value.name !== 'string' || value.name.length === 0) throw new Error('Invalid adapter capability');
    return value;
  });
}

function materializePrevious(value, previousOutput) {
  if (Array.isArray(value)) return value.map((item) => materializePrevious(item, previousOutput));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value.$previous === 'output') return previousOutput;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materializePrevious(item, previousOutput)]));
  }
  return value;
}

function billingEstimate(need) {
  const value = need?.payload?.policy?.billing?.maxTokens;
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isRecoverableSocketError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message === 'fast_socket_closed'
    || error?.code === 'ECONNRESET'
    || error?.code === 'ETIMEDOUT'
    || message.includes('socket hang up')
    || message.includes('websocket closed');
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
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
  constructor({ node, adapter, pollIntervalMs = 500, fastPath = false, longPollMs = 25_000, socketPath = false, socketReconnectDelayMs = 250, accessPolicy, billingPolicy = null } = {}) {
    if (!node) throw new Error('node is required');
    this.node = node;
    this.adapter = validateAdapter(adapter);
    this.pollIntervalMs = pollIntervalMs;
    this.fastPath = fastPath;
    this.longPollMs = longPollMs;
    this.socketPath = socketPath;
    this.socketReconnectDelayMs = socketReconnectDelayMs;
    this.accessPolicy = accessPolicy || createProviderAccessPolicy();
    this.billingPolicy = billingPolicy;
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
    if (this.fastPath && this.socketPath) await this.node.ensureFastSocket();
    for (const capability of this.adapter.capabilities) {
      const result = await this.node.offer(capability.name, {
        adapter: this.adapter.name,
        adapterVersion: this.adapter.version,
        description: capability.description || null,
        fastPath: this.fastPath,
        chainPath: this.fastPath,
        socketPath: this.socketPath,
        accessMode: this.accessPolicy.mode,
        allowedRequesterIds: this.accessPolicy.mode === 'owner-only' ? this.accessPolicy.allowedRequesterIds : [],
        billingMode: this.billingPolicy?.mode || null
      });
      this.offerIds.push(result.offerId);
    }
    return this.offerIds;
  }

  normalizeEvent(event) {
    if (event.kind === 'NEED') {
      if (!event.verification?.ok) return null;
      const compact = Boolean(event.frame);
      return compact
        ? { id: event.frame.i, from: event.from, payload: event.payload, compact: true }
        : event.envelope;
    }

    if (event.kind === 'CHAIN_STAGE') {
      if (!event.verification?.ok) return null;
      if (!Number.isInteger(event.stageIndex) || !event.requestId) return null;
      if (event.stageIndex > 0 && event.priorVerification?.ok !== true) return null;
      const stage = event.payload?.stages?.[event.stageIndex];
      if (!stage) return null;
      const previousOutput = event.priorResult?.payload?.output;
      const inputSource = Object.prototype.hasOwnProperty.call(stage, 'inputTemplate') ? stage.inputTemplate : stage.input;
      return {
        id: event.requestId,
        from: event.from,
        compact: true,
        chain: true,
        chainId: event.frame.i,
        stageIndex: event.stageIndex,
        payload: {
          capability: stage.capability,
          input: materializePrevious(inputSource, previousOutput),
          policy: stage.policy || {}
        },
        chainFrame: event.frame,
        chainPayload: event.payload,
        priorResult: event.priorResult || null
      };
    }

    return null;
  }

  async runOnce() {
    await this.publishCapabilities();
    let polled;
    if (this.fastPath && this.socketPath) {
      polled = { events: [await this.node.nextCompactSocketEvent()] };
    } else if (this.fastPath) {
      polled = await this.node.pollCompact({ waitMs: this.longPollMs });
    } else {
      polled = await this.node.poll();
    }
    let handled = 0;

    for (const event of polled.events) {
      const need = this.normalizeEvent(event);
      if (!need) continue;
      const compact = Boolean(need.compact);
      const capability = need.payload?.capability?.name || need.payload?.capability;
      if (!this.adapter.capabilities.some((item) => item.name === capability)) continue;

      const access = this.accessPolicy.authorize(need);
      if (!access?.ok) {
        const metadata = {
          adapter: this.adapter.name,
          adapterVersion: this.adapter.version,
          latencyMs: 0,
          error: 'PROVIDER_ACCESS_DENIED',
          errorClass: 'authorization',
          accessDenied: true,
          accessMode: this.accessPolicy.mode,
          failed: true
        };
        if (need.chain) metadata.chainStage = need.stageIndex;
        if (compact) await this.node.compactResult(need.id, null, metadata);
        else await this.node.result(need.id, null, metadata);
        handled += 1;
        continue;
      }

      let billing = null;
      if (this.billingPolicy) {
        billing = this.billingPolicy.authorize(need, {
          accessPolicy: this.accessPolicy,
          estimatedTokens: billingEstimate(need)
        });
        if (!billing?.ok) {
          const metadata = {
            adapter: this.adapter.name,
            adapterVersion: this.adapter.version,
            latencyMs: 0,
            error: 'PROVIDER_BILLING_DENIED',
            errorClass: 'billing',
            billingDenied: true,
            billingMode: this.billingPolicy.mode,
            billingReason: billing?.reason || 'billing_not_authorized',
            failed: true
          };
          if (need.chain) metadata.chainStage = need.stageIndex;
          if (compact) await this.node.compactResult(need.id, null, metadata);
          else await this.node.result(need.id, null, metadata);
          handled += 1;
          continue;
        }
      }

      const startedAt = Date.now();
      try {
        let input = need.payload?.input;
        let contextResolution = null;
        if (typeof this.node.materializeContextRefs === 'function') {
          const resolved = await this.node.materializeContextRefs(input);
          input = resolved.value;
          if ((resolved.stats?.contextRefs || 0) > 0) contextResolution = resolved.stats;
        }
        const execution = await this.adapter.execute({
          capability,
          input,
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
        if (billing) {
          metadata.billingMode = billing.mode;
          metadata.billingResponsibility = billing.billingResponsibility;
        }
        if (contextResolution) metadata.contextResolution = contextResolution;
        if (need.chain) metadata.chainStage = need.stageIndex;
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
        if (billing) {
          metadata.billingMode = billing.mode;
          metadata.billingResponsibility = billing.billingResponsibility;
        }
        if (need.chain) metadata.chainStage = need.stageIndex;
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
        try {
          await this.runOnce();
        } catch (error) {
          if (this.running && this.fastPath && this.socketPath && isRecoverableSocketError(error)) {
            this.node.closeFastSocket?.();
            await delay(this.socketReconnectDelayMs);
            continue;
          }
          throw error;
        }
        if (!this.running) break;
        if (!this.fastPath && this.pollIntervalMs > 0) {
          await delay(this.pollIntervalMs);
        }
      }
    })();
  }

  async stop() {
    this.running = false;
    this.node.closeFastSocket?.();
    if (this.loopPromise) {
      try { await this.loopPromise; } catch {}
    }
  }
}
