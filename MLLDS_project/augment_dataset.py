# augment_dataset.py (Complete, Final, and Corrected Version)

import json
import random
import numpy as np
import requests
from tqdm import tqdm
import copy

# ====================================================================
# 1. CONFIGURATION
# ====================================================================

# --- Input/Output Files ---
# This should be your clean, feature-extracted dataset from Phase 1 data collection.
INPUT_FILE = 'mlds_data_v2.1_patched.jsonl' 
OUTPUT_FILE = 'mlds_data_v2_augmented.jsonl' # The final, massive dataset for training

# --- API Endpoint ---
FEATURE_EXTRACTOR_URL = 'http://127.0.0.1:5100/extract_features'

# --- Augmentation Parameters ---
# These are used to add variability to the combinatorial augmentations.
P_DROPOUT = 0.8 # High probability to apply dropout when the 'dropout' combination is active.
P_SCALING = 0.8 # High probability to apply scaling when the 'scaling' combination is active.

# Range of scaling factors to randomly choose from
SCALING_FACTORS = [0.90, 0.95, 1.05, 1.10] 
MAX_DROPOUT_PLAYERS = 4 # Max number of "irrelevant" players to drop in a single sample

# ====================================================================
# 2. AUGMENTATION HELPER FUNCTIONS
# ====================================================================

def augment_flip(player_data, lq_box):
    """
    Horizontally flips all coordinates and x-velocities.
    Mirrors the game across the vertical centerline.
    """
    new_player_data = []
    for p in player_data:
        new_p = copy.deepcopy(p)
        new_p['x'] *= -1
        if 'vx' in new_p: new_p['vx'] *= -1
        new_player_data.append(new_p)
    
    new_lq_box = None
    if lq_box:
        new_lq_box = copy.deepcopy(lq_box)
        new_lq_box['center_x'] *= -1
        
    return new_player_data, new_lq_box

def augment_dropout(player_data, lq_box):
    """
    Intelligently removes players who are far from the leakage quadrant (region of interest).
    Does not apply to negative samples where lq_box is None.
    """
    if lq_box is None:
        return player_data # No ROI, so we don't drop anyone

    roi_center = np.array([lq_box['center_x'], lq_box['center_z']])
    players_to_keep = []
    far_players = []

    for player in player_data:
        player_pos = np.array([player['x'], player['z']])
        distance_to_roi = np.linalg.norm(player_pos - roi_center)
        if distance_to_roi < 40.0 or player.get('team') == 'Ball':
            players_to_keep.append(player)
        else:
            far_players.append(player)

    if not far_players:
        return player_data
            
    num_to_drop = random.randint(1, min(MAX_DROPOUT_PLAYERS, len(far_players)))
    kept_far_players = random.sample(far_players, len(far_players) - num_to_drop)
    
    return players_to_keep + kept_far_players

def augment_scaling(player_data, lq_box, scale_factor):
    """
    Scales all coordinates (players and LQ) in or out from the center of the pitch (0,0).
    """
    new_player_data = []
    for p in player_data:
        new_p = copy.deepcopy(p)
        new_p['x'] *= scale_factor
        new_p['z'] *= scale_factor
        if 'vx' in new_p: new_p['vx'] *= scale_factor
        if 'vz' in new_p: new_p['vz'] *= scale_factor
        new_player_data.append(new_p)
        
    new_lq_box = None
    if lq_box:
        new_lq_box = copy.deepcopy(lq_box)
        new_lq_box['center_x'] *= scale_factor
        new_lq_box['center_z'] *= scale_factor
        if 'width' in new_lq_box: new_lq_box['width'] *= scale_factor
        if 'height' in new_lq_box: new_lq_box['height'] *= scale_factor
        
    return new_player_data, new_lq_box

# ====================================================================
# 3. MAIN SCRIPT
# ====================================================================

