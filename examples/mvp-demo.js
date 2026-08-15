import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

const relay = createRelay({ localDevelopmentMode: true });
const relayUrl = await relay.listen({ port: 0 });

try {
  const alice = new TruynNode({ relayUrl });
  const bob = new TruynNode({ relayUrl });
  await alice.register({ name: 'Alice Research Agent' });
  await bob.register({ name: 'Bob Orchestrator' });
  await alice.offer('research', { description: 'Structured research capability' });
  const discovery = await bob.find('research');
  console.log(`Bob found ${discovery.offers.length} research provider(s)`);
  const matched = await bob.need('research', { question: 'Explain the TRUYN MVP in one sentence.' });
  const aliceEvents = await alice.poll();
  const needEvent = aliceEvents.events.find((event) => event.kind === 'NEED');
  if (!needEvent || !needEvent.verification.ok) throw new Error('Alice did not receive a valid signed NEED');
  await alice.result(needEvent.envelope.id, {
    answer: 'TRUYN lets independent agents discover capabilities and exchange signed structured work through a shared protocol.'
  });
  const bobEvents = await bob.poll();
  const resultEvent = bobEvents.events.find((event) => event.kind === 'RESULT');
  if (!resultEvent || !resultEvent.verification.ok) throw new Error('Bob did not receive a valid signed RESULT');
  console.log(`Matched provider: ${matched.provider}`);
  console.log('RESULT signature: VERIFIED');
  console.log(`Trustability Lite: ${resultEvent.trust.score}`);
  console.log(`Answer: ${resultEvent.envelope.payload.output.answer}`);
  console.log('TRUYN local MVP transaction complete.');
} finally {
  await relay.close();
}
