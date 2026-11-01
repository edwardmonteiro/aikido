# Agent Village — art prompts

The village draws everything in code as pixel art. Any painted image you add
replaces the matching pixel art, so you can add art one file at a time and the
game keeps working throughout.

**Where the files go**

- Local app (`aikido village`): `village/assets/<kind>/<name>.png`. The folders
  are created for you. Reload the page and the art appears.
- Hosted page on claude.ai: send the files to Claude in chat and ask for them to
  be published with the page.

**Rules for every image**

- **Background:** solid pure green `#00FF00` (or a transparent PNG). The game
  removes the green for you. Rooms and ground textures are the exception: they
  fill the frame.
- **No text, no UI, no logos, no watermarks,** and no people in buildings or rooms.
- **Camera:** top-down 3/4 view, about 55° from the ground, looking north. The
  front (south) wall of each building faces the viewer.
- **Workflow:** generate a cheap low-resolution draft first. Only render the
  final at full resolution once you like it. Every image costs credits in your
  image tool.

## 1. Style guide (paste this at the start of every prompt)

> Cozy stylized 3D diorama in the style of a premium life-sim game: soft
> Pixar-like shapes, hand-painted textures, warm golden-hour sunlight from the
> upper left, long soft shadows to the lower right, rich saturated greens, warm
> honey-toned wood, cream plaster and weathered stone, subtle ambient occlusion,
> gentle bloom on light sources, crisp silhouettes, highly detailed but
> uncluttered, top-down three-quarter view at about 55 degrees, orthographic
> camera, consistent scale across all assets.

## 2. Characters — `characters/<id>.png`

**Sheet layout: one character, 3 columns × 4 rows, equal cells, on #00FF00.**

| Row | Facing | Columns |
| --- | --- | --- |
| 1 | toward the camera (south) | standing · left foot forward · right foot forward |
| 2 | to their left (west), side view | standing · stride · opposite stride |
| 3 | to their right (east), side view | standing · stride · opposite stride |
| 4 | away from the camera (north) | standing · left foot forward · right foot forward |
| 5 *(optional)* | seated on an invisible chair | facing the camera · facing away · (empty) |

- Size: 1536 × 3072 (1:2) for 4 rows, or 1536 × 3840 for 5 rows. A 9:16
  canvas also works.
- Full body in every cell, same height and feet on the same baseline.
- Clearly visible strides, so walking doesn't look like sliding.

**Prompt:**

> [style guide] Character turnaround sprite sheet for a game, one chibi-proportioned
> character (head about one third of body height) shown in a 3 by 4 grid of equal
> cells on a flat pure green #00FF00 background: row 1 facing the camera, row 2
> facing left, row 3 facing right, row 4 facing away; in each row column 1 standing,
> columns 2 and 3 mid-walk with a clear stride. Identical outfit, proportions and
> lighting in every cell, full body visible, no shadow on the background, no text.
> Character: **[description below]**.

| File | Who | Description to paste |
| --- | --- | --- |
| `player.png` | You | Your look; use your photo as a reference image. In the mockups: shoulder-length brown hair, purple sweater, black trousers, white sneakers |
| `chief_of_staff.png` | Matt, Chief of Staff | Man, short tidy brown hair, navy suit, white shirt, red tie, holding a phone, brown shoes |
| `inbox.png` | Iris, Inbox | Woman, long straight black hair, warm brown skin, coral-red blouse, dark trousers, small headset |
| `content.png` | Cole, Content | Young man, spiky auburn hair, fair skin, orange hoodie, charcoal jeans, camera strap over one shoulder |
| `finance.png` | Penny, Money | Woman, blonde hair in a bun, round glasses, fair skin, forest-green blazer, cream blouse, dark skirt |
| `research.png` | Reed, Research | Man, short black hair, glasses, deep brown skin, indigo sweater over a collared shirt, navy chinos |
| `travel.png` | Tess, Travel | Woman, auburn bob, light skin, teal jacket, khaki trousers, crossbody travel bag |
| `engineering.png` | Ezra, Engineering | Man, spiky black hair, glasses, tan skin, grey hoodie, black jeans, laptop under one arm |
| `knowledge.png` | Kai, Knowledge | Older person, long silver hair, fair skin, mauve cardigan, plum trousers, carrying a notebook |
| `worker.png` | Every intern | Young adult in a bright yellow high-visibility safety vest with a silver reflective stripe over a grey t-shirt, dark trousers |

## 3. Buildings — `houses/<id>.png`

**Rules for every building:**
- 1024 × 1024 (1280 × 1024 for Town Hall), on #00FF00.
- The whole building is visible, centered, and fills about 90% of the width.
- The roof is on the top half and the front wall on the bottom half.
- One front door, bottom center, with a small stone doorstep.
- No ground, grass or path around it.

**Prompt:**

> [style guide] Single standalone building for a top-down village game, seen
> from the front at a 55-degree three-quarter angle so the roof fills the top half
> and the front wall with one centered door fills the bottom half, isolated on a
> flat pure green #00FF00 background, no ground, no text. **[description]**

