/**
 * This file computes general, descriptive features of the game state,
 * allowing the model to learn what constitutes a leakage, rather than being
 * told where to look. Philosophy: "Describe, Don't Prescribe."
 */

function getTeamCentroid(players) {
  if (players.length === 0) return { x: 0, z: 0 };
  const sum = players.reduce(
    (acc, p) => {
      acc.x += p.mesh.position.x;
      acc.z += p.mesh.position.z;
      return acc;
    },
    { x: 0, z: 0 }
  );
  return { x: sum.x / players.length, z: sum.z / players.length };
}

function getTeamShape(players) {
  if (players.length < 2) return { width: 0, depth: 0 };
  const x_coords = players.map((p) => p.mesh.position.x);
  const z_coords = players.map((p) => p.mesh.position.z);
  return {
    depth: Math.max(...x_coords) - Math.min(...x_coords),
    width: Math.max(...z_coords) - Math.min(...z_coords),
  };
}

function getDefensiveLineMetrics(defenders, attackingDirection) {
  if (defenders.length === 0) return { line_depth: 0, line_players: [] };

  // Sort defenders by their depth on the pitch to find the deepest players.
  const sortedDefenders = [...defenders].sort((a, b) => {
    // A lower distance to their own goal means a deeper player.
    const goalX = attackingDirection * 52.5;
    const distA = Math.abs(a.mesh.position.x - goalX);
    const distB = Math.abs(b.mesh.position.x - goalX);
    return distA - distB;
  });

  const linePlayers = sortedDefenders.slice(0, 4); // Use the 4 deepest outfield players
  if (linePlayers.length === 0) return { line_depth: 0, line_players: [] };

  const meanX =
    linePlayers.reduce((sum, p) => sum + p.mesh.position.x, 0) /
    linePlayers.length;
  return { line_depth: meanX, line_players: linePlayers };
}

function getFormationDisruption(allDefenders, defensiveLine) {
  if (defensiveLine.line_players.length < 2 || allDefenders.length < 2) {
    return { disruption_index: 0 };
  }

  // 1. Define the "ideal" center point of the back line.
  const idealCenterX = defensiveLine.line_depth;
  const idealCenterZ =
    defensiveLine.line_players.reduce((sum, p) => sum + p.mesh.position.z, 0) /
    defensiveLine.line_players.length;
  const idealCenterPoint = { x: idealCenterX, z: idealCenterZ };

  // 2. Calculate the distance of every defender from this ideal center.
  const distances = allDefenders.map((def) => {
    const dx = def.mesh.position.x - idealCenterPoint.x;
    const dz = def.mesh.position.z - idealCenterPoint.z;
    return Math.sqrt(dx * dx + dz * dz);
  });

  // 3. The index is the standard deviation of these distances.
  const meanDistance =
    distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const variance =
    distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) /
    distances.length;
  const disruption_index = Math.sqrt(variance);

  return { disruption_index };
}

export function calculateGlobalFeatures(
  playerManager,
  attackingTeamName,
  attackingDirection
) {
  const homeTeamName = playerManager.metadata.home_team.name;
  const defendingTeamName =
    attackingTeamName === homeTeamName
      ? playerManager.metadata.away_team.name
      : homeTeamName;

  const attackers = playerManager.getAllTeamPlayers(attackingTeamName);
  const defenders = playerManager.getAllTeamPlayers(defendingTeamName);

  const attackCentroid = getTeamCentroid(attackers);
  const defendCentroid = getTeamCentroid(defenders);
  const attackShape = getTeamShape(attackers);
  const defendShape = getTeamShape(defenders);

  // The defensive line is calculated based on the goal they are defending
  const defensiveLine = getDefensiveLineMetrics(defenders, -attackingDirection);

  const disruption = getFormationDisruption(defenders, defensiveLine);

  return {
    attack_centroid_x: attackCentroid.x,
    attack_centroid_z: attackCentroid.z,
    defend_centroid_x: defendCentroid.x,
    defend_centroid_z: defendCentroid.z,
    attack_width: attackShape.width,
    attack_depth: attackShape.depth,
    defend_width: defendShape.width,
    defend_depth: defendShape.depth,
    defensive_line_depth: defensiveLine.line_depth,
    formation_disruption_index: disruption.disruption_index, // New, powerful feature
  };
}
