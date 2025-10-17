// FILE: src/playerState.js (COMPLETE FINAL VERSION)

import { Vector3 } from "three";
import {
  createSkeleton,
  removeSkeleton as removeSkeletonFromScene,
} from "./skeleton.js";

// The number of frames a player can be 'LOST' before being removed.
// 120 frames @ 30fps = 4 seconds.
export const MAX_LOST_FRAMES = 120;

/**
 * Creates and initializes a new player object with all necessary state properties.
 */
export function createPlayerState(scene, playerData) {
  const skeleton = createSkeleton(scene);
  const rootPosition = new Vector3(
    playerData.x / 100.0,
    0.05,
    playerData.y / 100.0
  );
  skeleton.position.copy(rootPosition);

  return {
    id: playerData.id,
    skeleton: skeleton,

    targetPosition: new Vector3().copy(rootPosition),
    currentJoints: Array(17)
      .fill(0)
      .map(() => new Vector3()),
    targetJoints: Array(17)
      .fill(0)
      .map(() => new Vector3()),

    status: "ACTIVE",
    lastUpdateTime: Date.now(), // Use real time for staleness checks
    velocity: new Vector3(0, 0, 0), // Velocity per DATA FRAME
    jointVelocities: Array(17)
      .fill(0)
      .map(() => new Vector3()),
  };
}

/**
 * Removes a player's skeleton from the scene.
 */
export function removePlayer(scene, playerState) {
  if (playerState && playerState.skeleton) {
    removeSkeletonFromScene(scene, playerState.skeleton);
  }
}
