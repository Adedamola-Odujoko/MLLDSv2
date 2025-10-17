// FILE: src/PlaybackBuffer.js

export class PlaybackBuffer {
  constructor() {
    this.frames = [];
  }

  push(players, meta) {
    this.frames.push({
      players,
      ...meta,
    });
  }

  first() {
    return this.frames[0];
  }

  last() {
    return this.frames[this.frames.length - 1];
  }

  timeSpan() {
    if (this.frames.length < 2) return { start: 0, end: 0 };
    return {
      start: this.first().videoTime,
      end: this.last().videoTime,
    };
  }

  findFramesForInterpolation(playbackClock) {
    if (this.frames.length < 2) return null;

    // Find the first frame that is AFTER the current clock time
    const nextFrameIndex = this.frames.findIndex(
      (frame) => frame.videoTime >= playbackClock
    );

    if (nextFrameIndex === -1) {
      // Clock is past the end of the buffer
      return { prev: this.last(), next: this.last() };
    }
    if (nextFrameIndex === 0) {
      // Clock is before the start of the buffer
      return { prev: this.first(), next: this.first() };
    }

    // We have a valid pair
    const prevFrameIndex = nextFrameIndex - 1;
    return {
      prev: this.frames[prevFrameIndex],
      next: this.frames[nextFrameIndex],
    };
  }

  frameForFraction(frac) {
    if (this.frames.length === 0) return null;
    const idx = Math.floor(frac * (this.frames.length - 1));
    return this.frames[idx];
  }

  /**
   * Finds the next frame where a specific player ID appears.
   * @param {string} playerId The ID of the player to find.
   * @param {number} afterTime The time to start searching from.
   * @returns {{player: object, time: number}|null} The player data and time, or null if not found.
   */
  findNextAppearance(playerId, afterTime) {
    const startIndex = this.frames.findIndex((f) => f.videoTime > afterTime);
    if (startIndex === -1) return null;

    // Limit search to a reasonable future (e.g., within the grace period)
    const gracePeriodMs = 600000;
    const endTime = afterTime + gracePeriodMs;

    for (let i = startIndex; i < this.frames.length; i++) {
      const frame = this.frames[i];
      if (frame.videoTime > endTime) break; // Stop searching if it's too far in the future

      const player = frame.players.find((p) => p.id === playerId);
      if (player) {
        return { player: player, time: frame.videoTime };
      }
    }
    return null; // Not found within the grace period
  }
}
