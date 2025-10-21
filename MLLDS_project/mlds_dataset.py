# mlds_dataset.py (Complete v2.2 - Correctly Decoupled)

import json
import os
import numpy as np
import torch
from torch.utils.data import Dataset
from scipy.ndimage import gaussian_filter
from scipy.spatial import ConvexHull, distance_matrix
import cv2 # OpenCV is needed for drawing lines and polygons

# ====================================================================
# 1. CONFIGURATION AND HELPER FUNCTIONS
# ====================================================================

PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0
IMAGE_HEIGHT = 80
IMAGE_WIDTH = 128
MAX_SPEED_NORMALIZATION = 10.0

DEF_ROLES = ['CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB']
MID_ROLES = ['CM', 'CDM', 'CAM', 'LM', 'RM', 'DM', 'AM']

def _world_to_pixel(x, z):
    """Converts world coordinates to pixel coordinates."""
    px = int(((x + PITCH_LENGTH / 2) / PITCH_LENGTH) * IMAGE_WIDTH)
    py = int(((z + PITCH_WIDTH / 2) / PITCH_WIDTH) * IMAGE_HEIGHT)
    return np.clip(px, 0, IMAGE_WIDTH - 1), np.clip(py, 0, IMAGE_HEIGHT - 1)

def get_players_by_role(players, role_list):
    """Filters players based on a list of roles."""
    return [p for p in players if p.get('role') in role_list]

# ====================================================================
# 2. DATASET FOR THE LEAKAGE DETECTOR (LQ DETECTOR CNN)
# ====================================================================

