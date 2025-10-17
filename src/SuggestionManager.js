// src/SuggestionManager.js (Synchronized Version)

import { Mesh, PlaneGeometry, MeshBasicMaterial } from "three";

export class SuggestionManager {
  constructor(scene, controlsUI, playbackBuffer) {
    // <-- NEW: Accept playbackBuffer
    this.scene = scene;
    this.controlsUI = controlsUI;
    this.playbackBuffer = playbackBuffer; // <-- NEW: Store the buffer
    this.suggestions = [];

    this.markerContainer = document.createElement("div");
    this.markerContainer.style.position = "absolute";
    this.markerContainer.style.top = "0";
    this.markerContainer.style.left = "0";
    this.markerContainer.style.width = "100%";
    this.markerContainer.style.height = "100%";
    this.markerContainer.style.pointerEvents = "none";
    this.markerContainer.style.zIndex = "-1";

    this.controlsUI.slider.parentElement.appendChild(this.markerContainer);

    const suggestionMaterial = new MeshBasicMaterial({
      color: 0x00aaff,
      opacity: 0.35,
      transparent: true,
      depthWrite: false,
    });
    const geometry = new PlaneGeometry(1, 1);
    this.suggestionBox = new Mesh(geometry, suggestionMaterial);
    this.suggestionBox.rotation.x = -Math.PI / 2;
    this.suggestionBox.visible = false;
    this.scene.add(this.suggestionBox);
  }

  loadSuggestions(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        this.suggestions = data.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
        console.log(`Loaded ${this.suggestions.length} suggestions.`);
        this.drawMarkers();
      } catch (e) {
        console.error("Error parsing suggestions.json:", e);
      }
    };
    reader.readAsText(file);
  }

  drawMarkers() {
    this.markerContainer.innerHTML = "";
    if (this.suggestions.length === 0 || !this.playbackBuffer) return;

    const sliderWidth = this.controlsUI.slider.offsetWidth;

    // --- THE KEY FIX: Use the main playback buffer's timespan ---
    const matchTimeSpan = this.playbackBuffer.timeSpan();
    if (matchTimeSpan.end <= matchTimeSpan.start) return;

    this.suggestions.forEach((suggestion) => {
      // Calculate percentage based on the FULL match timeline
      const percent =
        (suggestion.timestamp_ms - matchTimeSpan.start) /
        (matchTimeSpan.end - matchTimeSpan.start);

      // Only draw markers that are within the visible timeline
      if (percent >= 0 && percent <= 1) {
        const leftPos = percent * sliderWidth;

        const marker = document.createElement("div");
        marker.style.position = "absolute";
        marker.style.left = `${leftPos}px`;
        marker.style.top = "50%";
        marker.style.transform = "translateY(-50%)";
        marker.style.width = "2px";
        marker.style.height = "12px";
        marker.style.background = "rgba(0, 170, 255, 0.6)";
        marker.style.borderRadius = "1px";

        this.markerContainer.appendChild(marker);
      }
    });
  }

  update(playbackClock) {
    // This update logic is safe and should remain.
    try {
      if (!this.suggestions || this.suggestions.length === 0) {
        this.suggestionBox.visible = false;
        return;
      }
      const activeSuggestion = this.suggestions.find(
        (s) => Math.abs(s.timestamp_ms - playbackClock) < 100
      );
      if (
        activeSuggestion &&
        activeSuggestion.predicted_lq_center &&
        typeof activeSuggestion.predicted_lq_center.x === "number" &&
        typeof activeSuggestion.predicted_lq_center.z === "number"
      ) {
        this.suggestionBox.visible = true;
        const { x, z } = activeSuggestion.predicted_lq_center;
        if (isFinite(x) && isFinite(z)) {
          this.suggestionBox.scale.set(10, 10, 1);
          this.suggestionBox.position.set(x, 0.03, z);
        } else {
          this.suggestionBox.visible = false;
        }
      } else {
        this.suggestionBox.visible = false;
      }
    } catch (e) {
      console.error("Error in SuggestionManager.update:", e);
      this.suggestionBox.visible = false;
    }
  }
}
