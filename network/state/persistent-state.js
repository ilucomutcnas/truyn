import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

const STATE_VERSION = 1;

export class DurableNetworkState {
  constructor({ filePath } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('network state filePath is required');
    this.filePath = filePath;
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed?.version !== STATE_VERSION) throw new Error('unsupported_network_state_version');
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(state) {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const handle = await open(temp, 'w', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ version: STATE_VERSION, ...state })}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, this.filePath);
    try {
      const dirHandle = await open(dir, 'r');
      try { await dirHandle.sync(); } finally { await dirHandle.close(); }
    } catch {
      // Directory fsync is not available on every platform; the atomic file rename is still retained.
    }
    return this.filePath;
  }
}
