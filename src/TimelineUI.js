// FILE: src/TimelineUI.js

function timeToPercent(time, totalDuration) {
  if (totalDuration <= 0) return 0;
  return (time / totalDuration) * 100;
}

function pixelsToTime(pixels, containerWidth, totalDuration) {
  const fraction = pixels / containerWidth;
  return fraction * totalDuration;
}

export class TimelineUI {
  constructor({
    containerEl,
    timeSpan,
    onPlayPause,
    onJump,
    onRateChange,
    onPlayheadScrub,
    onClipChanged,
  }) {
    this.container = containerEl;
    this.totalDuration = timeSpan.end - timeSpan.start;
    this.startTimeOffset = timeSpan.start;
    this.onPlayheadScrub = onPlayheadScrub;
    this.onClipChanged = onClipChanged;

    // Playback callbacks
    this.onPlayPause = onPlayPause;
    this.onJump = onJump;
    this.onRateChange = onRateChange;

    this.clips = new Map();
    this.tracks = [];
    this.zoomLevel = 1.0;
    this.trackHeight = 24;

    this.init();
  }

  init() {
    this.container.innerHTML = ""; // Clear container

    // --- THIS IS THE FIX ---
    // We only set the ID here. All layout styles are now in the CSS file.
    this.container.id = "timeline-container";

    const leftPanel = this.createLeftPanel();
    this.container.appendChild(leftPanel);

    this.rightPanel = document.createElement("div");
    this.rightPanel.id = "timeline-right-panel";
    this.container.appendChild(this.rightPanel);

    this.contentContainer = document.createElement("div");
    this.contentContainer.id = "timeline-content";
    this.rightPanel.appendChild(this.contentContainer);

    this.playhead = document.createElement("div");
    this.playhead.id = "timeline-playhead";
    this.contentContainer.appendChild(this.playhead);

    this.rightPanel.addEventListener("wheel", this.handleZoom.bind(this), {
      passive: false,
    });
    this.rightPanel.addEventListener("mousedown", this.handleScrub.bind(this));
  }

  createLeftPanel() {
    const panel = document.createElement("div");
    panel.id = "timeline-left-panel";

    const btn = (text, title, onClick) => {
      const b = document.createElement("button");
      b.innerText = text;
      b.title = title;
      b.onclick = onClick;
      return b;
    };

    const row1 = document.createElement("div");
    row1.className = "controls-row";
    this.playBtn = btn("Play ▶", "Play/Pause (Space)", this.onPlayPause);
    row1.appendChild(btn("⟲ 10s", "Rewind 10s", () => this.onJump(-10000)));
    row1.appendChild(this.playBtn);
    row1.appendChild(btn("10s ⟳", "Forward 10s", () => this.onJump(10000)));
    row1.appendChild(btn("End ⤴", "Jump to End", () => this.onJump("end")));

    const row2 = document.createElement("div");
    row2.className = "controls-row";
    const rateSelect = document.createElement("select");
    rateSelect.title = "Playback rate";
    ["0.5x", "1x", "2x"].forEach((label) => {
      const opt = document.createElement("option");
      opt.value = label.replace("x", "");
      opt.innerText = label;
      if (label === "1x") opt.selected = true;
      rateSelect.appendChild(opt);
    });
    rateSelect.onchange = (e) => this.onRateChange(Number(e.target.value));

    this.timeLabel = document.createElement("div");
    this.timeLabel.style.minWidth = "60px";
    this.timeLabel.style.textAlign = "center";

    row2.appendChild(rateSelect);
    row2.appendChild(this.timeLabel);

    panel.appendChild(row1);
    panel.appendChild(row2);
    return panel;
  }

  handleZoom(e) {
    e.preventDefault();
    const zoomIntensity = 0.1;
    const direction = e.deltaY < 0 ? 1 : -1;
    this.zoomLevel += direction * zoomIntensity;
    this.zoomLevel = Math.max(1.0, this.zoomLevel);

    this.contentContainer.style.width = `${100 * this.zoomLevel}%`;
  }

  handleScrub(e) {
    if (e.target !== this.rightPanel && e.target !== this.contentContainer)
      return;
    const rect = this.contentContainer.getBoundingClientRect();
    const pos = e.clientX - rect.left;
    const time =
      pixelsToTime(pos, rect.width, this.totalDuration) + this.startTimeOffset;
    this.onPlayheadScrub(time);
  }

  findAvailableTrack(startTime, endTime, clipId) {
    for (let i = 0; i < this.tracks.length; i++) {
      let hasOverlap = false;
      for (const clip of this.tracks[i]) {
        if (
          clip.id !== clipId &&
          startTime < clip.endTime &&
          endTime > clip.startTime
        ) {
          hasOverlap = true;
          break;
        }
      }
      if (!hasOverlap) {
        return i;
      }
    }
    return this.tracks.length;
  }

