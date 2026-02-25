# Theme System + Christmas Theme Design

## Goal
Add a theme picker so each player selects their theme (Horror or Christmas) at game start. The Christmas theme should be as complete and detailed as Horror — fully replacing all visual elements with festive equivalents.

## Architecture

### Theme Config Object
A single `src/shared/themes.js` exports theme presets. Each theme defines every visual parameter — colors, materials, props, lighting, post-processing, UI text. The game reads the active theme at startup and passes it through to all visual systems.

```javascript
export const THEMES = {
  horror: { ... },
  christmas: { ... },
};
```

### Theme Selection Flow
1. Lobby screen shows theme picker (Horror / Christmas) with preview icons
2. Selection stored in `window.__theme` (like `window.__freeplay`)
3. `startGame()` reads `window.__theme` and passes config to all subsystems
4. In multiplayer, theme choice is sent with player join event

### Theme Config Shape
Each theme defines:
- `scene` — background color, fog color/range, tone mapping exposure
- `lighting` — ambient color/intensity, overhead color/intensity, accent colors, flicker behavior
- `table` — base color, texture generator function, clearcoat/roughness, rim style, overlay (veins vs snowflakes)
- `cups` — player colors, liquid color, inner shell color, material properties
- `ball` — color, emissive, trail colors, trail style (blood drips vs sparkle particles), glow color
- `props` — function reference to create themed props (gore vs Christmas decorations)
- `hitEffects` — particle colors, splash style, text phrases, sounds
- `postProcessing` — bloom strength/threshold, vignette darkness
- `atmosphere` — mist/dust colors, particle count, animation style
- `ui` — streak text (CUP SLUT vs NICE LIST), colors, fonts

---

## Horror Theme (Current — No Changes)

Already fully implemented with:
- Gore props (184 objects), blood puddles/smears, flesh/organ materials
- Dark atmosphere, flickering fluorescent light, ambient color shift
- Blood trail, blood drip particles, blood splatters on hit
- Wet grimy table with pulsing blood veins
- Floating dust/ash particles
- Vignette + bloom post-processing
- "CUP SLUT" streak text

---

## Christmas Theme — Full Spec

### Scene & Atmosphere
- Background: deep midnight blue (`0x0a1025`)
- Fog: blue-tinted (`0x0a1025`), range 10-30 (slightly more open than horror)
- Tone mapping exposure: 1.5 (brighter, warmer)

### Lighting
- Ambient: warm golden (`0xfff5d0`), intensity 0.6
- Overhead: warm white (`0xfff8ee`), intensity 0.9 — gentle twinkle (NOT harsh flicker)
- Accent lights: red (`0xff2222`, 0.15) and green (`0x22ff22`, 0.1) from opposite sides
- No dying-fluorescent flicker — instead soft twinkle (sine oscillation 0.8-1.0)
- Ambient shift: warm gold ↔ cool silver (very subtle)

### Table
- Texture: frosted/icy wood — lighter wood base (`#6b4a2e`) with frost crystal overlay
- Clearcoat: 0.9 (ice-like reflective)
- Roughness: 0.1 (very glossy/icy)
- Overlay: snowflake pattern instead of blood veins (white, 0.12 opacity, gentle pulse)
- Rim: silver/frost color (`0x8899aa`), high clearcoat (0.7)
- Mist: white/blue sparkle instead of brown fog

### Cups
- Player colors: Red (`0xCC2222`), Green (`0x228833`), Gold (`0xDDAA22`)
- Liquid: hot cocoa brown (`0x4a2a14`) with marshmallow-white foam circle on top
- Inner shell: warm brown (`0x3a1a08`)
- Higher clearcoat (0.5) — glossy holiday cups

### Ball
- Color: white/silver snowball (`0xf0f0ff`)
- Emissive: cool blue-white (`0xccddff`), intensity 0.1
- Glow halo: white-blue (`0xddeeff`)
- Trail: sparkle/glitter trail — white-to-gold gradient ribbon with shimmer
- Drip particles: tiny snowflakes/glitter falling off instead of blood drips (white, slow drift)

### Props (Christmas Decorations — replaces gore entirely)
Instead of `addGoreProps`, a `addChristmasProps` function creates:

**Large props (physics-enabled, roll around):**
- Ornament balls (12) — glossy spheres in red, gold, green, blue. High metalness + clearcoat
- Snowman parts (6) — 2-3 stacked spheres with carrot nose, coal eyes, stick arms
- Present boxes (9) — colored boxes with ribbon bows on top
- Gingerbread men (9) — flat cookie-shaped meshes, brown with white icing details

**Small props (static, scattered):**
- Candy canes (18) — red/white striped curved cylinders
- Pine branches (12) — dark green tube clusters
- Holly berries (24) — small red spheres in clusters of 3 with green leaves
- Snowflake decals (30) — flat white shapes on table surface (like blood puddles)
- Cookie crumbs (20) — small tan fragments

**Ambient:**
- Tiny twinkling lights strung between props — small emissive dots in multi-colors

### Hit Effects
- Splash: red/green/gold sparkle burst (no blood)
- Table decals: snowflake marks instead of blood splatters (white, fade over 3s)
- Glow rings: gold → white ripple
- Camera shake: slightly less intense (0.04 vs 0.06)

### Post-Processing
- Bloom: slightly stronger (0.45 strength) — Christmas lights should glow
- Vignette: softer (darkness 0.8 vs 1.2) — less horror, more cozy
- Tone mapping: warmer exposure

### UI
- Hit text: white with golden glow
- Streak text: "NICE LIST!" instead of "CUP SLUT" (or "NAUGHTY!" for misses?)
- Eyeball reaction equivalent: ornament hit → "That's ORNAMENTal!" with jingle sound

### Atmosphere Particles
- Floating snowflakes instead of dust/ash — white sprites, gentle downward drift + swirl
- Larger than dust (0.05-0.1 scale)
- 50 particles, slow descent with horizontal wobble

---

## Files to Create/Modify

### New Files
- `src/shared/themes.js` — Theme config objects
- `src/game/christmas-props.js` — Christmas decoration prop creation

### Modified Files
- `src/screens/lobby.js` — Theme picker UI
- `src/screens/game.js` — Read theme, pass to subsystems
- `src/game/scene.js` — Accept theme config for lighting/fog/dust
- `src/game/table.js` — Accept theme config for surface/overlay/mist
- `src/game/cups.js` — Accept theme config for colors/materials
- `src/game/ball.js` — Accept theme config for appearance/trail
- `src/game/hit-effects.js` — Accept theme config for particles/splatters
- `src/game/post-processing.js` — Accept theme config for bloom/vignette
- `src/shared/constants.js` — Player colors become theme-dependent

## Performance
- Christmas props use same geometry budget as horror (similar segment counts)
- Snowflake particles same count as dust (45-50)
- No additional post-processing passes
- Same iPhone optimization constraints apply
