import { Vector3 } from "three";
import {
  findClosestPlayer,
  isPointInTriangle,
  getPassingCone,
} from "./utils.js";

// This is your tuned file, now modified to return detailed objects.
export function calculateLs(
  lq,
  carrier,
  defenders,
  attackers,
  goal,
  attackingDirection
) {
  const threatDetails = calculateThreatPotential(
    lq,
    goal,
    defenders,
    attackers,
    attackingDirection
  );
  const exploitDetails = calculateExploitationScore(lq, defenders, attackers);
  const feasyDetails = calculateFeasibilityScore(lq, carrier, defenders);

  const threatPotentialScore = threatDetails.potential;
  const exploitationScore = exploitDetails.finalScore;
  const feasibilityScore = feasyDetails.finalScore;

  const ALPHA = 0.4,
    BASE = 0.5,
    SCALE = 0.5,
    K = 10.0;
  const productValue = threatPotentialScore * exploitationScore;
  const averageValue = (threatPotentialScore + exploitationScore) / 2;
  const situationValue = ALPHA * productValue + (1 - ALPHA) * averageValue;
  const raw_ls = situationValue * (BASE + SCALE * feasibilityScore);
  const final_ls = 1 / (1 + Math.exp(-K * (raw_ls - 0.5)));

  return {
    final_ls: isFinite(final_ls) ? final_ls : 0,
    threatPotentialScore,
    exploitationScore,
    feasibilityScore,
    details: {
      threat: threatDetails,
      exploit: exploitDetails,
      feasy: feasyDetails,
      final: { situationValue, raw_ls },
    },
  };
}

function calculateThreatPotential(
  lq,
  goal,
  defenders,
  attackers,
  attackingDirection
) {
  const MIDPOINT_DISTANCE = 30,
    STEEPNESS = 0.25;
  const proximityThreat =
    1 /
    (1 +
      Math.exp(
        STEEPNESS * (lq.center.distanceTo(goal.position) - MIDPOINT_DISTANCE)
      ));
  const strategicThreat = calculateStrategicBonus(
    lq,
    goal,
    defenders,
    attackers,
    attackingDirection
  );
  const combinedProximityScore = Math.max(proximityThreat, strategicThreat);
  const ANGLE_DECAY_RATE = 1.2; // TUNABLE: Higher value = more punishing for wide angles.
  const vectorToGoalCenter = new Vector3().subVectors(goal.position, lq.center);
  const forwardVector = new Vector3(attackingDirection, 0, 0);
  const offCenterAngleRad = vectorToGoalCenter.angleTo(forwardVector);
  const goalAngleFactor = Math.exp(-ANGLE_DECAY_RATE * offCenterAngleRad);
  const areaAmplifier =
    1.0 + (1 / (1 + Math.exp(-0.04 * (lq.area - 75)))) * 0.4;
  let potential = combinedProximityScore * 0.7 + goalAngleFactor * 0.3;
  potential *= areaAmplifier;

  return {
    potential: Math.min(1.0, isFinite(potential) ? potential : 0),
    proximityThreat,
    strategicThreat,
    combinedProximityScore,
    goalAngleFactor,
    areaAmplifier,
  };
}

function calculateStrategicBonus(
  lq,
  goal,
  defenders,
  attackers,
  attackingDirection
) {
  if (!defenders.length || !attackers.length || !attackingDirection) return 0.0;
  let lastDefender = null;
  let offsideLineX;
  if (attackingDirection < 0) {
    offsideLineX = Infinity;
    for (const def of defenders) {
      if (def.playerData.role !== "GK" && def.mesh.position.x < offsideLineX) {
        offsideLineX = def.mesh.position.x;
        lastDefender = def;
      }
    }
  } else {
    offsideLineX = -Infinity;
    for (const def of defenders) {
      if (def.playerData.role !== "GK" && def.mesh.position.x > offsideLineX) {
        offsideLineX = def.mesh.position.x;
        lastDefender = def;
      }
    }
  }
  if (!lastDefender) return 0.0;
  let isBehindLine =
    attackingDirection < 0
      ? lq.center.x < offsideLineX
      : lq.center.x > offsideLineX;
  if (!isBehindLine) return 0.0;
  const { fastestTimeToArrival: attTTA } = calculateTeamControlMetrics(
    lq.center,
    attackers
  );
  const { fastestTimeToArrival: defTTA } = calculateTeamControlMetrics(
    lq.center,
    defenders
  );
  if (defTTA <= attTTA) return 0.0;
  const runway = lq.center.distanceTo(goal.position);
  const bonus = 0.95 * (1 / (1 + Math.exp(-0.25 * (runway - 20))));
  return isFinite(bonus) ? bonus : 0;
}

