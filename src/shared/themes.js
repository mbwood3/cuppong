// Theme configuration system
// Each theme defines all visual parameters for the game

export const THEMES = {
  horror: {
    name: 'Horror',

    scene: {
      background: 0x0a0505,
      fogColor: 0x0a0505,
      fogNear: 8,
      fogFar: 25,
      toneMappingExposure: 1.3,
    },

    lighting: {
      ambient: { color: 0xffeedd, intensity: 0.5 },
      directional: { color: 0xfff0e0, intensity: 1.2, position: [1, 10, 2] },
      overhead: { color: 0xffcc88, intensity: 0.8, range: 25, position: [0, 8, 0] },
      rim: { color: 0xff8844, intensity: 0.25, range: 14, position: [0, -0.3, 0] },
      warmAccent: { color: 0xff6633, intensity: 0.15, range: 20, position: [8, 3, -5] },
      coolAccent: { color: 0x4488cc, intensity: 0.1, range: 20, position: [-8, 3, 5] },
      flickerStyle: 'fluorescent', // harsh dying-fluorescent flicker
      ambientShift: { warm: 0xffeedd, cool: 0xddeeff, period: 14 },
    },

    table: {
      color: 0x4a2818,
      roughness: 0.2,
      clearcoat: 0.75,
      clearcoatRoughness: 0.15,
      rimColor: 0x2a1608,
      rimRoughness: 0.6,
      rimClearcoat: 0.15,
      overlayType: 'veins', // blood veins
      mistColor: { r: 40, g: 15, b: 10 },
      mistOpacity: 0.35,
    },

    cups: {
      playerColors: [0xEE2233, 0x2288FF, 0x22CC55],
      playerColorNames: ['Red', 'Blue', 'Green'],
      liquidColor: 0xcc8822,
      liquidOpacity: 0.85,
      innerColor: 0x1a0808,
      clearcoat: 0.3,
    },

    ball: {
      color: 0xfff4e8,
      emissive: 0xffddaa,
      emissiveIntensity: 0.15,
      glowColor: 0xffeecc,
      glowOpacity: 0.12,
      trailStyle: 'blood', // dark red blood ribbon with drips
      trailColors: { head: [0.6, 0.05, 0.02], tail: [0.45, 0.02, 0.02] },
      dripColor: { r: 0.45, g: 0, b: 0.01 },
      dripGravity: -3.0,
    },

    props: {
      type: 'gore', // uses addGoreProps
    },

    hitEffects: {
      splashColors: { beer: 0xffcc44, blood: 0x880011 },
      splatDecalColor: { r: 0.5, g: 0, b: 0.01 },
      glowRingColor2: 0xff2200,
      shakeIntensity: 0.06,
      shakeDuration: 250,
    },

    postProcessing: {
      bloomStrength: 0.35,
      bloomRadius: 0.5,
      bloomThreshold: 0.72,
      vignetteDarkness: 1.2,
      vignetteOffset: 1.1,
    },

    atmosphere: {
      dustColor: 'rgba(200,180,150,0.6)',
      dustCount: 45,
      dustSize: [0.03, 0.06],
      dustDrift: 'horizontal',
    },

    ui: {
      streakText: ['CUP', 'SLUT!'],
      streakColor: 0xff3366,
      hitGlowColor: 'rgba(255,100,50,0.9)',
      eyeballText: "I've got my EYE on you!",
    },
  },

  christmas: {
    name: 'Christmas',

    scene: {
      background: 0x0a1025,
      fogColor: 0x0a1025,
      fogNear: 10,
      fogFar: 30,
      toneMappingExposure: 1.5,
    },

    lighting: {
      ambient: { color: 0xfff5d0, intensity: 0.6 },
      directional: { color: 0xfff8ee, intensity: 1.0, position: [1, 10, 2] },
      overhead: { color: 0xfff8ee, intensity: 0.9, range: 25, position: [0, 8, 0] },
      rim: { color: 0xffaa44, intensity: 0.2, range: 14, position: [0, -0.3, 0] },
      warmAccent: { color: 0xff2222, intensity: 0.15, range: 20, position: [8, 3, -5] },
      coolAccent: { color: 0x22ff22, intensity: 0.1, range: 20, position: [-8, 3, 5] },
      flickerStyle: 'twinkle', // gentle sine twinkle
      ambientShift: { warm: 0xfff5d0, cool: 0xd8e8ff, period: 18 },
    },

    table: {
      color: 0x5a3a20,
      roughness: 0.1,
      clearcoat: 0.9,
      clearcoatRoughness: 0.08,
      rimColor: 0x8899aa,
      rimRoughness: 0.2,
      rimClearcoat: 0.7,
      overlayType: 'snowflakes', // snowflake pattern
      mistColor: { r: 200, g: 210, b: 230 },
      mistOpacity: 0.25,
    },

    cups: {
      playerColors: [0xCC2222, 0x228833, 0xDDAA22],
      playerColorNames: ['Red', 'Green', 'Gold'],
      liquidColor: 0x4a2a14, // hot cocoa
      liquidOpacity: 0.9,
      innerColor: 0x3a1a08,
      clearcoat: 0.5,
    },

    ball: {
      color: 0xf0f0ff,
      emissive: 0xccddff,
      emissiveIntensity: 0.1,
      glowColor: 0xddeeff,
      glowOpacity: 0.15,
      trailStyle: 'sparkle', // white-gold glitter trail
      trailColors: { head: [1.0, 0.95, 0.8], tail: [0.8, 0.85, 1.0] },
      dripColor: { r: 0.9, g: 0.92, b: 1.0 },
      dripGravity: -1.5, // slower, floaty snowflake drift
    },

    props: {
      type: 'christmas', // uses addChristmasProps
    },

    hitEffects: {
      splashColors: { beer: 0xffdd44, blood: 0xff4444 }, // gold + red sparkle
      splatDecalColor: { r: 0.9, g: 0.92, b: 1.0 }, // white snowflake marks
      glowRingColor2: 0xffdd00, // gold ripple
      shakeIntensity: 0.04,
      shakeDuration: 200,
    },

    postProcessing: {
      bloomStrength: 0.45,
      bloomRadius: 0.6,
      bloomThreshold: 0.65,
      vignetteDarkness: 0.8,
      vignetteOffset: 1.2,
    },

    atmosphere: {
      dustColor: 'rgba(220,230,255,0.5)',
      dustCount: 50,
      dustSize: [0.05, 0.1],
      dustDrift: 'snow', // gentle downward + swirl
    },

    ui: {
      streakText: ['NICE', 'LIST!'],
      streakColor: 0x22cc55,
      hitGlowColor: 'rgba(255,220,100,0.9)',
      eyeballText: "That's ORNAMENTal!",
    },
  },
};

/**
 * Get the active theme config.
 * Reads from window.__theme, defaults to 'horror'.
 */
export function getTheme() {
  const name = (typeof window !== 'undefined' && window.__theme) || 'horror';
  return THEMES[name] || THEMES.horror;
}

/**
 * Get the theme name.
 */
export function getThemeName() {
  return (typeof window !== 'undefined' && window.__theme) || 'horror';
}