| File | Building | Description to paste |
| --- | --- | --- |
| `town_hall.png` | Town Hall | Wide civic hall, cream stone walls, four white columns flanking a double wooden door with steps, red clay tile roof, central clock tower with a small flag |
| `inbox.png` | Inbox House | Cozy cottage, cream wooden siding, coral-red shingle roof, brick chimney, red mailbox beside the door, envelope emblem above the door |
| `studio.png` | Content Studio | Modern lavender stucco studio, dark slate roof with a glowing ring light mounted on top, large window, small camera emblem |
| `bank.png` | Money House | Small stone bank, white plaster, two white pillars, forest-green shingle roof, brick chimney, gold coin emblem, flower pots by the door |
| `library.png` | Research Library | Red-brick library, indigo shingle roof, tall windows, open-book emblem, book cart by the door |
| `travel.png` | Travel Lodge | Alpine lodge, cream timber walls, teal roof, globe emblem, suitcases by the door |
| `workshop.png` | Code Workshop | Workshop with grey metal siding and a corrugated roof, gear emblem, crates and a barrel by the door |
| `archive.png` | Knowledge Archive | Plaster archive house, purple shingle roof, scroll emblem, small round window |
| `home.png` | Your Home | Warm cottage, cream siding, terracotta roof, flower boxes, heart emblem, white picket fence pieces |
| `recruiting.png` | Recruiting Office | Plank house with a red-and-white striped awning, orange roof, notice board, yellow "HIRING" board shape (leave the board blank) |

## 4. Rooms — `rooms/<id>.png`

**Rules for every room:**
- 2048 × 1024 (2:1; a 16:9 render is cropped to fit).
- **No people.** The game seats the characters.
- The layout must match where the game places people:
  - The back wall fills the top third. A fireplace sits in the center of it,
    with a bookshelf to its left and windows at both ends.
  - A large wooden desk is centered horizontally, its top surface at about 53% of
    the image height and its front edge at about 66%, with an empty chair behind it.
  - A rug is centered in the lower third, and the bottom center is open floor (the doorway).
- The camera matches your office mockup.

**Prompt:**

> [style guide] Interior of a luxurious small office seen from above at a
> 55-degree three-quarter angle, back wall across the top third with a lit stone
> fireplace in the center, a wooden bookshelf left of it and tall windows with
> sunlight at both ends; warm wide-plank wooden floor with long sunbeams; a large
> polished wooden desk centered with an empty leather chair behind it; a green
> rug in the lower third; open floor at the bottom center; no people, no text.
> **[theme]**

| File | Theme to paste |
| --- | --- |
| `inbox.png` | Wall of mail cubbies, letter trays and a desk lamp on the desk |
| `studio.png` | Green screen on the right wall, softbox lights, camera on a tripod, ring light |
| `bank.png` | Steel safe on the right, brass desk lamp, ledger books (your office mockup fits as is, minus the people) |
| `library.png` | Extra bookshelves on both walls, rolling ladder, reading lamp |
| `travel.png` | Big world map with pins on the right wall, globe on a stand, stacked suitcases |
| `workshop.png` | Server rack with green and amber lights on the right wall, workbench with tools, two monitors on the desk |
| `archive.png` | Rows of wooden filing cabinets, scroll shelves, labelled boxes (no readable text) |
| `recruiting.png` | Cork notice board with pinned papers, two interview chairs facing the desk |
| `home.png` | Cozy living room: sofa, armchair, bookshelf, plants (no desk; keep a coffee table in the desk position) |
| `town_hall.png` | Council chamber: instead of the desk, a long polished conference table spanning the middle half of the width with 8 empty chairs (4 on each side), red banners with gold emblems on the back wall |

## 5. Nature, props and ground

**Trees — `trees/oak.png`, `trees/pine.png`, `trees/bush.png`**
- 1024 × 1024 on #00FF00. One tree, trunk base at bottom center.
- Prompt: *[style guide] single round leafy oak tree / tall pine tree / small
  flowering bush, isolated on flat pure green #00FF00, no ground shadow, no text.*

**Props — `props/<name>.png`**
- 1024 × 1024 on #00FF00. One object, standing on the bottom edge.
- Files: `lamp` (iron street lamp, lit), `bench` (wooden park bench, front view),
  `mailbox`, `signpost`, `barrel`, `crate`, `pot` (terracotta pot with flowers),
  `well` (stone well with roof), `tripod` (camera on tripod), `suitcase`,
  `noticeboard`, `cart` (book cart), `fence` (one white picket-fence section).

**Ground textures — `ground/grass.png`, `ground/path.png`, `ground/plaza.png`**
- 1024 × 1024, **seamless tileable**, seen straight from above, no shadows, no objects.
- grass: *lush short lawn with tiny wildflowers*
- path: *packed dirt footpath with small pebbles*
- plaza: *pale cobblestone pavers in a running-bond pattern*

## 6. Order that gives the biggest jump first

1. `ground/` textures (3 images) change the whole town.
2. `characters/player.png`, `chief_of_staff.png` and `worker.png`.
3. The 10 buildings.
4. The 7 directors.
5. Rooms, starting with the ones you visit most.
6. Trees and props.
