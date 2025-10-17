# feature_extractor.py

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from scipy.spatial import ConvexHull
from scipy.spatial.distance import cdist
import traceback

# ====================================================================
# 1. HELPER FUNCTIONS & CONFIGURATION
# ====================================================================

PITCH_LENGTH = 105.0
PITCH_WIDTH = 68.0

# Parameters for counter-attack detection (tunable)
COUNTER_V_MEAN_THRESH = 3.0
COUNTER_FRAC_THRESH = 0.35
COUNTER_DEF_BACK_THRESH = -1.5

# Player role groupings for line detection
DEF_ROLES = ['CB', 'LCB', 'RCB', 'LB', 'RB', 'LWB', 'RWB']
MID_ROLES = ['CM', 'CDM', 'CAM', 'LM', 'RM', 'DM', 'AM']
ATT_ROLES = ['CF', 'ST', 'LW', 'RW']

def get_players_by_role(players, role_list):
    return [p for p in players if p.get('role') in role_list]

def get_team_players(players, team_name):
    return [p for p in players if p.get('team') == team_name and p.get('role') not in ['GK']]

# In feature_extractor.py, near the top

def get_passing_cone_corners(start_point, quad_corners):
    """
    Finds the two corners of a quadrilateral that form the widest cone from a start point.
    Args:
        start_point (np.array): A 1D array [x, z] for the carrier.
        quad_corners (np.array): A 2D array [[x1,z1], [x2,z2], ...] for the LQ corners.
    Returns:
        np.array: A 2D array containing the two corner points of the cone.
    """
    max_angle = -1
    cone_corners = None
    
    for i in range(len(quad_corners)):
        for j in range(i + 1, len(quad_corners)):
            v1 = quad_corners[i] - start_point
            v2 = quad_corners[j] - start_point
            
            # Use dot product formula for angle: cos(theta) = (v1 . v2) / (||v1|| * ||v2||)
            # To avoid expensive arccos, we can just minimize the cosine of the angle
            # for the widest angle, but let's calculate the angle for clarity.
            cosine_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
            angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))

            if angle > max_angle:
                max_angle = angle
                cone_corners = np.array([quad_corners[i], quad_corners[j]])
                
    return cone_corners


def is_point_in_triangle(p, a, b, c):
    """Checks if a point p is inside the triangle defined by a, b, c."""
    # Barycentric coordinate system method
    v0 = c - a
    v1 = b - a
    v2 = p - a
    
    dot00 = np.dot(v0, v0)
    dot01 = np.dot(v0, v1)
    dot02 = np.dot(v0, v2)
    dot11 = np.dot(v1, v1)
    dot12 = np.dot(v1, v2)
    
    inv_denom = 1 / (dot00 * dot11 - dot01 * dot01)
    u = (dot11 * dot02 - dot01 * dot12) * inv_denom
    v = (dot00 * dot12 - dot01 * dot02) * inv_denom
    
    return (u >= 0) and (v >= 0) and (u + v < 1)

# ====================================================================
# 2. FEATURE CALCULATION PIPELINE
# ====================================================================

def calculate_all_numerical_features(player_data, metadata, lq_data):
    """
    Master function to calculate the entire numerical feature vector.
    """
    # --- Initial Setup ---
    attacking_team_name = metadata['attacking_team_name']
    defending_team_name = metadata['defending_team_name']
    attacking_direction = metadata['attacking_direction']
    
    attackers = get_team_players(player_data, attacking_team_name)
    defenders = get_team_players(player_data, defending_team_name)
    carrier = next((p for p in player_data if p['id'] == metadata.get('carrier_id')), None)
    ball = next((p for p in player_data if p['team'] == 'Ball'), None)
    
    if not all([attackers, defenders, ball]):
        raise ValueError("Missing essential player data (attackers, defenders, or ball).")

    # --- Feature Calculation ---
    features = {}
    
    # Group A: Original Global Features
    _calculate_group_a(features, attackers, defenders, attacking_direction)
    
    # Group B: Advanced Tactical Features
    _calculate_group_b(features, attackers, defenders, carrier, ball, attacking_direction)
    
    # Group C: Exhaustive Raw Heuristic Inputs (if LQ is provided)
    if lq_data:
        _calculate_group_c(features, lq_data, attackers, defenders, carrier, attacking_direction)
        
    return features


