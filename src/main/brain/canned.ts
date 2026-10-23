import type {
  BrainContext,
  CompanionEvent,
  Reaction,
} from '../../shared/types';
import type { Brain } from './index';

interface CannedLine {
  line: string;
  mood: Reaction['mood'];
  pose: Reaction['pose'];
}

const L = (
  line: string,
  mood: Reaction['mood'],
  pose: Reaction['pose'],
): CannedLine => ({
  line,
  mood,
  pose,
});

const LINES = {
  greeting: [
    L(
      "Hi {name}! I live on your screen now. Don't even think about skipping water today.",
      'playful',
      'wave',
    ),
    L(
      'Hello {name} 👋 I have snacks, opinions, and all day.',
      'playful',
      'wave',
    ),
    L("I'm here. Sit up straight, I can see you.", 'content', 'wave'),
  ],
  summoned: [
    L('You rang? 😏', 'playful', 'wave'),
    L("I'm here, I'm here. What do you need?", 'content', 'wave'),
    L('Missed me already? Took you long enough.', 'playful', 'point'),
    L("What is it? Water first, then I'll listen.", 'playful', 'talk'),
  ],
  water: [
    L(
      'Water time, {name}. When did you last drink some? Be honest.',
      'content',
      'talk',
    ),
    L('Water check! Bottle. Now. I will wait.', 'playful', 'point'),
    L('You look thirsty from here. Drink something.', 'worried', 'talk'),
  ],
  meal: [
    L('Did you eat yet, or is the laptop your lunch?', 'content', 'talk'),
    L(
      "Food time, {name}. The work can wait, your stomach can't.",
      'playful',
      'point',
    ),
    L(
      "It's past mealtime. Go eat, I'll watch the screen for you.",
      'worried',
      'talk',
    ),
  ],
  bedtime: [
    L("It's late. Close the laptop. Bed. Now.", 'sleepy', 'sleepy'),
    L("I'm sleepy just watching you. Go to bed, {name}.", 'sleepy', 'sleepy'),
  ],
  ignored1: [
    L('Hello? I asked you something. Water. Now.', 'pouty', 'pout'),
    L("I'm not going anywhere, {name}. I'll just stand here.", 'pouty', 'pout'),
    L("Oh, so you're ignoring me now? Fine.", 'pouty', 'pout'),
  ],
  ignored2: [
    L('Did you forget you have a wife?!', 'furious', 'angry'),
    L("That's twice, {name}. TWICE. Drink water.", 'furious', 'angry'),
    L("Fine. I'll wait. I have all day.", 'furious', 'angry'),
    L("Don't make me come over there.", 'furious', 'point'),
  ],
  gaveUp: [
    L(
      "Fine. Stay thirsty. I'll be over here, not talking to you.",
      'furious',
      'angry',
    ),
  ],
  complied: [
    L("Good job. See, that wasn't so hard.", 'loving', 'happy'),
    L('Finally! Proud of you.', 'loving', 'happy'),
    L("Okay okay, I'll calm down. Love you.", 'content', 'happy'),
  ],
  snoozed: [
    L("Fifteen minutes. I'm timing you.", 'pouty', 'point'),
    L('Okay, 15 minutes. Then no excuses.', 'content', 'talk'),
  ],
  petted: [
    L('Hehe stop it 🙈', 'loving', 'love'),
    L("Aww, okay, you're forgiven.", 'loving', 'love'),
    L('Hehe. I missed you too.', 'loving', 'love'),
    L('Okay okay. Now drink water.', 'playful', 'love'),
  ],
  pettedALot: [
    L('Okay okay, I get it. Go work.', 'playful', 'point'),
    L('You are stalling. I can tell.', 'playful', 'pout'),
  ],
  spontaneous: [
    L("Just checking you're alive. Blink twice.", 'playful', 'talk'),
    L('Thinking about you. Also about whether you ate.', 'loving', 'love'),
    L('Posture check! Sit up, {name}.', 'playful', 'point'),
    L(
      "You've stared at that screen for hours. Look at me for 5 seconds.",
      'pouty',
      'pout',
    ),
  ],
} satisfies Record<string, CannedLine[]>;

/** Picks a random line, avoiding the ones she said recently. */
function pick(pool: CannedLine[], recent: string[], name: string): Reaction {
  const fresh = pool.filter(
    (c) => !recent.includes(c.line.replace('{name}', name)),
  );
  const from = fresh.length ? fresh : pool;
  const chosen = from[Math.floor(Math.random() * from.length)];
  return { ...chosen, line: chosen.line.replace('{name}', name) };
}

/** Zero-cost brain used when there's no API key, or when the API call fails. */
export class CannedBrain implements Brain {
  readonly kind = 'canned' as const;

  /** Reads his name at call time so a rename in settings applies right away. */
  constructor(private readonly userName: () => string) {}

  async react(event: CompanionEvent, ctx: BrainContext): Promise<Reaction> {
    const r = (pool: CannedLine[]) =>
      pick(pool, ctx.recentLines, this.userName());
    switch (event.type) {
      case 'greeting':
        return r(LINES.greeting);
      case 'summoned':
        return r(LINES.summoned);
      case 'reminder':
        // Asked again after "Not yet": no longer asking nicely.
        if (event.snoozes >= 2) return r(LINES.ignored2);
        if (event.snoozes === 1) return r(LINES.ignored1);
        return r(LINES[event.kind]);
      case 'ignored':
        return r(event.ignoredCount >= 2 ? LINES.ignored2 : LINES.ignored1);
      case 'complied':
        return r(LINES.complied);
      case 'snoozed':
        return r(LINES.snoozed);
      case 'petted':
        return r(event.streak > 6 ? LINES.pettedALot : LINES.petted);
      case 'spontaneous':
        return r(LINES.spontaneous);
    }
  }
}

export const GAVE_UP = LINES.gaveUp;
