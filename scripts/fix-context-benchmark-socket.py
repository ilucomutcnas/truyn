from pathlib import Path

path = Path('benchmarks/context-ref-delta-ab.js')
text = path.read_text()
old = """async function truynRun(id) {
  const expected = updatedValues.get(id);
  const ref = { $context: { cid: updatedContext.cid, ids: [id] } };
  const chain = await requester.compactChain([
"""
new = """async function truynRun(id) {
  const expected = updatedValues.get(id);
  const ref = { $context: { cid: updatedContext.cid, ids: [id] } };
  await requester.ensureFastSocket();
  const chain = await requester.compactChain([
"""
if old not in text:
    raise SystemExit('truynRun anchor not found')
path.write_text(text.replace(old, new, 1))
print('context benchmark requester socket refresh added')