def _calculate_group_a(features, attackers, defenders, attacking_direction):
    """Calculates original global features and adds them to the features dict."""
    features['attack_centroid_x'] = np.mean([p['x'] for p in attackers])
    features['attack_centroid_z'] = np.mean([p['z'] for p in attackers])
    features['defend_centroid_x'] = np.mean([p['x'] for p in defenders])
    features['defend_centroid_z'] = np.mean([p['z'] for p in defenders])
    features['attack_depth'] = max(p['x'] for p in attackers) - min(p['x'] for p in attackers)
    features['attack_width'] = max(p['z'] for p in attackers) - min(p['z'] for p in attackers)
    features['defend_depth'] = max(p['x'] for p in defenders) - min(p['x'] for p in defenders)
    features['defend_width'] = max(p['z'] for p in defenders) - min(p['z'] for p in defenders)
    
    back_line_players = get_players_by_role(defenders, DEF_ROLES)
    if not back_line_players: # Fallback to all defenders if no specific roles match
        back_line_players = defenders
        
    features['defensive_line_depth'] = np.mean([p['x'] for p in back_line_players]) if back_line_players else 0
    
    # Disruption is calculated relative to the team's own centroid, which is more robust.
    def_centroid = np.array([features['defend_centroid_x'], features['defend_centroid_z']])
    if len(defenders) > 1:
        def_positions = np.array([[p['x'], p['z']] for p in defenders])
        distances = cdist(def_positions, [def_centroid]).flatten()
        features['formation_disruption_index'] = np.std(distances)
    else:
        features['formation_disruption_index'] = 0