function calculateExploitationScore(lq, defenders, attackers, carrier) {
  const ANALYSIS_RADIUS = 20;

  // --- Defensive Side ---
  const DEF_LAMBDA = 0.4; // Slightly more aggressive decay
  const defendersNearLq = defenders.filter(
    (p) => p.mesh.position.distanceTo(lq.center) < ANALYSIS_RADIUS
  );

  let defFastestTime = 99;
  let defAggProb = 0.0;
  if (defendersNearLq.length > 0) {
    const { fastestTimeToArrival, ttas } = calculateTeamControlMetrics(
      lq.center,
      defendersNearLq
    );
    defFastestTime = fastestTimeToArrival;
    const defProbs = ttas.map((t) => Math.exp(-DEF_LAMBDA * t));
    defAggProb = defProbs.reduce((s, v) => s + v, 0);
  }

  const defRecoveryScore = Math.exp(-0.1 * defFastestTime);

  // FIX #1: Make swarm score much more sensitive
  const SWARM_SENSITIVITY = 5; // Was 0.4. Now much more punishing.
  const defSwarmScore = 1 / (1 + defAggProb * SWARM_SENSITIVITY);

  const defensiveControl = defRecoveryScore * 0.6 + (1 - defSwarmScore) * 0.4;

  const potentialReceivers = attackers.filter(
    (p) =>
      p !== carrier && p.mesh.position.distanceTo(lq.center) < ANALYSIS_RADIUS
  );

  let attFastestTime = 99;
  let aggAttSupport = 0;
  let attSupportScore = 0.0;
  if (potentialReceivers.length > 0) {
    // --- THIS IS THE KEY CHANGE ---
    // Pass the carrier's position to use the new "intercept point" logic
    const { fastestTimeToArrival, ttas } = calculateTeamControlMetrics(
      lq.center,
      potentialReceivers,
      carrier
    );

    attFastestTime = fastestTimeToArrival;
    aggAttSupport = ttas
      .map((t) => Math.exp(-0.15 * t))
      .reduce((s, v) => s + v, 0);
    attSupportScore = Math.tanh(aggAttSupport * 2.0);
  }

  // --- Overload and Final Assembly ---
  const OVERLOAD_SCALE = 5.0;
  const overloadScore =
    1 / (1 + Math.exp(-OVERLOAD_SCALE * (aggAttSupport - defAggProb)));
  const arrivalTimeAdvantage = Math.max(0, defFastestTime - attFastestTime);
  const speedBonus = 1 + Math.tanh(arrivalTimeAdvantage * 0.2) * 0.45;
  const baseAttackingPotential = attSupportScore * 0.6 + overloadScore * 0.4;
  const DEFENSIVE_PENALTY_EXPONENT = 1;
  const exploitationScore =
    baseAttackingPotential *
    Math.pow(1 - defensiveControl, DEFENSIVE_PENALTY_EXPONENT);
  const finalScore = Math.min(1.0, exploitationScore * speedBonus);

  return {
    finalScore: isFinite(finalScore) ? finalScore : 0,
    defFastestTime,
    defRecoveryScore,
    defSwarmScore,
    defensiveControl,
    attFastestTime,
    attSupportScore,
    overloadFactor: overloadScore,
    attackingPotential: baseAttackingPotential,
    speedBonus,
  };
}

