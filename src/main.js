// src/main.js (Complete File - Definitive Version)

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  DirectionalLight,
  GridHelper,
  Color,
  Raycaster,
  Vector2,
  Vector3,
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { initPitch } from "./pitch.js";
import { PlayerManager } from "./PlayerManager.js";
import { MatchDataLoader } from "./MatchDataLoader.js";
import { teamColors } from "./skeleton.js";
import { PlaybackBuffer } from "./PlaybackBuffer.js";
import { createTelestratorUI } from "./TelestratorUI.js";
import { TelestratorManager } from "./TelestratorManager.js";
import { createStatsUI, updateStats } from "./StatsUI.js";
import { HandController } from "./handController.js";
import { createDataExporterUI } from "./DataExporterUI.js";
import { initDebugPanel, toggleDebugPanel } from "./DebugPanel.js";
import { SuggestionManager } from "./SuggestionManager.js";

let DEBUG_MODE = false;
let xTGridData = null;

function createControlsUI() {
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.bottom = "14px";
  wrapper.style.left = "50%";
  wrapper.style.transform = "translateX(-50%)";
  wrapper.style.zIndex = "999";

  const ctrl = document.createElement("div");
  ctrl.id = "playback-controls";
  ctrl.style.display = "flex";
  ctrl.style.alignItems = "center";
  ctrl.style.gap = "8px";
  ctrl.style.padding = "8px 12px";
  ctrl.style.background = "rgba(0,0,0,0.45)";
  ctrl.style.borderRadius = "8px";
  ctrl.style.color = "#ddd";
  ctrl.style.fontFamily = "sans-serif";
  ctrl.style.fontSize = "13px";

  const btn = (text, title) => {
    const b = document.createElement("button");
    b.innerText = text;
    b.title = title || text;
    b.style.padding = "6px 10px";
    b.style.border = "none";
    b.style.background = "#222";
    b.style.color = "#ddd";
    b.style.borderRadius = "6px";
    b.style.cursor = "pointer";
    b.style.position = "relative";
    b.style.zIndex = "2";
    return b;
  };

  const playBtn = btn("Play ▶", "Play / Pause (Space)");
  const liveBtn = btn("End ⤴", "Jump to End (L)");
  const back10 = btn("⟲ 10s", "Rewind 10s (Left)");
  const fwd10 = btn("10s ⟳", "Forward 10s (Right)");

  const sliderWrapper = document.createElement("div");
  sliderWrapper.style.position = "relative";
  sliderWrapper.style.display = "flex";
  sliderWrapper.style.alignItems = "center";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  slider.max = 1000;
  slider.value = 1000;
  slider.style.width = "360px";
  slider.style.position = "relative";
  slider.style.zIndex = "1";

  sliderWrapper.appendChild(slider);

  const playbackRateSelect = document.createElement("select");
  playbackRateSelect.title = "Playback rate";
  ["0.5x", "1x", "2x"].forEach((label) => {
    const opt = document.createElement("option");
    opt.value = label.replace("x", "");
    opt.innerText = label;
    playbackRateSelect.appendChild(opt);
  });
  playbackRateSelect.style.padding = "6px";
  playbackRateSelect.style.borderRadius = "6px";
  playbackRateSelect.style.border = "none";
  playbackRateSelect.style.background = "#222";
  playbackRateSelect.style.color = "#ddd";
  playbackRateSelect.value = "1";
  playbackRateSelect.style.position = "relative";
  playbackRateSelect.style.zIndex = "2";

  const timeLabel = document.createElement("div");
  timeLabel.innerText = "LOADING...";
  timeLabel.style.minWidth = "64px";
  timeLabel.style.textAlign = "center";

  ctrl.appendChild(back10);
  ctrl.appendChild(playBtn);
  ctrl.appendChild(liveBtn);
  ctrl.appendChild(fwd10);
  ctrl.appendChild(sliderWrapper);
  ctrl.appendChild(playbackRateSelect);
  ctrl.appendChild(timeLabel);

  wrapper.appendChild(ctrl);
  document.body.appendChild(wrapper);

  return {
    container: ctrl,
    playBtn,
    liveBtn,
    back10,
    fwd10,
    slider,
    playbackRateSelect,
    timeLabel,
  };
}

function formatTimeMsDiff(msDiff) {
  const total = Math.max(0, Math.floor(msDiff / 1000));
  const mm = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}