def _calculate_group_b(features, attackers, defenders, carrier, ball, attacking_direction):
    """Calculates advanced tactical features."""
    def_line = get_players_by_role(defenders, DEF_ROLES)
    mid_line = get_players_by_role(defenders, MID_ROLES)
    att_line = get_players_by_role(attackers, ATT_ROLES)

    def_line_depth = np.mean([p['x'] for p in def_line]) if def_line else None
    mid_line_depth = np.mean([p['x'] for p in mid_line]) if mid_line else None
    att_line_depth = np.mean([p['x'] for p in att_line]) if att_line else None

    features['def_mid_distance'] = abs(def_line_depth - mid_line_depth) if def_line_depth and mid_line_depth else -1
    features['mid_att_distance'] = abs(mid_line_depth - att_line_depth) if mid_line_depth and att_line_depth else -1

    goal_direction_vector = np.array([attacking_direction, 0])
    features['max_forward_runner_speed'] = 0
    if attackers:
        velocities = np.array([[p.get('vx',0), p.get('vz',0)] for p in attackers if p != carrier])
        if velocities.shape[0] > 0:
            forward_speeds = np.dot(velocities, goal_direction_vector)
            features['max_forward_runner_speed'] = np.max(forward_speeds) if len(forward_speeds) > 0 else 0

    goal_attacked_x = attacking_direction * 52.5
    if attacking_direction == 1: # Attacking Right
        features['packing_raw'] = sum(1 for p in defenders if p['x'] > ball['x'])
    else: # Attacking Left
        features['packing_raw'] = sum(1 for p in defenders if p['x'] < ball['x'])

    features['ppo_count'] = 0
    features['dto_count'] = 0
    if carrier:
        features['ppo_count'] = sum(1 for p in attackers if (p['x'] - carrier['x']) * attacking_direction > 0)
        features['dto_count'] = sum(1 for p in defenders if (p['x'] - carrier['x']) * attacking_direction > 0)
    features['ppo_dto_ratio'] = (features['ppo_count'] + 0.1) / (features['dto_count'] + 0.1)

    is_counter = False
    if carrier and features['ppo_count'] > 0:
        attackers_in_front = [p for p in attackers if (p['x'] - carrier['x']) * attacking_direction > 0]
        defenders_in_front = [p for p in defenders if (p['x'] - carrier['x']) * attacking_direction > 0]
        
        att_vels = np.array([[p.get('vx',0), p.get('vz',0)] for p in attackers_in_front])
        proj_att_vels = np.dot(att_vels, goal_direction_vector)
        mean_proj_att_vel = np.mean(proj_att_vels) if len(proj_att_vels) > 0 else 0
        frac_att_fwd = np.mean(proj_att_vels > 1.0) if len(proj_att_vels) > 0 else 0
        
        def_vels = np.array([[p.get('vx',0), p.get('vz',0)] for p in defenders_in_front])
        proj_def_vels = np.dot(def_vels, goal_direction_vector)
        mean_proj_def_vel = np.mean(proj_def_vels) if len(proj_def_vels) > 0 else 0

        if (mean_proj_att_vel >= COUNTER_V_MEAN_THRESH and frac_att_fwd >= COUNTER_FRAC_THRESH and mean_proj_def_vel <= COUNTER_DEF_BACK_THRESH):
            is_counter = True
            
    features['is_counter'] = 1 if is_counter else 0
    features['counter_score'] = (features['ppo_dto_ratio'] * mean_proj_att_vel / 5.0) if is_counter else 0

    if len(attackers) > 2:
        att_points = np.array([[p['x'], p['z']] for p in attackers])
        features['attack_convex_hull_area'] = ConvexHull(att_points).volume
    else:
        features['attack_convex_hull_area'] = 0
        
    if len(defenders) > 2:
        def_points = np.array([[p['x'], p['z']] for p in defenders])
        features['defend_convex_hull_area'] = ConvexHull(def_points).volume
    else:
        features['defend_convex_hull_area'] = 0
        
    features['pitch_control_ratio_in_front'] = -1 # Placeholder - requires pitch control model

