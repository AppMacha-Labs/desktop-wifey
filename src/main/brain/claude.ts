import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { BRAIN_POSES, MOODS } from '../../shared/types';
import type {
  BrainContext,
  CompanionEvent,
  Reaction,
} from '../../shared/types';
import { stripAudioTags } from '../audio-tags';
import type { Brain } from './index';

const ReactionSchema = z.object({
  mood: z.enum(MOODS),
  pose: z.enum(BRAIN_POSES),
  line: z.string(),
});

/**
 * The real brain: one Claude call per event, returning mood + pose + line as
 * structured output. The persona is cached; only the event JSON changes per call.
 */
export class ClaudeBrain implements Brain {
  readonly kind = 'claude' as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    /** Built per call from live settings; identical text keeps the cache warm. */
    private readonly persona: () => string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async react(event: CompanionEvent, ctx: BrainContext): Promise<Reaction> {
    const response = await this.client.messages.parse({
      model: this.model,
      // Thinking is always on for this model; low effort keeps a one-liner cheap and fast.
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(ReactionSchema) },
      system: [
        {
          type: 'text',
          text: this.persona(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({ event, context: ctx }),
        },
      ],
    });

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error(
        `brain returned no reaction (stop_reason=${response.stop_reason})`,
      );
    }

    const r = response.parsed_output;
    // Hard cap the line so a chatty answer never overflows the bubble.
    const max = 160;
    // Her voice keeps any audio tag ("[sighs]"); the bubble shows the words.
    const spoken = r.line.trim();
    const line = stripAudioTags(spoken);
    return {
      mood: r.mood,
      pose: r.pose,
      line: line.length > max ? `${line.slice(0, max - 3)}...` : line,
      spoken,
    };
  }
}
