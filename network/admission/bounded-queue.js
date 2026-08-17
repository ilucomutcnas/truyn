export class BoundedAdmissionQueue {
  constructor({ maxInFlight = 64, maxQueued = 256, errorCode = 'TRUYN_BACKPRESSURE', errorMessage = 'backpressure' } = {}) {
    if (!Number.isInteger(maxInFlight) || maxInFlight < 1) throw new Error('maxInFlight must be a positive integer');
    if (!Number.isInteger(maxQueued) || maxQueued < 0) throw new Error('maxQueued must be a non-negative integer');
    this.maxInFlight = maxInFlight;
    this.maxQueued = maxQueued;
    this.errorCode = errorCode;
    this.errorMessage = errorMessage;
    this.inFlight = 0;
    this.queue = [];
    this.admitted = 0;
    this.rejected = 0;
    this.completed = 0;
    this.failed = 0;
  }

  snapshot() {
    return {
      maxInFlight: this.maxInFlight,
      maxQueued: this.maxQueued,
      inFlight: this.inFlight,
      queued: this.queue.length,
      admitted: this.admitted,
      rejected: this.rejected,
      completed: this.completed,
      failed: this.failed
    };
  }

  async run(task) {
    if (typeof task !== 'function') throw new Error('admission task must be a function');
    if (this.inFlight >= this.maxInFlight) {
      if (this.queue.length >= this.maxQueued) {
        this.rejected += 1;
        const error = new Error(this.errorMessage);
        error.code = this.errorCode;
        error.admission = this.snapshot();
        throw error;
      }
      this.admitted += 1;
      await new Promise((resolve) => this.queue.push(resolve));
    } else {
      this.admitted += 1;
    }

    this.inFlight += 1;
    try {
      const result = await task();
      this.completed += 1;
      return result;
    } catch (error) {
      this.failed += 1;
      throw error;
    } finally {
      this.inFlight -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