def _calculate_group_c(features, lq_data, attackers, defenders, carrier, attacking_direction):
    """Calculates all raw inputs for the original LS heuristic."""
    lq_center = np.array([lq_data['center_x'], lq_data['center_z']])
    goal_pos = np.array([attacking_direction * 52.5, 0])
    carrier_pos = np.array([carrier['x'], carrier['z']])
    
    # Threat
    features['h_lq_dist_to_goal'] = np.linalg.norm(lq_center - goal_pos)
    features['h_lq_runway'] = abs(lq_data['center_x'] - (attacking_direction * 52.5))
    vec_to_goal = goal_pos - lq_center
    angle = np.arctan2(vec_to_goal[1], vec_to_goal[0])
    features['h_lq_angle_to_goal'] = angle
    features['h_lq_area'] = lq_data['area']
    def_line_players = get_players_by_role(defenders, DEF_ROLES)
    if not def_line_players: def_line_players = defenders
    def_line_depth = np.mean([p['x'] for p in def_line_players]) if def_line_players else 0

    lq_x = lq_data['center_x']
    features['h_is_behind_def_line'] = 1 if (lq_x - def_line_depth) * attacking_direction > 0 else 0
    
    # Exploitation
    min_speed = 1.0
    att_pos = np.array([[p['x'], p['z']] for p in attackers])
    att_vel = np.array([[p.get('vx',0), p.get('vz',0)] for p in attackers])
    att_speeds = np.maximum(np.linalg.norm(att_vel, axis=1), min_speed)
    att_ttas = cdist(att_pos, [lq_center]).flatten() / att_speeds
    features['h_att_fastest_tta'] = np.min(att_ttas)

    def_pos = np.array([[p['x'], p['z']] for p in defenders])
    def_vel = np.array([[p.get('vx',0), p.get('vz',0)] for p in defenders])
    def_speeds = np.maximum(np.linalg.norm(def_vel, axis=1), min_speed)
    def_ttas = cdist(def_pos, [lq_center]).flatten() / def_speeds
    features['h_def_fastest_tta'] = np.min(def_ttas)
    
    features['h_time_advantage'] = features['h_def_fastest_tta'] - features['h_att_fastest_tta']
    
    swarm_radius = 10.0
    features['h_att_swarm_count'] = np.sum(cdist(att_pos, [lq_center]) < swarm_radius)
    features['h_def_swarm_count'] = np.sum(cdist(def_pos, [lq_center]) < swarm_radius)
    features['h_swarm_advantage'] = features['h_att_swarm_count'] - features['h_def_swarm_count']

    lq_dir_vecs = lq_center - att_pos
    lq_dir_vecs_norm = lq_dir_vecs / (np.linalg.norm(lq_dir_vecs, axis=1)[:, np.newaxis] + 1e-8)
    proj_speeds = np.einsum('ij,ij->i', att_vel, lq_dir_vecs_norm)
    features['h_att_avg_speed_towards_lq'] = np.mean(proj_speeds[proj_speeds > 0]) if np.any(proj_speeds > 0) else 0

    lq_dir_vecs_def = lq_center - def_pos
    lq_dir_vecs_norm_def = lq_dir_vecs_def / (np.linalg.norm(lq_dir_vecs_def, axis=1)[:, np.newaxis] + 1e-8)
    proj_speeds_def = np.einsum('ij,ij->i', def_vel, lq_dir_vecs_norm_def)
    features['h_def_avg_speed_towards_lq'] = np.mean(proj_speeds_def[proj_speeds_def > 0]) if np.any(proj_speeds_def > 0) else 0

    # Feasibility
    features['h_pass_dist_to_lq'] = np.linalg.norm(carrier_pos - lq_center)
    features['h_pressure_on_carrier_dist'] = np.min(cdist(def_pos, [carrier_pos]))
    # Calculate passing cone and interceptors
    lq_w = lq_data.get('width', np.sqrt(lq_data['area'])) # Estimate if not present
    lq_h = lq_data.get('height', np.sqrt(lq_data['area']))
    lq_corners = np.array([
        [lq_center[0] - lq_w/2, lq_center[1] - lq_h/2],
        [lq_center[0] + lq_w/2, lq_center[1] - lq_h/2],
        [lq_center[0] + lq_w/2, lq_center[1] + lq_h/2],
        [lq_center[0] - lq_w/2, lq_center[1] + lq_h/2],
    ])
    
    cone_corners = get_passing_cone_corners(carrier_pos, lq_corners)
    
    num_interceptors = 0
    if cone_corners is not None and len(cone_corners) == 2:
        def_positions = np.array([[p['x'], p['z']] for p in defenders])
        for def_pos in def_positions:
            if is_point_in_triangle(def_pos, carrier_pos, cone_corners[0], cone_corners[1]):
                num_interceptors += 1
    
    features['h_num_interceptors_in_cone'] = num_interceptors


# ====================================================================
# 4. FLASK WEB SERVER
# ====================================================================

app = Flask(__name__)
CORS(app)

@app.route('/extract_features', methods=['POST'])
def extract_features_endpoint():
    try:
        data = request.json
        all_numerical_features = calculate_all_numerical_features(
            data['player_data'], data['metadata'], data.get('lq_data')
        )
        
        # Convert numpy types to native Python types for JSON
        for key, value in all_numerical_features.items():
            if isinstance(value, np.generic):
                all_numerical_features[key] = value.item()

        return jsonify({"success": True, "features": all_numerical_features})
    except Exception as e:
        # Log the full error to the server console for debugging
        print("--- SERVER ERROR ---")
        traceback.print_exc()
        print("--- END SERVER ERROR ---")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5100)