from pathlib import Path

path = Path('benchmarks/context-ref-delta-ab.js')
text = path.read_text()
old = "const requester = new TruynNode({ relayUrl });\nawait requester.register({ name: 'context-economic-benchmark-requester' });\n"
new = """const requester = new TruynNode({ relayUrl });

async function fetchRelayChainTrace(chainId) {
  const traceUrl = `${relayUrl}/v1/fast/chains/${encodeURIComponent(chainId)}/trace`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(traceUrl, {
      headers: { authorization: `Bearer ${requester.sessionToken}` }
    });
    const body = await response.json();
    if (response.ok) return body.trace;
    if (response.status !== 409) throw new Error(body.error || `Trace HTTP ${response.status}`);
    await sleep(10);
  }
  throw new Error('Timed out waiting for relay chain trace flush');
}

await requester.register({ name: 'context-economic-benchmark-requester' });
"""
if old not in text:
    raise SystemExit('requester anchor not found')
text = text.replace(old, new, 1)
old = """  const trace = await requester.chainTrace(chain.chainId);
  if (JSON.stringify(trace.trace?.stageTransport) !== JSON.stringify(['socket', 'socket'])) {
    throw new Error(`TRUYN provider transport fallback: ${JSON.stringify(trace.trace?.stageTransport)}`);
  }
"""
new = """  const trace = await fetchRelayChainTrace(chain.chainId);
  if (JSON.stringify(trace.stageTransport) !== JSON.stringify(['socket', 'socket'])) {
    throw new Error(`TRUYN provider transport fallback: ${JSON.stringify(trace.stageTransport)}`);
  }
"""
if old not in text:
    raise SystemExit('trace anchor not found')
path.write_text(text.replace(old, new, 1))
print('context benchmark trace helper fixed')
