import type { ShowPayload } from '../shared/types';

export interface BubbleCallbacks {
  onAction(bubbleId: string, actionId: string): void;
  onDismiss(bubbleId: string): void;
  onTalking(talking: boolean): void;
}

/** The speech bubble above her head: text, buttons, auto-dismiss. */
export class Bubble {
  private current: ShowPayload | null = null;
  private ttlTimer: number | null = null;
  private typeTimer: number | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly cb: BubbleCallbacks,
  ) {}

  show(payload: ShowPayload): void {
    this.clearTimers();
    this.current = payload;
    this.el.innerHTML = '';
    this.el.dataset.mood = payload.mood;

    const text = document.createElement('p');
    text.className = 'line';
    this.el.append(text);

    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', 'dismiss');
    close.textContent = '×';
    close.addEventListener('click', () => this.dismiss());
    this.el.append(close);

    if (payload.actions.length) {
      const row = document.createElement('div');
      row.className = 'actions';
      for (const a of payload.actions) {
        const btn = document.createElement('button');
        btn.className = a.primary ? 'primary' : '';
        btn.textContent = a.label;
        btn.addEventListener('click', () => this.act(a.id));
        row.append(btn);
      }
      this.el.append(row);
    }

    this.el.classList.add('visible');
    this.typewriter(text, payload.line, () => {
      if (payload.ttlMs)
        this.ttlTimer = window.setTimeout(() => this.dismiss(), payload.ttlMs);
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  /** The bubble on screen, if any. */
  get currentId(): string | null {
    return this.current?.id ?? null;
  }

  /** Close without telling main; used when she's sent off-screen. */
  close(): void {
    if (this.current) this.hide();
  }

  private act(actionId: string): void {
    if (!this.current) return;
    const id = this.current.id;
    this.hide();
    this.cb.onAction(id, actionId);
  }

  /** Close as if he'd hit the ×: main hears about it. */
  dismiss(): void {
    if (!this.current) return;
    const id = this.current.id;
    this.hide();
    this.cb.onDismiss(id);
  }

  private hide(): void {
    this.clearTimers();
    this.current = null;
    this.el.classList.remove('visible');
    this.cb.onTalking(false);
  }

  private typewriter(
    target: HTMLElement,
    line: string,
    done: () => void,
  ): void {
    // Her lines get "typed" like she's speaking.
    this.cb.onTalking(true);
    let i = 0;
    const step = () => {
      i = Math.min(line.length, i + 1 + Math.floor(Math.random() * 2));
      target.textContent = line.slice(0, i);
      if (i < line.length) {
        this.typeTimer = window.setTimeout(step, 22);
      } else {
        this.cb.onTalking(false);
        done();
      }
    };
    step();
  }

  private clearTimers(): void {
    if (this.ttlTimer) window.clearTimeout(this.ttlTimer);
    if (this.typeTimer) window.clearTimeout(this.typeTimer);
    this.ttlTimer = null;
    this.typeTimer = null;
  }
}
