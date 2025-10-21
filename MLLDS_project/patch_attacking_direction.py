# patch_attacking_direction.py

import json
from tqdm import tqdm

# ====================================================================
# 1. CONFIGURATION
# ====================================================================

# The file that is MISSING the 'attacking_direction' key.
INPUT_FILE = 'mlds_test_2.jsonl' 

# The new, corrected file that will be created.
OUTPUT_FILE = 'mlds_data_v2.1_patched.jsonl'

# We need to know which team is the home team to correctly assign direction.
# You will need to set this manually for the match you've annotated.
# This assumes the home team attacks right (+1) in the first half.
HOME_TEAM_NAME = "Real Madrid CF" # <-- IMPORTANT: CHANGE THIS if you annotated a different match

# Time in milliseconds for halftime (45 minutes * 60 seconds * 1000 ms)
HALFTIME_MS = 2700000 

# ====================================================================
# 2. MAIN PATCHING SCRIPT
# ====================================================================

def patch_file():
    """
    Reads the input JSONL file, adds the 'attacking_direction' key to each
    sample's metadata, and writes the corrected samples to a new file.
    """
    print(f"--- Patching Attacking Direction into '{INPUT_FILE}' ---")
    
    try:
        with open(INPUT_FILE, 'r') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"FATAL: Input file '{INPUT_FILE}' not found. Please check the file name.")
        return

    patched_samples = []
    
    for line in tqdm(lines, desc="Patching samples"):
        try:
            sample = json.loads(line)
            
            # --- This is the core logic ---
            
            # 1. Skip if the key already exists (just in case)
            if 'attacking_direction' in sample['metadata']:
                patched_samples.append(sample)
                continue

            # 2. Get necessary metadata
            timestamp = sample['metadata']['timestamp_ms']
            attacking_team = sample['metadata']['attacking_team_name']

            # 3. Determine direction based on halftime and who is attacking
            is_second_half = timestamp > HALFTIME_MS
            
            if attacking_team == HOME_TEAM_NAME:
                # Home team attacks right (+1) in 1st half, left (-1) in 2nd
                attacking_direction = -1 if is_second_half else 1
            else:
                # Away team attacks left (-1) in 1st half, right (+1) in 2nd
                attacking_direction = 1 if is_second_half else -1
            
            # 4. Add the new key to the metadata
            sample['metadata']['attacking_direction'] = attacking_direction
            
            patched_samples.append(sample)

        except (json.JSONDecodeError, KeyError) as e:
            tqdm.write(f"Warning: Skipping a line due to a parsing error: {e}")

    # --- Save the new, patched file ---
    with open(OUTPUT_FILE, 'w') as f:
        for sample in patched_samples:
            f.write(json.dumps(sample) + '\n')
            
    print("\n--- Patching Complete ---")
    print(f"Processed {len(lines)} lines.")
    print(f"New file with 'attacking_direction' saved to '{OUTPUT_FILE}'.")
    print("You can now use this patched file as the input for 'augment_dataset.py'.")

if __name__ == '__main__':
    if HOME_TEAM_NAME == "BArcelona":
        print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
        print("!!! ERROR: Please edit the script and set the HOME_TEAM_NAME variable. !!!")
        print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!")
    else:
        patch_file()