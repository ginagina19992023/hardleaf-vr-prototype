// Smooth locomotion for the headset (author's request, 3 Nov 2026):
//   left stick  = walk forward / back / sideways, relative to where the head looks;
//   right stick = turn left / right CONTINUOUSLY (angle grows smoothly with time and stick deflection) - no snap turn, no teleport.
// Pure functions, no THREE and no DOM, so they can be tested. Speeds are comfort defaults, not measured values.
export const DEADZONE = 0.15;       // stick drift below this is ignored
export const MOVE_SPEED = 1.6;      // metres per second at full deflection (a calm walk)
export const TURN_RATE_DEG = 90;    // degrees per second at full deflection

// WebXR "xr-standard" gamepad: axes[2], axes[3] are the thumbstick (axes[0], axes[1] are the touchpad and are 0 on Quest). Fall back to the first pair if only two axes exist.
export function stickOf(gamepad) {
  const a = (gamepad && gamepad.axes) || [];
  if (a.length >= 4) return { x: a[2] || 0, y: a[3] || 0 };
  if (a.length >= 2) return { x: a[0] || 0, y: a[1] || 0 };
  return { x: 0, y: 0 };
}

// Rescaled dead zone: 0 inside the zone, then grows from 0 to 1 so there is no jump at the edge.
export function dead(v, dz = DEADZONE) {
  const m = Math.abs(v);
  if (m < dz) return 0;
  return Math.sign(v) * Math.min(1, (m - dz) / (1 - dz));
}

// Head yaw as used by the app: yaw = atan2(-dx, -dz) of the looking direction, so yaw 0 looks along -Z.
// Returns the step {x, z} in metres to add to the rig for one frame of length dt seconds.
export function moveStep(yaw, stick, dt, speed = MOVE_SPEED) {
  let fx = dead(stick.x), fy = dead(stick.y);          // stick forward is negative y
  const len = Math.hypot(fx, fy);
  if (len > 1) { fx /= len; fy /= len; }                // a diagonal is not faster than straight ahead
  const forward = -fy, strafe = fx;
  const dirX = -Math.sin(yaw), dirZ = -Math.cos(yaw);   // where the head looks, on the ground plane
  const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
  return { x: (forward * dirX + strafe * rightX) * speed * dt, z: (forward * dirZ + strafe * rightZ) * speed * dt };
}

// Rotation (radians, about +Y) to apply to the rig for one frame. Pushing right turns right (clockwise seen from above = negative about +Y).
export function turnStep(stick, dt, rateDeg = TURN_RATE_DEG) {
  const d = dead(stick.x);
  return d === 0 ? 0 : -d * (rateDeg * Math.PI / 180) * dt;     // exactly 0 (not -0) when nothing is pushed
}

// Quest controller buttons in the WebXR 'xr-standard' mapping: 0 trigger, 1 grip, 3 thumbstick click, 4 A (right) or X (left), 5 B (right) or Y (left).
export const BTN = { TRIGGER: 0, GRIP: 1, STICK: 3, LOWER: 4, UPPER: 5 };
// Indices that are pressed now but were not pressed in the previous frame (one action per press, not one per frame).
export function buttonEdges(prev, cur) {
  const out = [];
  for (let i = 0; i < cur.length; i++) if (cur[i] && !(prev && prev[i])) out.push(i);
  return out;
}
// Yaw (as in the app: yaw 0 looks along -Z) of a pointing direction on the ground plane.
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz);
