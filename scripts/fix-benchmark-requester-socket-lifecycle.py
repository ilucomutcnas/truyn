from pathlib import Path

p = Path('benchmarks/cross-cloud-ab.js')
s = p.read_text()

def replace_once(before, after, label):
    global s
    count = s.count(before)
    if count != 1:
        raise SystemExit(f'{label}: expected one anchor, found {count}')
    s = s.replace(before, after, 1)

replace_once(
    """  const chain = await requester.compactChain(stages, { waitMs: 120_000 });
  const endToEndLatencyMs = Date.now() - startedAt;
  if (chain.results.length < 1) throw new Error('TRUYN CHAIN returned no provider results');""",
    """  const chain = await requester.compactChain(stages, { waitMs: 120_000 });
  const endToEndLatencyMs = Date.now() - startedAt;
  if (chain.requesterTransport !== 'websocket') throw new Error(`TRUYN benchmark requester transport was ${chain.requesterTransport || 'unknown'}, expected websocket`);
  if (chain.results.length < 1) throw new Error('TRUYN CHAIN returned no provider results');""",
    'compactChain transport assertion'
)

replace_once(
    """  const relayTrace = await fetchRelayChainTrace(chain.chainId);
  const relaySegments = relayTrace.segments || {};""",
    """  const relayTrace = await fetchRelayChainTrace(chain.chainId);
  if (relayTrace.requesterTransport !== 'websocket') throw new Error(`Relay trace requester transport was ${relayTrace.requesterTransport || 'unknown'}, expected websocket`);
  if (JSON.stringify(relayTrace.stageTransport) !== JSON.stringify(['socket', 'socket'])) throw new Error(`Relay trace provider transports were ${JSON.stringify(relayTrace.stageTransport)}, expected two sockets`);
  const relaySegments = relayTrace.segments || {};""",
    'relay trace transport assertion'
)

replace_once(
    """  relayBootstrapNetworkRetries: report.methodology.relayBootstrapNetworkRetryEvents.length
}, null, 2));""",
    """  relayBootstrapNetworkRetries: report.methodology.relayBootstrapNetworkRetryEvents.length
}, null, 2));
requester.closeFastSocket();""",
    'requester socket close'
)

p.write_text(s)