function createTimestampLocatorUI() {
  const locator = document.createElement("div");
  locator.id = "timestamp-locator";
  locator.style.position = "absolute";
  locator.style.top = "14px";
  locator.style.left = "14px";
  locator.style.display = "flex";
  locator.style.alignItems = "center";
  locator.style.gap = "6px";
  locator.style.padding = "6px 10px";
  locator.style.background = "rgba(0,0,0,0.45)";
  locator.style.borderRadius = "8px";
  locator.style.zIndex = "999";
  locator.style.fontFamily = "sans-serif";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "mm:ss";
  input.style.width = "50px";
  input.style.padding = "4px";
  input.style.border = "1px solid #444";
  input.style.borderRadius = "4px";
  input.style.background = "#222";
  input.style.color = "#ddd";
  input.style.textAlign = "center";

  const btn = document.createElement("button");
  btn.innerText = "Go";
  btn.style.padding = "4px 10px";
  btn.style.border = "none";
  btn.style.background = "#333";
  btn.style.color = "#ddd";
  btn.style.borderRadius = "4px";
  btn.style.cursor = "pointer";

  const suggestionInput = document.createElement("input");
  suggestionInput.type = "file";
  suggestionInput.accept = ".json";
  suggestionInput.style.display = "none";
  suggestionInput.id = "suggestion-loader-input";

  const suggestionBtn = document.createElement("button");
  suggestionBtn.innerText = "Load Suggestions";
  suggestionBtn.style.padding = "4px 10px";
  suggestionBtn.style.border = "none";
  suggestionBtn.style.background = "#004d00";
  suggestionBtn.style.color = "#ddd";
  suggestionBtn.style.borderRadius = "4px";
  suggestionBtn.style.cursor = "pointer";

  suggestionBtn.onclick = () => {
    document.getElementById("suggestion-loader-input").click();
  };

  locator.appendChild(input);
  locator.appendChild(btn);
  locator.appendChild(suggestionBtn);
  locator.appendChild(suggestionInput);
  document.body.appendChild(locator);

  return { container: locator, input, button: btn, suggestionInput };
}

