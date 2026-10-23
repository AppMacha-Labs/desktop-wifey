# Character art brief

The app needs one image per pose below. Any pose you haven't drawn yet shows a built-in
placeholder, so everything runs while you work on it.

## Where the files go

- Your own character: `art/private/` (gitignored, so a real face never ends up on GitHub), or
  `~/Library/Application Support/desktop-wifey/art/` for the packaged app.
- The sample character that ships with the repo lives in `art/sample/`.

The app uses the first of those folders that has an `idle.png`, and only that folder. Exact
filenames, all lowercase:

| File           | Pose / expression                                           | When it shows                                 |
| -------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `idle.png`     | Standing relaxed, soft smile, looking at the viewer         | Default, most of the time                     |
| `blink.png`    | Same as idle, eyes closed                                   | Swapped in for ~150 ms to blink               |
| `wave.png`     | Waving hello, big smile                                     | Greetings, when you summon her                |
| `talk.png`     | Mouth open mid-sentence, hands slightly out                 | While her speech bubble types                 |
| `happy.png`    | Cheering, arms up, eyes squeezed shut                       | You did the thing                             |
| `love.png`     | Hands clasped to chest, blushing                            | When you pet her, sweet moments               |
| `pout.png`     | Arms crossed, cheeks puffed, side-eye                       | First time you ignore or snooze her           |
| `angry.png`    | Hands on hips, eyebrows down                                | Ignored twice or more                         |
| `sleepy.png`   | Yawning or rubbing an eye, droopy                           | Bedtime                                       |
| `thinking.png` | Finger on chin, looking up                                  | While Claude decides what she says            |
| `point.png`    | Pointing at the viewer, sassy grin                          | Call-outs ("did you forget you have a wife?") |
| `water.png`    | Holding a water bottle out to the viewer, other hand on hip | Water reminders                               |
| `meal.png`     | Holding a plate of food out to the viewer with both hands   | Meal reminders                                |

## Image specs

- **Transparent PNG**, same square canvas for every pose (1024×1024 is plenty).
- Whole body, **centred, feet at the same height in every image**, same distance from the camera,
  so switching poses doesn't make her jump.
- One consistent character: same face, hair, outfit and proportions in every pose. Make `idle`
  first, then make every other pose as an edit of it.
- She shows at ~260 px tall, so the silhouette and face must read at that size. Skip tiny props
  and fine patterns. Keep green out of her outfit if you want clips (they're made on a green
  screen).
- No background, no ground shadow (the app draws its own).
- Use any style you like. If you base her on a real person, ask them first.

The prompts, pose by pose, are in [`PROMPT.md`](./PROMPT.md). The animated clips come after, with
`npm run clips` (see the README).