function calculateFeasibilityScore(lq, carrier, defenders) {
  const { distance: pressureDist } = findClosestPlayer(
    carrier.mesh.position,
    defenders
  );
  const pressureFactor =
    1 / (1 + Math.exp(-1.5 * ((pressureDist || 99) - 3.0)));
  const { points: conePoints } = getPassingCone(
    carrier.mesh.position,
    lq.corners
  );
  const numInterceptors = defenders.filter((def) =>
    isPointInTriangle(def.mesh.position, ...conePoints)
  ).length;
  const obstructionFactor = Math.exp(-0.3 * numInterceptors);
  const passDistFactor = Math.exp(
    -0.03 * carrier.mesh.position.distanceTo(lq.center)
  );
  const finalScore =
    obstructionFactor * 0.45 + pressureFactor * 0.3 + passDistFactor * 0.25;

  return {
    finalScore: isFinite(finalScore) ? finalScore : 0,
    pressureDist: pressureDist || 99,
    pressureFactor,
    numInterceptors,
    obstructionFactor,
    passDistFactor,
  };
}

function calculateTeamControlMetrics(target, players, carrierPosition = null) {
  // If no carrier position is provided, fall back to the old, simpler logic (for defenders).
  if (!carrierPosition) {
    if (players.length === 0) return { fastestTimeToArrival: 99, ttas: [] };
    const MIN_EFFECTIVE_SPEED = 1.0;
    const ttas = players.map((p) => {
      if (typeof p.currentSpeed !== "number" || isNaN(p.currentSpeed))
        p.currentSpeed = 0;
      return (
        p.mesh.position.distanceTo(target) /
        Math.max(p.currentSpeed, MIN_EFFECTIVE_SPEED)
      );
    });
    const fastestTimeToArrival = Math.min(...ttas);
    return {
      fastestTimeToArrival: isFinite(fastestTimeToArrival)
        ? fastestTimeToArrival
        : 99,
      ttas,
    };
  }

  // --- NEW "INTERCEPT POINT" LOGIC for attackers ---
  if (players.length === 0) return { fastestTimeToArrival: 99, ttas: [] };

  const AVERAGE_PASS_SPEED = 15.0; // m/s. TUNABLE. Higher for driven passes, lower for lofted.
  const MIN_EFFECTIVE_SPEED = 4.0;

  const timeForBallToTravel =
    carrierPosition.distanceTo(target) / AVERAGE_PASS_SPEED;

  const ttas = players.map((p) => {
    if (typeof p.currentSpeed !== "number" || isNaN(p.currentSpeed))
      p.currentSpeed = 0;
    const effectiveSpeed = Math.max(p.currentSpeed, MIN_EFFECTIVE_SPEED);

    // 1. Project player's future position based on how long the pass will take.
    const projectedPlayerPos = new Vector3();
    projectedPlayerPos
      .copy(p.mesh.position)
      .addScaledVector(p.velocity, timeForBallToTravel);

    // 2. The new "target" is a blend between the original LQ center and the player's projected path.
    // This prevents the target from being dragged too far away by a player running away from the space.
    const interceptPoint = new Vector3().lerpVectors(
      target,
      projectedPlayerPos,
      0.5
    );

    // 3. The time to arrival is now the time for the PLAYER to reach this new intercept point.
    const timeToIntercept =
      p.mesh.position.distanceTo(interceptPoint) / effectiveSpeed;

    // The final "effective" time is the LONGER of the two: the time the ball takes OR the time the player takes.
    // A pass is only complete when both have arrived.
    return Math.max(timeForBallToTravel, timeToIntercept);
  });

  const fastestTimeToArrival = Math.min(...ttas);
  return {
    fastestTimeToArrival: isFinite(fastestTimeToArrival)
      ? fastestTimeToArrival
      : 99,
    ttas,
  };
}
