// FILE: src/PlayerManager.js

import { Player } from "./Player.js";
import { teamColors } from "./skeleton.js";
import { Vector3 } from "three";

const GRACE_PERIOD_MS = 50000000;
const POSSESSION_THRESHOLD = 1.5;

const ROLE_GROUPS = {
  backline: ["LCB", "RCB", "CB", "LWB", "RWB", "LB", "RB"],
  midfield: ["CM", "LM", "RM", "CDM", "CAM", "DM", "AM"],
  attack: ["LW", "RW", "CF", "ST"],
  spine: ["GK", "LCB", "RCB", "CB", "CM", "CDM", "CAM", "DM", "AM", "CF", "ST"],
};
const interpolatedPosition = new Vector3();

export class PlayerManager {
  constructor(scene, teamColorMap, metadata) {
    this.scene = scene;
    this.playerMap = new Map();
    this.teamColorMap = teamColorMap || {};
    this.metadata = metadata;
    this.ball = null;
    this.playerInPossession = null;
    this.gapStates = new Map();
  }

  _updatePlayerInPossession() {
    if (!this.ball) {
      if (this.playerInPossession) {
        this.playerInPossession.hidePossessionHighlight();
        this.playerInPossession = null;
      }
      return;
    }
    let closestPlayer = null;
    let minDistance = POSSESSION_THRESHOLD;
    for (const player of this.playerMap.values()) {
      if (
        player.playerData.name === "Ball" ||
        player.playerData.team === "Referee"
      )
        continue;
      const dist = player.mesh.position.distanceTo(this.ball.mesh.position);
      if (dist < minDistance) {
        minDistance = dist;
        closestPlayer = player;
      }
    }
    if (closestPlayer && this.playerInPossession !== closestPlayer) {
      if (this.playerInPossession) {
        this.playerInPossession.hidePossessionHighlight();
      }
      this.playerInPossession = closestPlayer;
      this.playerInPossession.showPossessionHighlight();
    } else if (!closestPlayer && this.playerInPossession) {
      this.playerInPossession.hidePossessionHighlight();
      this.playerInPossession = null;
    }
  }

  // --- REFINED INTERPOLATION LOGIC ---
  updateWithInterpolation(prevFrame, nextFrame, alpha, buffer) {
    if (!prevFrame || !nextFrame) return;

    // --- THIS IS THE DEFINITIVE FIX ---
    // If there are no players in the current frames, there is nothing to update.
    // We can simply advance the "inferred" state of all existing players.
    if (prevFrame.players.length === 0 && nextFrame.players.length === 0) {
      // For any player that is currently being inferred, we assume they continue
      // moving for this short period. This logic is handled in player.smooth(),
      // which uses velocity. Here, we just ensure they are marked as inferred.
      for (const player of this.playerMap.values()) {
        player.setInferred(true);
      }
      return; // Exit the function early.
    }

    const prevPlayerMap = new Map(prevFrame.players.map((p) => [p.id, p]));
    const nextPlayerMap = new Map(nextFrame.players.map((p) => [p.id, p]));
    const allKnownIds = new Set(Array.from(this.playerMap.keys()));
    nextFrame.players.forEach((p) => allKnownIds.add(p.id));

    const now = performance.now();
    const currentTime =
      prevFrame.videoTime + (nextFrame.videoTime - prevFrame.videoTime) * alpha;

    for (const id of allKnownIds) {
      const prevData = prevPlayerMap.get(id);
      const nextData = nextPlayerMap.get(id);
      const playerData =
        nextData || prevData || this.playerMap.get(id)?.playerData;

      if (!playerData) continue;

      let player = this.playerMap.get(id);
      if (!player) {
        const color = this.teamColorMap[playerData.team] || teamColors.Unknown;
        player = new Player(this.scene, playerData, color, this);
        this.playerMap.set(id, player);
        if (playerData.name === "Ball") this.ball = player;
      }

      // Case 1: Player is visible in the current interpolation window.
      if (nextData) {
        this.gapStates.delete(id); // We have live data, so clear any gap state.
        player.setInferred(false);

        const startX = prevData ? prevData.x : nextData.x;
        const startY = prevData ? prevData.y : nextData.y;

        const targetX = startX + (nextData.x - startX) * alpha;
        const targetY = startY + (nextData.y - startY) * alpha;

        interpolatedPosition.set(targetX / 100.0, 0, targetY / 100.0);
        player.updateTarget(interpolatedPosition);
      }
      // Case 2: Player is NOT visible. We need to check for or continue a gap.
      else {
        // Sub-case 2a: This is the START of a new gap.
        if (!this.gapStates.has(id)) {
          const futureFrame = buffer.findNextAppearance(
            id,
            nextFrame.videoTime
          );
          if (futureFrame) {
            const lastKnownData =
              prevData || this.playerMap.get(id)?.playerData;
            if (lastKnownData) {
              const startPos = new Vector3(
                lastKnownData.x / 100.0,
                0,
                lastKnownData.y / 100.0
              );
              const endPos = new Vector3(
                futureFrame.player.x / 100.0,
                0,
                futureFrame.player.y / 100.0
              );
              this.gapStates.set(id, {
                startPos: startPos,
                endPos: endPos,
                startTime: nextFrame.videoTime, // Gap starts when they disappear
                endTime: futureFrame.time,
              });
            }
          }
        }

        // Sub-case 2b: Player is currently in a known gap.
        if (this.gapStates.has(id)) {
          player.setInferred(true);
          const state = this.gapStates.get(id);

          if (currentTime >= state.endTime) {
            // We are past the gap, but the player is not in nextData yet.
            // This can happen at the exact frame of reappearance.
            // The next frame's logic will handle their live position.
            // For now, just place them at the end position.
            player.updateTarget(state.endPos);
            this.gapStates.delete(id);
            player.setInferred(false);
          } else {
            const gapDuration = state.endTime - state.startTime;
            const timeIntoGap = currentTime - state.startTime;
            const gapAlpha = Math.max(
              0,
              Math.min(1, timeIntoGap / gapDuration)
            );

            interpolatedPosition.lerpVectors(
              state.startPos,
              state.endPos,
              gapAlpha
            );
            player.updateTarget(interpolatedPosition);
          }
        } else {
          // If there's no future frame, we do nothing. The player will be removed by the grace period logic.
          player.setInferred(true);
        }
      }
    }
  }

  hasInferredPlayers() {
    for (const player of this.playerMap.values()) {
      if (player.isInferred) {
        return true;
      }
    }
    return false;
  }

  smoothAll(alpha, dt) {
    for (const player of this.playerMap.values()) {
      player.smooth(alpha, dt);
    }
    this._updatePlayerInPossession();
  }

  // --- GETTERS ---
  getPlayersByGroup(teamName, group) {
    const roles = ROLE_GROUPS[group];
    if (!roles) return [];

    const players = [];
    for (const player of this.playerMap.values()) {
      if (
        player.playerData.team === teamName &&
        roles.includes(player.playerData.role)
      ) {
        players.push(player);
      }
    }
    return players;
  }

  getAllTeamPlayers(teamName) {
    const players = [];
    for (const player of this.playerMap.values()) {
      if (
        player.playerData.team === teamName &&
        player.playerData.role !== "BALL" &&
        player.playerData.role !== "REF"
      ) {
        players.push(player);
      }
    }
    return players;
  }

  getPlayerMeshes() {
    return Array.from(this.playerMap.values(), (player) => player.mesh);
  }
}