async function main() {
  const container = document.getElementById("canvas-container");
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
    loadingOverlay.style.opacity = 1;
  }
  initDebugPanel();

  try {
    const response = await fetch("/xT_grid.json");
    if (!response.ok) throw new Error("Failed to load xT grid");
    xTGridData = await response.json();
  } catch (error) {
    console.error("Could not load xT grid.", error);
  }

  const loader = new MatchDataLoader(
    "/match_metadata.json",
    "/structured_data.json"
  );
  const allFrames = await loader.load();
  const metadata = loader.metadata;

  if (!allFrames || allFrames.length === 0 || !metadata) {
    if (loadingOverlay)
      loadingOverlay.innerText = "Error: Could not load match data.";
    return;
  }

  const scene = new Scene();
  scene.background = new Color(0x0a0a0a);
  const camera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    5000
  );
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  camera.position.set(0, 30, 70);
  camera.lookAt(0, 0, 0);

  let labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0px";
  labelRenderer.domElement.style.pointerEvents = "none";
  document.body.appendChild(labelRenderer.domElement);

  scene.add(new AmbientLight(0xffffff, 0.8));
  const dirLight = new DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(30, 50, -50);
  scene.add(dirLight);
  const controls = new OrbitControls(camera, renderer.domElement);

  const handController = new HandController(
    document.createElement("video"),
    controls
  );

  const groundGeometry = new PlaneGeometry(105, 68);
  const groundMaterial = new MeshBasicMaterial({ visible: false });
  const groundPlane = new Mesh(groundGeometry, groundMaterial);
  groundPlane.rotation.x = -Math.PI / 2;
  scene.add(groundPlane);

  initPitch(scene);
  scene.add(new GridHelper(120, 120, 0x444444, 0x222222));

  const homeTeamName = metadata.home_team.name;
  const awayTeamName = metadata.away_team.name;
  const teamColorMap = {
    [homeTeamName]: teamColors.Home,
    [awayTeamName]: teamColors.Away,
    Referee: teamColors.Referee,
    Ball: teamColors.Ball,
  };
  const playerManager = new PlayerManager(scene, teamColorMap, metadata);
  const telestratorManager = new TelestratorManager(
    scene,
    camera,
    groundPlane,
    playerManager,
    labelRenderer,
    {
      onDrawStart: () => {
        if (isPlaying) {
          isPlaying = false;
          ui.playBtn.innerText = "Play ▶";
        }
      },
    },
    xTGridData
  );

  createDataExporterUI();
  const statsContainer = createStatsUI();

  createTelestratorUI({
    homeTeamName: metadata.home_team.short_name,
    awayTeamName: metadata.away_team.short_name,
    onToolSelect: (tool) => {
      telestratorManager.setTool(tool);
      if (tool === "cursor") controls.enabled = true;
    },
    onColorSelect: (color) => telestratorManager.setColor(color),
    onClear: () => {
      telestratorManager.clearAll();
      document.getElementById("tool-cursor").click();
    },
    onUndo: () => telestratorManager.undoLast(),
    onFormationToolUpdate: (team, tool, isEnabled) => {
      telestratorManager.updateFormationTool(team, tool, isEnabled);
      controls.enabled = false;
    },
    onTrackToggle: (enabled) => telestratorManager.setTrackMode(enabled),
    onClearTracks: () => telestratorManager.clearAllTrackLines(),
    onXgToggle: (enabled) => telestratorManager.setXgMode(enabled),
    onLsToggle: (enabled) => telestratorManager.setLsMode(enabled),
    onDebugToggle: (enabled) => toggleDebugPanel(enabled),
  });

  const buffer = new PlaybackBuffer();
  allFrames.forEach((frame) => {
    buffer.push(frame.players, { videoTime: frame.frame_time_ms });
  });

  let isPlaying = false;
  let isLive = false;
  let playbackClock = buffer.first()?.videoTime || 0;
  let lastTick = performance.now();
  let playbackRate = 1.0;
  let sliderSeeking = false;
  const tenSecondsMs = 10000;

  const ui = createControlsUI();
  const locatorUI = createTimestampLocatorUI();
  ui.playBtn.innerText = "Play ▶";
  ui.slider.value = 0;
  ui.timeLabel.innerText = formatTimeMsDiff(0);

  const playbackClockRef = { value: playbackClock };
  telestratorManager.setPlaybackClockRef(playbackClockRef);

  const suggestionManager = new SuggestionManager(scene, ui, buffer);
  locatorUI.suggestionInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      suggestionManager.loadSuggestions(file);
    }
  });

  let cameraMode = "orbit";
  let followedPlayerID = null;
  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const thirdPersonOffset = new Vector3(0, 4, -8);

  const handleGoToTimestamp = () => {
    const timeStr = locatorUI.input.value;
    if (!timeStr || !timeStr.includes(":")) return;
    const parts = timeStr.split(":");
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    if (isNaN(minutes) || isNaN(seconds)) return;
    const targetMs = (minutes * 60 + seconds) * 1000;
    const span = buffer.timeSpan();
    playbackClock = Math.max(span.start, Math.min(span.end, targetMs));
    isPlaying = false;
    ui.playBtn.innerText = "Play ▶";
  };

  locatorUI.button.addEventListener("click", handleGoToTimestamp);
  locatorUI.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") handleGoToTimestamp();
  });

  ui.playbackRateSelect.addEventListener("change", () => {
    const v = Number(ui.playbackRateSelect.value);
    if (!isNaN(v) && v > 0) playbackRate = v;
  });

  ui.playBtn.onclick = () => {
    if (!isPlaying && playbackClock >= buffer.last().videoTime) {
      playbackClock = buffer.first().videoTime;
      isLive = false;
    }
    isPlaying = !isPlaying;
    if (isPlaying) {
      lastTick = performance.now();
    }
    ui.playBtn.innerText = isPlaying ? "Pause ⏸" : "Play ▶";
  };

  ui.liveBtn.onclick = () => {
    if (buffer.last()) {
      playbackClock = buffer.last().videoTime;
      isLive = true;
      isPlaying = false;
      ui.playBtn.innerText = "Play ▶";
    }
  };
  ui.back10.onclick = () => {
    isLive = false;
    playbackClock = Math.max(
      buffer.first().videoTime,
      playbackClock - tenSecondsMs
    );
  };
  ui.fwd10.onclick = () => {
    if (buffer.last()) {
      playbackClock = Math.min(
        buffer.last().videoTime,
        playbackClock + tenSecondsMs
      );
      if (playbackClock >= buffer.last().videoTime) isLive = true;
    }
  };
  ui.slider.addEventListener("input", () => {
    sliderSeeking = true;
    isLive = false;
    const frac = Number(ui.slider.value) / Number(ui.slider.max);
    const f = buffer.frameForFraction(frac);
    if (f) playbackClock = f.videoTime;
  });
  ui.slider.addEventListener("change", () => {
    sliderSeeking = false;
  });

  function onPlayerClick(event) {
    if (controls.enabled === false && cameraMode !== "orbit") return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(
      playerManager.getPlayerMeshes()
    );
    if (intersects.length > 0) {
      const clickedPlayer = intersects[0].object.userData.player;
      if (clickedPlayer && clickedPlayer.playerData) {
        followedPlayerID = clickedPlayer.playerData.id;
        cameraMode = "thirdPerson";
      }
    }
  }

  window.addEventListener("dblclick", onPlayerClick);
  window.addEventListener("mousedown", (event) =>
    telestratorManager.handleMouseDown(event)
  );
  window.addEventListener("mousemove", (event) =>
    telestratorManager.handleMouseMove(event)
  );
  window.addEventListener("mouseup", (event) =>
    telestratorManager.handleMouseUp(event)
  );

  window.addEventListener("keydown", (ev) => {
    if (ev.key.toLowerCase() === "d") {
      DEBUG_MODE = !DEBUG_MODE;
      console.warn(`--- DEBUG MODE ${DEBUG_MODE ? "ENABLED" : "DISABLED"} ---`);
      return;
    }
    if (ev.target.tagName === "INPUT") return;
    if (ev.code === "Space") {
      ev.preventDefault();
      ui.playBtn.click();
    } else if (ev.key.toLowerCase() === "l") {
      ui.liveBtn.click();
    } else if (ev.code === "ArrowLeft") {
      ui.back10.click();
    } else if (ev.code === "ArrowRight") {
      ui.fwd10.click();
    } else if (ev.key === "Escape" || ev.key === "3") {
      cameraMode = "orbit";
      followedPlayerID = null;
      controls.enabled = true;
    }
    if (followedPlayerID) {
      if (ev.key === "1") cameraMode = "thirdPerson";
      if (ev.key === "2") cameraMode = "pov";
    }
  });

  if (loadingOverlay) {
    loadingOverlay.style.opacity = 0;
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 500);
  }

  renderer.setAnimationLoop(() => {
    if (DEBUG_MODE)
      console.log(
        `[main] Loop start. isPlaying: ${isPlaying}, clock: ${playbackClock.toFixed(
          0
        )}`
      );

    const now = performance.now();
    let dt = now - lastTick;
    lastTick = now;

    if (dt > 100) {
      dt = 100;
    }

    if (isPlaying && dt > 0) {
      playbackClock += dt * playbackRate;
    }
    playbackClockRef.value = playbackClock;

    const span = buffer.timeSpan();
    if (playbackClock >= span.end) {
      playbackClock = span.end;
      isLive = true;
      if (isPlaying) {
        isPlaying = false;
        ui.playBtn.innerText = "Play ▶";
      }
    } else {
      isLive = false;
    }

    const frames = buffer.findFramesForInterpolation(playbackClock);

    if (DEBUG_MODE && frames) {
      console.log(
        `[main] Found frames: prev=${frames.prev.videoTime}, next=${frames.next.videoTime}, players=${frames.next.players.length}`
      );
    }

    if (frames) {
      const { prev, next } = frames;
      const frameDuration = next.videoTime - prev.videoTime;
      const interpAlpha =
        frameDuration > 0
          ? (playbackClock - prev.videoTime) / frameDuration
          : 0;
      playerManager.updateWithInterpolation(prev, next, interpAlpha, buffer);
    }

    if (DEBUG_MODE) console.log("[main] Updating managers...");

    playerManager.smoothAll(0.15, dt);
    telestratorManager.update();
    suggestionManager.update(playbackClock);

    if (DEBUG_MODE) console.log("[main] Updating UI and rendering...");

    // (Code for zones, stats, camera etc.)
    // ...

    if (span.end > span.start) {
      const frac = (playbackClock - span.start) / (span.end - span.start);
      if (!sliderSeeking) {
        ui.slider.value = Math.floor(frac * Number(ui.slider.max));
      }
      ui.timeLabel.innerText = isLive
        ? "END"
        : formatTimeMsDiff(playbackClock - span.start);
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);

    if (DEBUG_MODE) console.log("[main] Loop end.");
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    suggestionManager.drawMarkers();
  });

  window.focus();
}

main().catch((e) => console.error("Fatal error in main:", e));