class LQ_Detector_Dataset(Dataset):
    """
    Dataset for training the U-Net based Leakage Detector.
    Generates rich, multi-channel raster images and a focused set of
    structural global features as input, with a target heatmap as output.
    """
    def __init__(self, jsonl_path, pitch_control_dir='data/pitch_control'):
        self.samples = []
        with open(jsonl_path, 'r') as f:
            for line in f:
                self.samples.append(json.loads(line))
        
        self.pitch_control_dir = pitch_control_dir
        self.img_dims = (IMAGE_WIDTH, IMAGE_HEIGHT)
        print(f"Loaded {len(self.samples)} samples for full-feature LQ Detector.")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        player_data = sample['input_features']['player_data']
        attacking_team = sample['metadata']['attacking_team_name']
        lq_box = sample['ground_truth_labels']['lq_box']
        img_shape = self.img_dims[::-1] # (height, width)
        
        # --- 1. GENERATE ALL 11 RASTER CHANNELS ---
        ch = { k: np.zeros(img_shape, dtype=np.float32) for k in [
            'attackers', 'defenders', 'ball', 'vx', 'vz', 'receiver',
            'def_line', 'mid_line', 'space_between', 'hulls'
        ]}
        
        attackers = [p for p in player_data if p.get('team') == attacking_team]
        defenders = [p for p in player_data if p.get('team') not in [attacking_team, 'Ball', 'Referee']]

        for p in player_data:
            px, py = _world_to_pixel(p['x'], p['z'])
            if p.get('team') == attacking_team: ch['attackers'][py, px] = 1.0
            elif p in defenders: ch['defenders'][py, px] = 1.0
            elif p.get('team') == 'Ball': ch['ball'][py, px] = 1.0
            ch['vx'][py, px] = p.get('vx', 0.0) / MAX_SPEED_NORMALIZATION
            ch['vz'][py, px] = p.get('vz', 0.0) / MAX_SPEED_NORMALIZATION
            
        if lq_box and attackers:
            lq_center = np.array([lq_box['center_x'], lq_box['center_z']])
            att_pos = np.array([[p['x'], p['z']] for p in attackers])
            if att_pos.shape[0] > 0:
                closest_idx = np.argmin(distance_matrix(att_pos, [lq_center]))
                receiver = attackers[closest_idx]
                er_px, er_py = _world_to_pixel(receiver['x'], receiver['z'])
                ch['receiver'][er_py, er_px] = 1.0

        def_line_players = sorted(get_players_by_role(defenders, DEF_ROLES), key=lambda p: p['z'])
        mid_line_players = sorted(get_players_by_role(defenders, MID_ROLES), key=lambda p: p['z'])
        
        if len(def_line_players) > 1:
            pts = np.array([_world_to_pixel(p['x'], p['z']) for p in def_line_players], dtype=np.int32).reshape((-1, 1, 2))
            cv2.polylines(ch['def_line'], [pts], isClosed=False, color=1, thickness=1)
        
        if len(mid_line_players) > 1:
            pts = np.array([_world_to_pixel(p['x'], p['z']) for p in mid_line_players], dtype=np.int32).reshape((-1, 1, 2))
            cv2.polylines(ch['mid_line'], [pts], isClosed=False, color=1, thickness=1)

        if def_line_players and mid_line_players:
            def_line_depth_x = np.mean([p['x'] for p in def_line_players])
            mid_line_depth_x = np.mean([p['x'] for p in mid_line_players])
            start_px, _ = _world_to_pixel(min(def_line_depth_x, mid_line_depth_x), 0)
            end_px, _ = _world_to_pixel(max(def_line_depth_x, mid_line_depth_x), 0)
            ch['space_between'][:, start_px:end_px] = 1.0
            
        if len(attackers) > 2:
            att_points = np.array([_world_to_pixel(p['x'], p['z']) for p in attackers], dtype=np.int32)
            hull = ConvexHull(att_points).vertices
            cv2.fillConvexPoly(ch['hulls'], att_points[hull], 1.0)
        if len(defenders) > 2:
            def_points = np.array([_world_to_pixel(p['x'], p['z']) for p in defenders], dtype=np.int32)
            hull = ConvexHull(def_points).vertices
            cv2.fillConvexPoly(ch['hulls'], def_points[hull], -1.0)

        timestamp = sample['metadata']['timestamp_ms']
        pc_path = os.path.join(self.pitch_control_dir, f'frame_{timestamp}.npy')
        try:
            ch_pc = np.load(pc_path)
            if ch_pc.shape != img_shape: ch_pc = np.zeros(img_shape, dtype=np.float32)
        except (FileNotFoundError, ValueError):
            ch_pc = np.zeros(img_shape, dtype=np.float32)
        
        raster_input = np.stack(list(ch.values()) + [ch_pc], axis=0)

        # --- 2. EXTRACT *ONLY* STRUCTURAL GLOBAL FEATURES ---
        numerical_features = sample['input_features']['numerical_features']
        structural_feature_keys = [
            'attack_centroid_x', 'attack_centroid_z', 'defend_centroid_x', 'defend_centroid_z',
            'attack_depth', 'attack_width', 'defend_depth', 'defend_width',
            'defensive_line_depth', 'formation_disruption_index'
        ]
        attacking_direction = sample['metadata'].get('attacking_direction', 0)
        global_feature_vec = np.array(
            [numerical_features.get(k, 0) for k in structural_feature_keys] + [attacking_direction],
            dtype=np.float32
        )
        
        # --- 3. PREPARE GROUND TRUTH LABEL ---
        target_heatmap = np.zeros(img_shape, dtype=np.float32)
        if sample['ground_truth_labels']['has_leakage']:
            tx, ty = _world_to_pixel(lq_box['center_x'], lq_box['center_z'])
            target_heatmap[ty, tx] = 1.0
            target_heatmap = gaussian_filter(target_heatmap, sigma=2.0)
            if target_heatmap.max() > 0:
                target_heatmap /= target_heatmap.max()
        target_heatmap = np.expand_dims(target_heatmap, axis=0)
        
        return {
            'raster_input': torch.from_numpy(raster_input),
            'global_features': torch.from_numpy(global_feature_vec),
            'target_heatmap': torch.from_numpy(target_heatmap),
        }

# ====================================================================
# 3. DATASET FOR THE LEAKAGE SCORER (LS PREDICTOR)
# ====================================================================
class LS_Predictor_Dataset(Dataset):
    """
    Dataset for training the tabular Leakage Scorer model (e.g., XGBoost).
    """
    def __init__(self, jsonl_path):
        samples = []
        with open(jsonl_path, 'r') as f:
            for line in f:
                data = json.loads(line)
                if data['metadata']['label_type'] in ['LQ_CC', 'LQ_noCC']:
                    samples.append(data)
        
        self.samples = samples
        if not self.samples:
            self.feature_names = []
            self.X = np.array([])
            self.y = np.array([])
            return
            
        self.feature_names = sorted(list(self.samples[0]['input_features']['numerical_features'].keys()))
        
        self.X = np.array([[s['input_features']['numerical_features'].get(fname, -1) for fname in self.feature_names] for s in self.samples], dtype=np.float32)
        self.y = np.array([s['ground_truth_labels']['chance_created'] for s in self.samples], dtype=np.float32)
        
        print(f"Loaded {len(self.samples)} samples for LS Predictor training.")
        if self.X.shape:
             print(f"Feature vector size: {self.X.shape[1]}")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        return {
            'features': torch.from_numpy(self.X[idx]),
            'label': torch.from_numpy(np.array([self.y[idx]]))
        }