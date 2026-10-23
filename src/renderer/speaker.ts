/** Plays her voice lines (MP3 bytes from main), one at a time. */
export class Speaker {
  /** 0-1, from her settings. */
  volume = 0.8;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private finish: (() => void) | null = null;

  /** Says a line; resolves when she's done, is cut off, or it can't play. */
  play(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    this.stop();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const audio = new Audio(url);
    audio.volume = this.volume;
    this.audio = audio;
    this.url = url;
    return new Promise((resolve) => {
      this.finish = resolve;
      audio.onended = () => this.stop();
      audio.onerror = () => this.stop();
      audio.play().catch(() => this.stop());
    });
  }

  /** Cut her off (bubble closed, sent away). */
  stop(): void {
    this.audio?.pause();
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio = null;
    this.url = null;
    const finish = this.finish;
    this.finish = null;
    finish?.();
  }
}
