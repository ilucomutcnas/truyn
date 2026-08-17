import { randomBytes } from 'node:crypto';

export const NAT_TRAVERSAL_PROTOCOL = 'truyn-nat-punch-v1';

export function createPunchPlan({ localNodeId, peerNodeId, localMapped, peerMapped, attempts = 12, intervalMs = 75, token = randomBytes(16).toString('base64url') } = {}) {
  if (!localNodeId || !peerNodeId) throw new Error('punch plan node identities are required');
  if (!localMapped?.address || !localMapped?.port || !peerMapped?.address || !peerMapped?.port) throw new Error('punch plan mapped endpoints are required');
  return {
    protocol: NAT_TRAVERSAL_PROTOCOL,
    localNodeId,
    peerNodeId,
    localMapped,
    peerMapped,
    token,
    attempts: Math.max(1, Math.min(64, Math.floor(attempts))),
    intervalMs: Math.max(20, Math.min(1000, Math.floor(intervalMs)))
  };
}

async function sendDatagram(socket, payload, port, address) {
  const result = socket.send(payload, port, address);
  if (result && typeof result.then === 'function') await result;
}

export async function punchUdp({ socket, plan, signal = null } = {}) {
  if (!socket?.send) throw new Error('bound UDP/QUIC socket is required');
  if (plan?.protocol !== NAT_TRAVERSAL_PROTOCOL) throw new Error('invalid punch plan');
  const payload = Buffer.from(JSON.stringify({ protocol: NAT_TRAVERSAL_PROTOCOL, token: plan.token, from: plan.localNodeId, to: plan.peerNodeId }));
  let sent = 0;
  for (let attempt = 0; attempt < plan.attempts; attempt += 1) {
    if (signal?.aborted) throw signal.reason || new Error('punch_aborted');
    await sendDatagram(socket, payload, plan.peerMapped.port, plan.peerMapped.address);
    sent += 1;
    if (attempt + 1 < plan.attempts) await new Promise((resolve) => setTimeout(resolve, plan.intervalMs));
  }
  return { sent, target: { address: plan.peerMapped.address, port: plan.peerMapped.port } };
}

export async function punchQuicSocket({ quicTransport, peerNodeId, localMapped, peerMapped, attempts = 12, intervalMs = 75, token, signal = null } = {}) {
  if (!quicTransport?.socket?.send || !quicTransport?.identity?.nodeId) throw new Error('started TRUYN QUIC transport is required');
  const plan = createPunchPlan({
    localNodeId: quicTransport.identity.nodeId,
    peerNodeId,
    localMapped,
    peerMapped,
    attempts,
    intervalMs,
    token
  });
  return punchUdp({ socket: quicTransport.socket, plan, signal });
}

export function isPunchProbe(message, { token = null, localNodeId = null } = {}) {
  try {
    const value = JSON.parse(Buffer.from(message).toString('utf8'));
    if (value?.protocol !== NAT_TRAVERSAL_PROTOCOL) return false;
    if (token && value.token !== token) return false;
    if (localNodeId && value.to !== localNodeId) return false;
    return true;
  } catch { return false; }
}
