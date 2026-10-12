/** Counts only the time for which the caller keeps the timer running. */
export class ForegroundElapsedTimer {
  private elapsedMs = 0;
  private startedAt: number | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private completed = false;

  constructor(
    private readonly durationMs: number,
    private readonly onComplete: () => void,
  ) {}

  start() {
    if (this.completed || this.startedAt !== null) return;

    this.startedAt = Date.now();
    this.timeout = setTimeout(() => {
      this.timeout = null;
      this.elapsedMs += Date.now() - this.startedAt!;
      this.startedAt = null;
      this.completed = true;
      this.onComplete();
    }, Math.max(0, this.durationMs - this.elapsedMs));
  }

  pause() {
    if (this.startedAt === null) return;

    this.elapsedMs += Date.now() - this.startedAt;
    this.startedAt = null;
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  cancel() {
    this.pause();
    this.completed = true;
  }
}