def run_augmentation_pipeline():
    print("--- Starting Combinatorial Offline Augmentation Pipeline ---")
    
    try:
        with open(INPUT_FILE, 'r') as infile:
            original_samples = [json.loads(line) for line in infile]
    except FileNotFoundError:
        print(f"FATAL: Input file '{INPUT_FILE}' not found. Please check the file name.")
        return

    augmented_samples = []
    session = requests.Session()

    for original_sample in tqdm(original_samples, desc="Augmenting samples"):
        
        base_player_data = original_sample['input_features']['player_data']
        base_lq_box = original_sample['ground_truth_labels'].get('lq_box')
        
        # Infer defending team name robustly
        teams_in_match = set(p['team'] for p in base_player_data if p['team'] not in ['Ball', 'Referee'])
        attacking_team = original_sample['metadata']['attacking_team_name']
        defending_team = next((team for team in teams_in_match if team != attacking_team), None)
        
        if not defending_team:
             tqdm.write(f"Warning: Could not determine defending team for sample at ts {original_sample['metadata']['timestamp_ms']}. Skipping augmentations for this sample.")
             augmented_samples.append(original_sample)
             continue

        combinations = [
            (False, False, False), (True,  False, False),
            (False, True,  False), (False, False, True),
            (True,  True,  False), (True,  False, True),
            (False, True,  True),  (True,  True,  True),
        ]

        for i, (do_flip, do_dropout, do_scale) in enumerate(combinations):
            
            # For the first combination (original), just append the sample and continue
            if i == 0:
                if 'numerical_features' in original_sample['input_features']:
                    augmented_samples.append(original_sample)
                else:
                    tqdm.write(f"Warning: Original sample at ts {original_sample['metadata']['timestamp_ms']} is missing numerical_features. It should have been pre-processed.")
                continue

            # Start with a fresh deep copy for each new augmentation
            current_player_data = copy.deepcopy(base_player_data)
            current_lq_box = copy.deepcopy(base_lq_box)
            is_flipped = False

            if do_flip:
                is_flipped = True
                current_player_data, current_lq_box = augment_flip(current_player_data, current_lq_box)
            
            if do_dropout and random.random() < P_DROPOUT:
                current_player_data = augment_dropout(current_player_data, current_lq_box)
            
            if do_scale and random.random() < P_SCALING:
                scale_factor = random.choice(SCALING_FACTORS)
                current_player_data, current_lq_box = augment_scaling(current_player_data, current_lq_box,scale_factor)
            
            # Assemble the payload for the feature extractor server
            payload = {
                'player_data': current_player_data,
                'metadata': {
                    'attacking_team_name': attacking_team,
                    'defending_team_name': defending_team,
                    'attacking_direction': original_sample['metadata']['attacking_direction'],
                    'carrier_id': original_sample['metadata'].get('carrier_id')
                },
                'lq_data': None
            }
            if is_flipped:
                payload['metadata']['attacking_direction'] *= -1

            if current_lq_box:
                lq = current_lq_box
                payload['lq_data'] = {
                    'center_x': lq['center_x'], 'center_z': lq['center_z'],
                    'width': lq.get('width', 0), 'height': lq.get('height', 0),
                    'area': lq.get('width', 0) * lq.get('height', 0)
                }

            try:
                response = session.post(FEATURE_EXTRACTOR_URL, json=payload)
                response.raise_for_status() # Raises an exception for bad status codes (4xx or 5xx)
                result = response.json()
                if result['success']:
                    # Re-assemble the final sample structure for saving
                    new_sample = {
                        'metadata': original_sample['metadata'].copy(),
                        'ground_truth_labels': original_sample['ground_truth_labels'].copy(),
                        'input_features': {
                            'player_data': current_player_data,
                            'numerical_features': result['features']
                        }
                    }
                    new_sample['ground_truth_labels']['lq_box'] = current_lq_box
                    augmented_samples.append(new_sample)
                else:
                    tqdm.write(f"Warning: Feature extraction failed for an augmented sample. Server Error: {result['error']}")
            except requests.exceptions.RequestException as e:
                tqdm.write(f"\nFATAL: Could not connect to feature extractor server. Is it running? Error: {e}")
                return # Stop the entire process if the server is down

    # --- Save the final dataset ---
    with open(OUTPUT_FILE, 'w') as outfile:
        for sample in augmented_samples:
            outfile.write(json.dumps(sample) + '\n')
            
    print("\n--- Augmentation Complete ---")
    print(f"Original samples: {len(original_samples)}")
    print(f"Target combinations per sample: {len(combinations)}")
    print(f"New augmented dataset size: {len(augmented_samples)}")
    print(f"Saved to '{OUTPUT_FILE}'")


if __name__ == '__main__':
    run_augmentation_pipeline()