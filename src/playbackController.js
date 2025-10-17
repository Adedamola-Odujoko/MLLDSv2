// =================================================================================
// FILE: src/playbackController.js (Live DVR Version)
// This module creates and manages the UI for a live stream with seeking.
// =================================================================================

const state = {
  playbackState: null,
  scrubber: null,
  playPauseBtn: null,
  speedBtn: null,
  liveBtn: null,
  timeDisplay: null,
  fps: 30, // Default video FPS
};

// --- Private Functions ---

function takeOffAir() {
  if (state.playbackState) {
    state.playbackState.isLive = false;
  }
}

function togglePlayPause() {
  if (!state.playbackState) return;
  takeOffAir(); // Any manual play/pause action exits live mode
  state.playbackState.isPlaying = !state.playbackState.isPlaying;
  updateUI();
}

function goToLive() {
  if (!state.playbackState) return;
  state.playbackState.isLive = true;
  state.playbackState.isPlaying = true; // Live mode is always "playing"
  updateUI();
}

function cycleSpeed() {
  if (!state.playbackState) return;
  const speeds = [1.0, 0.5, 0.25, 2.0];
  const currentSpeedIndex = speeds.indexOf(state.playbackState.playbackSpeed);
  state.playbackState.playbackSpeed =
    speeds[(currentSpeedIndex + 1) % speeds.length];
  state.speedBtn.textContent = `Speed: ${state.playbackState.playbackSpeed}x`;
}

function handleScrubberInput(event) {
  if (!state.playbackState) return;
  takeOffAir();
  state.playbackState.currentFrameIndex = parseInt(event.target.value, 10);
  state.playbackState.needsManualUpdate = true; // Force an update if paused
}

// --- Public API ---

export function updateScrubberRange(totalFrames) {
  if (state.scrubber) {
    state.scrubber.max = totalFrames > 0 ? totalFrames - 1 : 0;
  }
}

export function updateUI() {
  if (!state.playbackState) return;

  const frameIndex = Math.floor(state.playbackState.currentFrameIndex);
  state.scrubber.value = frameIndex;

  const totalSeconds = frameIndex / state.fps;
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  state.timeDisplay.textContent = `${minutes}:${seconds}`;

  if (state.playbackState.isLive) {
    state.playPauseBtn.textContent = "❚❚ Pause";
    state.liveBtn.classList.add("live-active");
  } else {
    state.playPauseBtn.textContent = state.playbackState.isPlaying
      ? "❚❚ Pause"
      : "▶ Play";
    state.liveBtn.classList.remove("live-active");
  }
}

export function initPlaybackControls(playbackState, videoFps = 30) {
  state.playbackState = playbackState;
  state.fps = videoFps;

  state.scrubber = document.getElementById("scrubber");
  state.playPauseBtn = document.getElementById("play-pause-btn");
  state.speedBtn = document.getElementById("speed-btn");
  state.liveBtn = document.getElementById("live-btn");
  state.timeDisplay = document.getElementById("time-display");

  state.playPauseBtn.addEventListener("click", togglePlayPause);
  state.speedBtn.addEventListener("click", cycleSpeed);
  state.liveBtn.addEventListener("click", goToLive);
  state.scrubber.addEventListener("input", handleScrubberInput);

  console.log("✅ Playback controls initialized.");
  updateUI();
}
