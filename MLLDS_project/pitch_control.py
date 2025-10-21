import json
import numpy as np
import os
from scipy.spatial.distance import cdist
from tqdm import tqdm

# --- Configuration Constants (should match your dataset loader) ---
PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0
IMAGE_HEIGHT = 80
IMAGE_WIDTH = 128

# --- Pitch Control Model Parameters (Tunable) ---
# For a more detailed explanation of these parameters, see Friends of Tracking blog.
TIME_TO_INTERCEPT_LIMIT = 4.0  # Max seconds into the future we project
PLAYER_MAX_SPEED = 9.0         # m/s
PLAYER_REACTION_TIME = 0.7     # seconds
BALL_AVERAGE_SPEED = 15.0      # m/s

def calculate_pitch_control_for_frame(player_data, attacking_team_name, attacking_direction):
    """
    Calculates a pitch control map for a single frame of data.
    Returns a 2D numpy array (IMAGE_HEIGHT, IMAGE_WIDTH).
    """
    # 1. Create a grid of target points on the pitch
    x_coords = np.linspace(-PITCH_LENGTH / 2, PITCH_LENGTH / 2, IMAGE_WIDTH)
    z_coords = np.linspace(-PITCH_WIDTH / 2, PITCH_WIDTH / 2, IMAGE_HEIGHT)
    target_points = np.array(np.meshgrid(x_coords, z_coords)).T.reshape(-1, 2) # Shape: (9920, 2)

    # 2. Separate players
    attackers = [p for p in player_data if p['team'] == attacking_team_name]
    defenders = [p for p in player_data if p['team'] != attacking_team_name and p['role'] not in ['BALL', 'REF']]
    
    # Initialize arrays to store time-to-intercept for each team
    min_time_attackers = np.full(target_points.shape[0], TIME_TO_INTERCEPT_LIMIT, dtype=np.float32)
    min_time_defenders = np.full(target_points.shape[0], TIME_TO_INTERCEPT_LIMIT, dtype=np.float32)

    # 3. Calculate time-to-intercept for each player to each grid point
    for players, min_time_array in [(attackers, min_time_attackers), (defenders, min_time_defenders)]:
        if not players:
            continue
            
        positions = np.array([[p['x'], p['z']] for p in players]) # Shape: (num_players, 2)
        velocities = np.array([[p.get('vx', 0.0), p.get('vz', 0.0)] for p in players]) # Shape: (num_players, 2)
        
        # Calculate vector from each player to each target point
        # Shape: (num_players, num_targets, 2)
        player_to_target_vec = target_points[np.newaxis, :, :] - positions[:, np.newaxis, :]
        
        # Calculate distance from each player to each target point
        # Shape: (num_players, num_targets)
        player_to_target_dist = np.linalg.norm(player_to_target_vec, axis=2)
        
        # Normalize the vectors to get unit vectors (directions)
        # Add a small epsilon to avoid division by zero
        player_to_target_unit_vec = player_to_target_vec / (player_to_target_dist[..., np.newaxis] + 1e-8)

        # --- THIS IS THE CORRECTED LOGIC ---
        # Calculate the dot product between each player's single velocity vector
        # and their thousands of direction vectors to the target points.
        # Reshape velocities to (num_players, 1, 2) to allow broadcasting.
        # The result is the component of their velocity in the direction of the target.
        # Shape: (num_players, num_targets)
        dot_product = np.sum(velocities[:, np.newaxis, :] * player_to_target_unit_vec, axis=2)
        # --- END OF CORRECTION ---
        
        # Effective speed is their speed component towards the target, but can't be negative or faster than max speed.
        effective_speed = np.clip(dot_product, 0, PLAYER_MAX_SPEED)
        
        # Time to intercept (distance / speed), adding a small epsilon to avoid division by zero.
        time_to_intercept = player_to_target_dist / (effective_speed + 1e-8)
        
        # Add reaction time
        time_to_intercept += PLAYER_REACTION_TIME
        
        # For each target point, find the minimum time to intercept among all players on the team.
        # Shape: (num_targets,)
        min_time_for_team = np.min(time_to_intercept, axis=0)
        
        # Update the overall minimum time for the team for each grid cell
        np.minimum(min_time_array, min_time_for_team, out=min_time_array)

    # 4. Calculate pitch control probability using a sigmoid function
    control_diff = min_time_defenders - min_time_attackers
    pitch_control_prob = 1 / (1 + np.exp(-control_diff))
    
    return pitch_control_prob.reshape(IMAGE_HEIGHT, IMAGE_WIDTH)

def process_data_file(jsonl_path, output_dir='data/pitch_control'):
    """
    Main function to loop through a JSONL file and generate pitch control maps.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created directory: {output_dir}")

    with open(jsonl_path, 'r') as f:
        lines = f.readlines()

    for line in tqdm(lines, desc="Generating Pitch Control Maps"):
        sample = json.loads(line)
        timestamp = sample['metadata']['timestamp_ms']
        
        # Check if the file already exists to avoid re-computation
        output_path = os.path.join(output_dir, f'frame_{timestamp}.npy')
        if os.path.exists(output_path):
            continue

        pc_map = calculate_pitch_control_for_frame(
            player_data=sample['input_features']['player_data'],
            attacking_team_name=sample['metadata']['attacking_team_name'],
            attacking_direction=sample['metadata'].get('attacking_direction', 1)
        )
        
        np.save(output_path, pc_map.astype(np.float32))

if __name__ == '__main__':
    # --- USAGE ---
    # Run this script from your terminal: python pitch_control.py
    data_file = 'mlds_data_v2.1_patched.jsonl' # <-- CHANGE TO YOUR DATA FILE NAME
    if not os.path.exists(data_file):
        print(f"Error: Data file not found at '{data_file}'. Please update the path.")
    else:
        process_data_file(jsonl_path=data_file)
        print("Pitch control map generation complete.")