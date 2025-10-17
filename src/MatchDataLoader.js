// src/MatchDataLoader.js

export class MatchDataLoader {
  constructor(metadataUrl, trackingDataUrl) {
    this.metadataUrl = metadataUrl;
    this.trackingDataUrl = trackingDataUrl;
    this.trackableObjectMap = new Map();
    this.processedFrames = [];
    this.metadata = null;
  }

  async load() {
    try {
      const [metaResponse, trackResponse] = await Promise.all([
        fetch(this.metadataUrl),
        fetch(this.trackingDataUrl),
      ]);

      if (!metaResponse.ok)
        throw new Error(`Failed to load metadata: ${metaResponse.statusText}`);
      if (!trackResponse.ok)
        throw new Error(
          `Failed to load tracking data: ${trackResponse.statusText}`
        );

      this.metadata = await metaResponse.json();
      const trackingData = await trackResponse.json();

      this._process(this.metadata, trackingData);

      console.log(
        `✅ Loaded and processed ${this.processedFrames.length} frames.`
      );
      return this.processedFrames;
    } catch (error) {
      console.error("Error loading match data:", error);
      return [];
    }
  }

  _createMetadataMap(metadata) {
    const homeTeamName = metadata.home_team.name;
    const awayTeamName = metadata.away_team.name;
    const homeTeamId = metadata.home_team.id;

    metadata.players.forEach((p) => {
      this.trackableObjectMap.set(p.trackable_object, {
        id: `P${p.id}`,
        name: p.last_name || "Player",
        number: p.number,
        team: p.team_id === homeTeamId ? homeTeamName : awayTeamName,
        // --- NEW ---
        // Store the player's role acronym (e.g., 'LCB', 'CM', 'CF')
        role: p.player_role ? p.player_role.acronym : "UNKNOWN",
      });
    });

    metadata.referees.forEach((r) => {
      this.trackableObjectMap.set(r.trackable_object, {
        id: `R${r.id}`,
        name: r.last_name || "Referee",
        team: "Referee",
        role: "REF",
      });
    });

    this.trackableObjectMap.set(55, {
      id: "Ball",
      name: "Ball",
      team: "Ball",
      role: "BALL",
    });
  }

  _process(metadata, trackingData) {
    this._createMetadataMap(metadata);

    const FPS = 10; // Your data is 10 frames per second

    this.processedFrames = trackingData
      .map((rawFrame) => {
        // If there is no data, or the frame number is missing, it's an invalid frame.
        if (
          !rawFrame.data ||
          rawFrame.data.length === 0 ||
          rawFrame.frame === undefined
        ) {
          return null;
        }

        const playersInFrame = [];
        for (const trackedObj of rawFrame.data) {
          const entityInfo = this.trackableObjectMap.get(
            trackedObj.trackable_object
          );
          if (entityInfo) {
            playersInFrame.push({
              id: entityInfo.id,
              name: entityInfo.name,
              team: entityInfo.team,
              role: entityInfo.role,
              x: trackedObj.x * 100,
              y: -trackedObj.y * 100, // Using the corrected non-inverted Z-axis
            });
          }
        }

        // If after processing, there are no valid players, also discard the frame.
        if (playersInFrame.length === 0) {
          return null;
        }

        // --- THE DEFINITIVE FIX ---
        // Calculate the timestamp directly from the frame number.
        // This is much more reliable than the "time" field which can be null.
        const calculated_ms = (rawFrame.frame / FPS) * 1000;

        return {
          frame_num: rawFrame.frame,
          frame_time_ms: calculated_ms, // Use the reliable calculated time
          players: playersInFrame,
        };
      })
      .filter((frame) => frame !== null);

    console.log(
      `[MatchDataLoader] Processed data. Kept ${this.processedFrames.length} valid frames.`
    );
  }
}
