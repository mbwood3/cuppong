// Keep in sync with server/constants.js
export const CUPS_PER_PLAYER = 15;
export const THROWS_PER_TURN = 2;
export const MAX_PLAYERS = 3;

// Cup layout: 5-4-3-2-1 triangle (15 cups)
// Row 0 (front, closest to center): 1 cup
// Row 1: 2 cups
// Row 2: 3 cups
// Row 3: 4 cups
// Row 4 (back, closest to player): 5 cups
export const CUP_ROWS = [1, 2, 3, 4, 5];

// Table dimensions
export const TABLE_RADIUS = 3.0;
export const TABLE_HEIGHT = 0.05;

// Cup dimensions (meters, roughly a solo cup)
export const CUP_TOP_RADIUS = 0.045;
export const CUP_BOTTOM_RADIUS = 0.03;
export const CUP_HEIGHT = 0.12;
export const CUP_SPACING = 0.1; // distance between cup centers

// Ball dimensions
export const BALL_RADIUS = 0.02;
export const BALL_MASS = 0.0027; // ping pong ball mass in kg

// Physics
export const GRAVITY = -9.82;
export const BALL_RESTITUTION = 0.7;
export const BALL_FRICTION = 0.3;

// Throw mechanics
export const MIN_SWIPE_DISTANCE = 30; // pixels
export const MAX_SWIPE_TIME = 600; // ms
export const HORIZONTAL_SCALE = 0.008;
export const FORWARD_SCALE = 0.015;
export const ARC_SCALE = 0.006;
export const MIN_THROW_SPEED = 2;
export const MAX_THROW_SPEED = 12;

// Player colors (brighter for visibility on green table)
export const PLAYER_COLORS = [
  0xEE2233, // Red
  0x2288FF, // Blue
  0x22CC55, // Green
];

export const PLAYER_COLOR_NAMES = ['Red', 'Blue', 'Green'];

// Camera positions
export const CAMERA_OVERHEAD = { x: 0, y: 5, z: 0 };
export const CAMERA_FOV = 50;

// Player base positions around the table (120 degrees apart)
// Each player's cups point toward the center
export const PLAYER_ANGLES = [
  Math.PI / 2,               // Player 0: top (facing down)
  Math.PI / 2 + (2 * Math.PI / 3),   // Player 1: bottom-left
  Math.PI / 2 + (4 * Math.PI / 3),   // Player 2: bottom-right
];

export const PLAYER_DISTANCE = 2.0; // Distance from center to player's cup base
