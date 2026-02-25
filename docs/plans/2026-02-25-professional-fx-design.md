# Professional FX Upgrade Design

## Goal
Make the game look and feel professionally polished — realistic gore textures, atmospheric lighting, and a grimy horror environment.

## Approach
Procedural texture maps + material overhaul (Approach A). Maximizes realism per GPU cycle on iPhone by using canvas-generated maps rather than extra geometry.

---

## Section 1: Gore Material Realism

### Procedural Texture Maps
- **Normal map** (128x128 canvas): Skin pores, wrinkles, bumpy flesh. Applied to all `fleshMat`/`fleshMatVC`. Organs get a smoother, wetter variant.
- **Roughness map** (128x128 canvas): Wet areas (blood, exposed muscle) low roughness; dry skin higher roughness. "Some parts glisten, some parts are matte."

### Stronger Vertex Color Variation
- Deep purple/yellow bruise patches
- Blue-ish vein streaks
- Blood pooling in lower vertices (darker red where Y is lowest)

### Ragged Stump Edges
- Replace clean `addStump` cross-sections with jagged ring geometry
- Irregular radius per vertex
- Dangling flesh bits hanging down
- Exposed fat layer (yellowish ring between skin and muscle)

### Wetness
- Organs: clearcoat 0.9+
- Fresh blood: subtle emissive (~0.02) to catch light like real wet blood

---

## Section 2: Lighting & Atmosphere

### Flickering Overhead Light
- Main overhead point light oscillates 0.6-0.9 intensity
- Occasional brief dips to 0.3 (dying fluorescent effect)
- Randomized timing for organic feel

### Ambient Color Shift
- Slow cycle between warm orange and cool blue tones
- 10-15 second period, low amplitude
- Subtle unease without distraction

### Stronger Fog
- Scene fog start distance: 12 -> 8
- Edges of table fade into darkness
- Mist sprite opacity increased slightly

### Floating Dust/Ash Particles
- 40-50 tiny sprite particles drifting above table
- Small, dim, slow-moving (like dust in a light beam)
- Confined within fog range, fade at edges

---

## Section 3: Table & Environment

### Reflective Wet-Look Table
- Clearcoat 0.7+, reduced roughness
- Wood grain visible under thin layer of wet grime

### Blood Veins on Table
- Procedural canvas texture: thin dark red branching lines
- ~0.15 opacity, blended on top of wood grain
- Subtle opacity pulse synced with flickering light

### Grungier Table Edge
- Darker rim material, reduced clearcoat
- More roughness variation — worn and dirty, not polished

### Dust Particles
- Same system as atmosphere dust, confined to table area
- Fade naturally at fog edges

---

## Files Affected
- `src/game/gore-props.js` — texture maps, materials, stump geometry, vertex colors
- `src/game/scene.js` — flickering light, ambient shift, fog distance, dust particles
- `src/game/table.js` — wet surface, blood veins texture, rim material, vein pulse animation
- `src/shared/constants.js` — any new constants (light flicker range, dust count, etc.)

## Performance Constraints
- All texture maps canvas-generated (no external assets)
- No geometry increase — realism via maps and materials
- Dust particles are sprites (minimal GPU cost)
- Must maintain smooth performance on iPhone
