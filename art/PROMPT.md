# Prompts for making a character

Works in ChatGPT, or in the Codex CLI with image generation on. Do everything in **one
conversation** so every pose inherits the same character. Make `idle` first, get it right, then
ask for each other pose as an edit of it.

Two ways to start: describe someone new (like the sample character), or attach a clear,
well-lit, front-facing photo of your partner (with their blessing) and turn them into a cartoon.

## Message 1: the character (idle)

Fill in the brackets, or swap in your own description:

> Create an original cartoon character for a desktop companion app. She must not resemble any
> existing character, mascot or celebrity, or copy any studio's or franchise's style.
>
> Style: [soft, chunky hand-drawn cartoon: thick rounded outlines, flat colours with one soft
>
> > shade tone, slightly oversized round head, dot eyes with a white sparkle, rosy cheeks].
>
> Character: [a cheerful young woman; hair: …; outfit: …; one or two small accessories]. No green
> anywhere on her.
>
> Keep these rules identical in every image I ask for in this conversation:
>
> - Same face, hair, outfit, proportions and drawing style.
> - Full body, facing the viewer, centred, feet at the same height near the bottom of the frame,
>   same distance from the camera every time, the character about 85% of the image height.
> - Square 1:1 image, **fully transparent background**, no floor, no shadow, no text, no props
>   unless I ask for one.
>
> Pose: standing relaxed, arms loosely at her sides, soft warm smile, looking at the viewer.

From a photo instead? Replace the first two paragraphs with: "Turn the person in this photo into a
cartoon character in [style]. Keep their face shape, hairstyle, hair colour, skin tone and
glasses or jewellery so they're clearly recognisable, and give them one fixed outfit based on the
photo."

Regenerate until `idle` is right. Everything else is built on it.

## Messages 2 to 13: one pose each

Paste each as its own message, re-attaching the approved `idle` image every time:

> Same character, same outfit, same style, same framing, transparent background. Only the pose
> changes: **[pose]**.

| File           | [pose]                                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `blink.png`    | exactly the idle pose with eyes closed in a gentle blink                                                             |
| `wave.png`     | waving hello with one hand raised, big happy smile                                                                   |
| `talk.png`     | mid-sentence, mouth open as if talking, hands slightly out at her sides                                              |
| `happy.png`    | cheering with both arms up, eyes squeezed shut with joy, big grin                                                    |
| `love.png`     | hands clasped to her chest, blushing, dreamy happy smile                                                             |
| `pout.png`     | arms crossed, cheeks puffed in a pout, looking away with side-eye                                                    |
| `angry.png`    | hands on hips, eyebrows angled down, cross frown, leaning slightly forward                                           |
| `sleepy.png`   | rubbing one eye with the back of her hand, half-closed eyes, small yawn                                              |
| `thinking.png` | one finger on her chin, eyes looking up and to the side, one eyebrow raised                                          |
| `point.png`    | pointing at the viewer with one hand, other hand on hip, sassy confident grin                                        |
| `water.png`    | holding a clear water bottle out toward the viewer in one hand, other hand on hip, encouraging smile                 |
| `meal.png`     | holding a round plate of food (rice and curry, or any meal) out toward the viewer with both hands, warm caring smile |

The app adds its own floating hearts, so the poses don't need any.

Save them all in `art/private/` (create it; it's gitignored), restart the app, and she's in.

## If you get a background anyway

Ask: "Regenerate exactly this image with a fully transparent background, PNG." Still no luck?
Ask for a flat pure #00FF00 green background and key it out with ffmpeg:

```bash
ffmpeg -i pose.png -vf "chromakey=0x00ff00:0.15:0.05,despill=type=green" pose-clear.png
```

## If a pose drifts

Reply: "Not quite. Use exactly the character from the first image: same face, outfit, hair and
camera distance. Only the pose changes." Re-attach `idle` and regenerate. If it keeps drifting,
ask for a smaller change ("same as idle, but the right hand raised").
