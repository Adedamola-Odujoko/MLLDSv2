import { Vector2 } from "three";

// Helper function to check if a point is inside a triangle (for pressure calculation)
function isPointInTriangle(p, p0, p1, p2) {
  const A =
    (1 / 2) *
    (-p1.y * p2.x + p0.y * (-p1.x + p2.x) + p0.x * (p1.y - p2.y) + p1.x * p2.y);
  const sign = A < 0 ? -1 : 1;
  const s =
    (p0.y * p2.x - p0.x * p2.y + (p2.y - p0.y) * p.x + (p0.x - p2.x) * p.y) *
    sign;
  const t =
    (p0.x * p1.y - p0.y * p1.x + (p0.y - p1.y) * p.x + (p1.x - p0.x) * p.y) *
    sign;
  return s > 0 && t > 0 && s + t < 2 * A * sign;
}

// Main calculation function
export function calculateXg(
  shooter,
  defenders,
  goalkeeper,
  pitchLength,
  pitchWidth
) {
  const GOAL_WIDTH = 7.32;
  // Determine which goal the player is shooting at
  const goalX = shooter.x > 0 ? pitchLength / 2 : -pitchLength / 2;

  const shotLoc = new Vector2(shooter.x, shooter.z); // Using z as our y-coordinate on the 2D plane
  const leftPost = new Vector2(goalX, GOAL_WIDTH / 2);
  const rightPost = new Vector2(goalX, -GOAL_WIDTH / 2);

  // --- Calculate Angle ---
  const vLeft = new Vector2().subVectors(leftPost, shotLoc);
  const vRight = new Vector2().subVectors(rightPost, shotLoc);

  if (vLeft.length() === 0 || vRight.length() === 0) return 0.01;

  const angle = Math.acos(
    vLeft.dot(vRight) / (vLeft.length() * vRight.length())
  );

  // --- Calculate Distance ---
  const goalCenter = new Vector2(goalX, 0);
  const distance = shotLoc.distanceTo(goalCenter);

  // --- Calculate Pressure ---
  let pressure = 0;
  for (const d of defenders) {
    const defenderPos = new Vector2(d.x, d.z);
    if (isPointInTriangle(defenderPos, shotLoc, leftPost, rightPost)) {
      pressure++;
    }
  }

  // --- Goalkeeper Factor ---
  let gkFactor = 0;
  if (goalkeeper) {
    const gkPos = new Vector2(goalkeeper.x, goalkeeper.z);
    const shotLine = new Vector2().subVectors(goalCenter, shotLoc);
    if (shotLine.length() === 0) return 0.01;
    const shotLineUnit = shotLine.normalize();
    const gkVec = new Vector2().subVectors(gkPos, shotLoc);
    const projection = gkVec.dot(shotLineUnit);
    // Calculate perpendicular distance from GK to the shot line
    const distFromLine = new Vector2()
      .subVectors(gkVec, shotLineUnit.multiplyScalar(projection))
      .length();

    if (distFromLine < 1.5) {
      gkFactor = -0.5; // Penalty for GK being well-positioned
    }
  }

  // Logistic regression formula from your Python code
  const z = -1.5 + 1.2 * angle + -0.08 * distance + -0.3 * pressure + gkFactor;
  const xg = 1 / (1 + Math.exp(-z));

  return Math.round(xg * 1000) / 100; // Round to 3 decimal places
}