  addOrUpdateClip(annotation) {
    let clipEl = this.clips.get(annotation.id);

    const trackIndex = this.findAvailableTrack(
      annotation.startTime,
      annotation.endTime,
      annotation.id
    );

    // Ensure we have enough track arrays
    while (this.tracks.length <= trackIndex) {
      this.tracks.push([]);
    }

    // Remove old entry from tracks
    this.tracks.forEach((track) => {
      const index = track.findIndex((clip) => clip.id === annotation.id);
      if (index > -1) track.splice(index, 1);
    });

    // Add new entry to the correct track
    this.tracks[trackIndex].push({
      id: annotation.id,
      startTime: annotation.startTime,
      endTime: annotation.endTime,
    });

    if (!clipEl) {
      clipEl = this.createClipElement(annotation);
      this.contentContainer.appendChild(clipEl);
      this.clips.set(annotation.id, clipEl);
    }

    const startPercent = timeToPercent(
      annotation.startTime - this.startTimeOffset,
      this.totalDuration
    );
    const endPercent = timeToPercent(
      annotation.endTime - this.startTimeOffset,
      this.totalDuration
    );

    clipEl.style.left = `${startPercent}%`;
    clipEl.style.width = `${endPercent - startPercent}%`;
    clipEl.style.top = `${trackIndex * this.trackHeight + 4}px`;
    clipEl.querySelector(".clip-label").innerText = annotation.type;
  }

  createClipElement(annotation) {
    const el = document.createElement("div");
    el.className = "timeline-clip";
    el.dataset.id = annotation.id;

    const label = document.createElement("span");
    label.className = "clip-label";
    el.appendChild(label);

    const leftHandle = document.createElement("div");
    leftHandle.className = "clip-handle left";
    el.appendChild(leftHandle);

    const rightHandle = document.createElement("div");
    rightHandle.className = "clip-handle right";
    el.appendChild(rightHandle);

    this.addDragListeners(el, annotation);
    return el;
  }

  addDragListeners(el, annotation) {
    let initialX, initialLeftPercent, initialWidthPercent;
    let actionType = null;

    const handleMove = (e) => {
      if (!actionType) return;
      const contentWidth = this.contentContainer.getBoundingClientRect().width;
      const dxPercent = ((e.clientX - initialX) / contentWidth) * 100;

      if (actionType === "drag") {
        const newStartPercent = Math.max(0, initialLeftPercent + dxPercent);
        const duration = annotation.endTime - annotation.startTime;
        const newStartTime =
          (newStartPercent / 100) * this.totalDuration + this.startTimeOffset;
        this.onClipChanged(
          annotation.id,
          newStartTime,
          newStartTime + duration
        );
      } else if (actionType === "resize-left") {
        const newStartPercent = Math.max(0, initialLeftPercent + dxPercent);
        const newStartTime =
          (newStartPercent / 100) * this.totalDuration + this.startTimeOffset;
        if (newStartTime < annotation.endTime) {
          this.onClipChanged(annotation.id, newStartTime, annotation.endTime);
        }
      } else if (actionType === "resize-right") {
        const newEndPercent = Math.max(
          0,
          initialLeftPercent + initialWidthPercent + dxPercent
        );
        const newEndTime =
          (newEndPercent / 100) * this.totalDuration + this.startTimeOffset;
        if (newEndTime > annotation.startTime) {
          this.onClipChanged(annotation.id, annotation.startTime, newEndTime);
        }
      }
    };

    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      actionType = null;
    };

    const handleDown = (e, type) => {
      e.stopPropagation();
      actionType = type;
      initialX = e.clientX;
      initialLeftPercent = parseFloat(el.style.left);
      initialWidthPercent = parseFloat(el.style.width);
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    };

    el.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("left")) handleDown(e, "resize-left");
      else if (e.target.classList.contains("right"))
        handleDown(e, "resize-right");
      else if (e.target.classList.contains("timeline-clip"))
        handleDown(e, "drag");
    });
  }

  removeClip(id) {
    const clipEl = this.clips.get(id);
    if (clipEl) {
      clipEl.remove();
      this.clips.delete(id);
    }
  }

  updatePlayhead(currentTime) {
    const percent = timeToPercent(
      currentTime - this.startTimeOffset,
      this.totalDuration
    );
    this.playhead.style.left = `${Math.max(0, Math.min(100, percent))}%`;
  }

  setPlayButtonState(isPlaying) {
    this.playBtn.innerText = isPlaying ? "Pause ⏸" : "Play ▶";
  }

  setTimeLabel(text) {
    this.timeLabel.innerText = text;
  }
}
