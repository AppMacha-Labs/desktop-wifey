import type {
  BrainContext,
  CompanionEvent,
  Reaction,
  Settings,
} from '../../shared/types';
import { CannedBrain } from './canned';
import { ClaudeBrain } from './claude';
import { buildPersona } from './persona';

export interface Brain {
  readonly kind: 'claude' | 'canned';
  react(event: CompanionEvent, ctx: BrainContext): Promise<Reaction>;
}

/**
 * Claude when a key is configured, canned lines otherwise. Any API failure falls
 * back to canned so she never goes silent. Rapid-fire petting also stays canned:
 * calling an LLM on every head-pat is silly.
 */
class ResilientBrain implements Brain {
  readonly kind: 'claude' | 'canned';

  constructor(
    private readonly primary: Brain | null,
    private readonly fallback: CannedBrain,
    private readonly log: (msg: string) => void,
  ) {
    this.kind = primary ? primary.kind : fallback.kind;
  }

  async react(event: CompanionEvent, ctx: BrainContext): Promise<Reaction> {
    if (!this.primary) return this.fallback.react(event, ctx);
    if (
      event.type === 'petted' &&
      event.streak !== 1 &&
      event.streak % 5 !== 0
    ) {
      return this.fallback.react(event, ctx);
    }
    try {
      return await this.primary.react(event, ctx);
    } catch (err) {
      this.log(`brain fell back to canned: ${(err as Error).message}`);
      return this.fallback.react(event, ctx);
    }
  }
}

export function createBrain(
  env: { apiKey: string | undefined; model: string },
  settings: Settings,
  log: (msg: string) => void,
): Brain {
  const canned = new CannedBrain(() => settings.userName);
  const claude = env.apiKey
    ? new ClaudeBrain(env.apiKey, env.model, () => buildPersona(settings))
    : null;
  if (!claude) log('no ANTHROPIC_API_KEY set, using canned lines');
  return new ResilientBrain(claude, canned, log);
}
