import { Vector3 } from "three";
import {
  findClosestPlayer,
  isPointInTriangle,
  calculatePolygonArea,
} from "./utils.js"; // <-- CORRECT: Import from utils

/**
 * The main function to calculate all desired metrics for a single data entry.
 * This is aligned with the latest LS Calculator model, ensuring all influential
 * features are captured for the ML dataset.
 */
export function calculateAllMetrics(
  lq,
  playerManager,
  timestamp,
  ls_heuristic
) {
  const allMetrics = {};

  const playerInPossession = playerManager.playerInPossession;
  if (!playerInPossession) return null;

  // --- I. CORE ENTITIES & CONTEXT ---
  const carrierPosition = playerInPossession.mesh.position;
  const homeTeamName = playerManager.metadata.home_team.name;
  const attackingTeamName = playerInPossession.playerData.team;
  const defendingTeamName =
    attackingTeamName === homeTeamName
      ? playerManager.metadata.away_team.name
      : homeTeamName;

  const otherAttackers = playerManager
    .getAllTeamPlayers(attackingTeamName)
    .filter((p) => p !== playerInPossession);
  const defenders = playerManager.getAllTeamPlayers(defendingTeamName);

  // --- II. PITCH GEOMETRY & GOAL (CRITICAL FOR CONTEXT) ---
  const PITCH_LENGTH = 105;
  const GOAL_WIDTH = 7.32;
  const PENALTY_BOX_LENGTH = 16.5;
  const PENALTY_BOX_WIDTH = 40.32;

  const isCarrierHomeTeam = attackingTeamName === homeTeamName;
  const goalX = isCarrierHomeTeam ? -PITCH_LENGTH / 2 : PITCH_LENGTH / 2;
  const goalPosition = new Vector3(goalX, 0, 0);
  const goalPost1 = new Vector3(goalX, 0, GOAL_WIDTH / 2);
  const goalPost2 = new Vector3(goalX, 0, -GOAL_WIDTH / 2);

  // --- III. CORE DATA & GROUND TRUTH ---
  allMetrics.timestamp = timestamp;
  allMetrics.ls_heuristic = ls_heuristic; // Our ground truth target label
  allMetrics.attacking_team_name = attackingTeamName;
  allMetrics.carrier_id = playerInPossession.playerData.id;

  // --- IV. LQ (LEAKAGE QUADRANT) FEATURES ---
  allMetrics.lq_center_x = lq.center.x;
  allMetrics.lq_center_z = lq.center.z;
  allMetrics.lq_area = lq.area; // Use pre-calculated area from Telestrator
  allMetrics.dist_carrier_to_lq = carrierPosition.distanceTo(lq.center);

  const v_lq_p1 = new Vector3().subVectors(goalPost1, lq.center).normalize();
  const v_lq_p2 = new Vector3().subVectors(goalPost2, lq.center).normalize();
  allMetrics.lq_goal_angle_rad = v_lq_p1.angleTo(v_lq_p2);
  allMetrics.lq_dist_to_goal = lq.center.distanceTo(goalPosition);
  allMetrics.is_lq_in_penalty_box =
    Math.abs(lq.center.x) > PITCH_LENGTH / 2 - PENALTY_BOX_LENGTH &&
    Math.abs(lq.center.z) < PENALTY_BOX_WIDTH / 2
      ? 1
      : 0;

  // --- V. FEASIBILITY FEATURES ---
  allMetrics.pressure_on_carrier_dist = findClosestPlayer(
    carrierPosition,
    defenders
  ).distance;

  let maxAngle = -1,
    coneCorners = [];
  for (let i = 0; i < lq.corners.length; i++) {
    for (let j = i + 1; j < lq.corners.length; j++) {
      const v1 = new Vector3().subVectors(lq.corners[i], carrierPosition);
      const v2 = new Vector3().subVectors(lq.corners[j], carrierPosition);
      const angle = v1.angleTo(v2);
      if (angle > maxAngle) {
        maxAngle = angle;
        coneCorners = [lq.corners[i], lq.corners[j]];
      }
    }
  }
  const conePoints = [carrierPosition, ...coneCorners];
  allMetrics.path_num_interceptors =
    conePoints.length > 2
      ? defenders.filter((def) =>
          isPointInTriangle(def.mesh.position, ...conePoints)
        ).length
      : 0;

  // --- VI. THREAT & EXPLOITATION FEATURES ---
  const LQ_ANALYSIS_RADIUS = 20; // Match the radius in LsCalculator

  allMetrics.def_dist_closest_to_lq = findClosestPlayer(
    lq.center,
    defenders
  ).distance;
  allMetrics.def_num_near_lq = defenders.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < LQ_ANALYSIS_RADIUS
  ).length;

  let minTimeToLq = 99;
  if (defenders.length > 0) {
    defenders.forEach((def) => {
      const dist = def.mesh.position.distanceTo(lq.center);
      const effectiveSpeed = Math.max(def.currentSpeed, 4.0);
      const timeToLq = dist / effectiveSpeed;
      if (timeToLq < minTimeToLq) {
        minTimeToLq = timeToLq;
      }
    });
  }
  allMetrics.def_min_time_to_lq = minTimeToLq;

  allMetrics.num_attackers_near_lq = otherAttackers.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < LQ_ANALYSIS_RADIUS
  ).length;
  allMetrics.dist_second_attacker_to_lq = findClosestPlayer(
    lq.center,
    otherAttackers
  ).distance;
  allMetrics.att_v_def_lq_radius =
    allMetrics.num_attackers_near_lq - allMetrics.def_num_near_lq;

  // --- VII. RAW PLAYER POSITIONS ---
  const allPlayers = Array.from(playerManager.playerMap.values());
  for (const player of allPlayers) {
    if (player.playerData.name === "Ball") continue;
    const pData = player.playerData;
    const prefix = pData.id;
    allMetrics[`${prefix}_x`] = player.mesh.position.x;
    allMetrics[`${prefix}_z`] = player.mesh.position.z;
  }
  allMetrics["ball_x"] = playerManager.ball.mesh.position.x;
  allMetrics["ball_z"] = playerManager.ball.mesh.position.z;

  // Final formatting
  for (const key in allMetrics) {
    if (typeof allMetrics[key] === "number") {
      allMetrics[key] = parseFloat(allMetrics[key].toFixed(4));
    }
  }

  return allMetrics;
}
