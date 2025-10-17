import { Vector2, Vector3 } from "three";

/**
 * Finds the closest player to a target position from a list of players.
 */
export function findClosestPlayer(targetPosition, players) {
  let closestPlayer = null;
  let minDistance = Infinity;
  for (const player of players) {
    if (!player || !player.mesh) continue;
    const distance = player.mesh.position.distanceTo(targetPosition);
    if (distance < minDistance) {
      minDistance = distance;
      closestPlayer = player;
    }
  }
  return { player: closestPlayer, distance: minDistance };
}

/**
 * Checks if a 3D point (p) is inside the 2D triangle formed by p0, p1, and p2.
 */
export function isPointInTriangle(p, p0, p1, p2) {
  if (!p || !p0 || !p1 || !p2) return false;
  const p_2d = new Vector2(p.x, p.z);
  const p0_2d = new Vector2(p0.x, p0.z);
  const p1_2d = new Vector2(p1.x, p1.z);
  const p2_2d = new Vector2(p2.x, p2.z);
  const s =
    p0_2d.y * p2_2d.x -
    p0_2d.x * p2_2d.y +
    (p2_2d.y - p0_2d.y) * p_2d.x +
    (p0_2d.x - p2_2d.x) * p_2d.y;
  const t =
    p0_2d.x * p1_2d.y -
    p0_2d.y * p1_2d.x +
    (p0_2d.y - p1_2d.y) * p_2d.x +
    (p1_2d.x - p0_2d.x) * p_2d.y;
  if (s < 0 !== t < 0 && s !== 0 && t !== 0) return false;
  const A =
    -p1_2d.y * p2_2d.x +
    p0_2d.y * (p2_2d.x - p1_2d.x) +
    p0_2d.x * (p1_2d.y - p2_2d.y) +
    p1_2d.x * p2_2d.y;
  return A < 0 ? s <= 0 && s + t >= A : s >= 0 && s + t <= A;
}

/**
 * Calculates the 2D area of a polygon defined by an array of 3D vectors.
 */
export function calculatePolygonArea(corners) {
  let area = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % n];
    area += p1.x * p2.z - p2.x * p1.z;
  }
  return Math.abs(area / 2.0);
}

/**
 * Finds the two corners of a quadrilateral that form the widest passing cone from a start point.
 * @returns {{points: Array<Vector3>, corners: Array<Vector3>}}
 */
export function getPassingCone(startPoint, quadCorners) {
  let maxAngle = -1,
    coneCorners = [];
  for (let i = 0; i < quadCorners.length; i++) {
    for (let j = i + 1; j < quadCorners.length; j++) {
      const v1 = new Vector3().subVectors(quadCorners[i], startPoint);
      const v2 = new Vector3().subVectors(quadCorners[j], startPoint);
      const angle = v1.angleTo(v2);
      if (angle > maxAngle) {
        maxAngle = angle;
        coneCorners = [quadCorners[i], quadCorners[j]];
      }
    }
  }
  const sortedCorners =
    coneCorners.length > 1 ? coneCorners.sort((a, b) => a.z - b.z) : [];
  return { points: [startPoint, ...sortedCorners], corners: sortedCorners };
}
