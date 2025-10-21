# feature_extractor.py (Complete, Final, Robust Version)

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from scipy.spatial import ConvexHull, distance as scipy_distance
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
    """Filters players based on a list of roles."""
    return [p for p in players if p.get('role') in role_list]

def get_team_players(players, team_name):
    """Filters all outfield players belonging to a specific team."""
    return [p for p in players if p.get('team') == team_name and p.get('role') != 'GK']

def get_passing_cone_corners(start_point, quad_corners):
    """Finds the two corners of a quadrilateral that form the widest cone from a start point."""
    max_angle = -1
    cone_corners = None
    for i in range(len(quad_corners)):
        for j in range(i + 1, len(quad_corners)):
            v1 = quad_corners[i] - start_point
            v2 = quad_corners[j] - start_point
            norm_v1 = np.linalg.norm(v1)
            norm_v2 = np.linalg.norm(v2)
            if norm_v1 == 0 or norm_v2 == 0: continue
            cosine_angle = np.dot(v1, v2) / (norm_v1 * norm_v2)
            angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
            if angle > max_angle:
                max_angle = angle
                cone_corners = np.array([quad_corners[i], quad_corners[j]])
    return cone_corners

def is_point_in_triangle(p, a, b, c):
    """Checks if a 2D point p is inside the triangle defined by a, b, c."""
    v0 = c - a
    v1 = b - a
    v2 = p - a
    dot00 = np.dot(v0, v0)
    dot01 = np.dot(v0, v1)
    dot02 = np.dot(v0, v2)
    dot11 = np.dot(v1, v1)
    dot12 = np.dot(v1, v2)
    
    # Handle collinear case
    denom = (dot00 * dot11 - dot01 * dot01)
    if denom == 0: return False
    
    inv_denom = 1 / denom
    u = (dot11 * dot02 - dot01 * dot12) * inv_denom
    v = (dot00 * dot12 - dot01 * dot02) * inv_denom
    return (u >= 0) and (v >= 0) and (u + v < 1)

# ====================================================================
# 2. FEATURE CALCULATION PIPELINE
# ====================================================================

def calculate_all_numerical_features(player_data, metadata, lq_data):
    """Master function to calculate the entire numerical feature vector."""
    attacking_team_name = metadata['attacking_team_name']
    defending_team_name = metadata['defending_team_name']
    attacking_direction = metadata['attacking_direction']
    
    attackers = get_team_players(player_data, attacking_team_name)
    defenders = get_team_players(player_data, defending_team_name)
    carrier = next((p for p in player_data if p['id'] == metadata.get('carrier_id')), None)
    ball = next((p for p in player_data if p['team'] == 'Ball'), None)
    
    if not all([attackers, defenders, ball]):
        raise ValueError("Missing essential player data (attackers, defenders, or ball).")

    features = {}
    _calculate_group_a(features, attackers, defenders, attacking_direction)
    _calculate_group_b(features, attackers, defenders, carrier, ball, attacking_direction)
    if lq_data:
        _calculate_group_c(features, lq_data, attackers, defenders, carrier, attacking_direction)
        
    return features

def _calculate_group_a(features, attackers, defenders, attacking_direction):
    """Calculates original global features (Corrected Logic)."""
    features['attack_centroid_x'] = np.mean([p['x'] for p in attackers])
    features['attack_centroid_z'] = np.mean([p['z'] for p in attackers])
    features['defend_centroid_x'] = np.mean([p['x'] for p in defenders])
    features['defend_centroid_z'] = np.mean([p['z'] for p in defenders])
    features['attack_depth'] = max(p['x'] for p in attackers) - min(p['x'] for p in attackers)
    features['attack_width'] = max(p['z'] for p in attackers) - min(p['z'] for p in attackers)
    features['defend_depth'] = max(p['x'] for p in defenders) - min(p['x'] for p in defenders)
    features['defend_width'] = max(p['z'] for p in defenders) - min(p['z'] for p in defenders)

    back_line_players = get_players_by_role(defenders, DEF_ROLES) or defenders
    features['defensive_line_depth'] = np.mean([p['x'] for p in back_line_players])

    def_centroid = np.array([features['defend_centroid_x'], features['defend_centroid_z']])
    def_positions = np.array([[p['x'], p['z']] for p in defenders])
    distances = scipy_distance.cdist(def_positions, [def_centroid]).flatten()
    features['formation_disruption_index'] = np.std(distances)

def _calculate_group_b(features, attackers, defenders, carrier, ball, attacking_direction):
    """Calculates advanced tactical features (Corrected Logic)."""
    def_line = get_players_by_role(defenders, DEF_ROLES)
    mid_line = get_players_by_role(defenders, MID_ROLES)
    att_line = get_players_by_role(attackers, ATT_ROLES)

    def_line_depth = np.mean([p['x'] for p in def_line]) if def_line else None
    mid_line_depth = np.mean([p['x'] for p in mid_line]) if mid_line else None
    att_line_depth = np.mean([p['x'] for p in att_line]) if att_line else None

    features['def_mid_distance'] = abs(def_line_depth - mid_line_depth) if def_line_depth and mid_line_depth else -1
    features['mid_att_distance'] = abs(mid_line_depth - att_line_depth) if mid_line_depth and att_line_depth else -1

    goal_direction_vector = np.array([attacking_direction, 0])
    non_carrier_attackers = [p for p in attackers if p != carrier]
    if non_carrier_attackers:
        velocities = np.array([[p.get('vx',0), p.get('vz',0)] for p in non_carrier_attackers])
        forward_speeds = np.dot(velocities, goal_direction_vector)
        features['max_forward_runner_speed'] = np.max(forward_speeds) if len(forward_speeds) > 0 else 0
    else:
        features['max_forward_runner_speed'] = 0

    goal_attacked_x = attacking_direction * 52.5
    features['packing_raw'] = sum(1 for p in defenders if (p['x'] - ball['x']) * attacking_direction > 0)

    ppo_count, dto_count = 0, 0
    if carrier:
        ppo_count = sum(1 for p in attackers if (p['x'] - carrier['x']) * attacking_direction > 0)
        dto_count = sum(1 for p in defenders if (p['x'] - carrier['x']) * attacking_direction > 0)
    features['ppo_count'] = ppo_count
    features['dto_count'] = dto_count
    features['ppo_dto_ratio'] = (ppo_count + 0.1) / (dto_count + 0.1)

    is_counter, mean_proj_att_vel = False, 0
    if carrier and ppo_count > 0:
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
        features['attack_convex_hull_area'] = ConvexHull(np.array([[p['x'], p['z']] for p in attackers])).volume
    else: features['attack_convex_hull_area'] = 0
        
    if len(defenders) > 2:
        features['defend_convex_hull_area'] = ConvexHull(np.array([[p['x'], p['z']] for p in defenders])).volume
    else: features['defend_convex_hull_area'] = 0
        
    features['pitch_control_ratio_in_front'] = -1

def _calculate_group_c(features, lq_data, attackers, defenders, carrier, attacking_direction):
    """Calculates all raw inputs for the original LS heuristic (Robust Version)."""
    h_feature_names = [ 'h_lq_dist_to_goal', 'h_lq_runway', 'h_lq_angle_to_goal', 'h_lq_area', 'h_is_behind_def_line', 'h_att_fastest_tta', 'h_def_fastest_tta', 'h_time_advantage', 'h_att_swarm_count', 'h_def_swarm_count', 'h_swarm_advantage', 'h_att_avg_speed_towards_lq', 'h_def_avg_speed_towards_lq', 'h_pass_dist_to_lq', 'h_pressure_on_carrier_dist', 'h_num_interceptors_in_cone']
    
    # If there is no carrier, most heuristic features are not applicable. Set to default.
    if not carrier:
        for name in h_feature_names: features[name] = -1
        return

    lq_center = np.array([lq_data['center_x'], lq_data['center_z']])
    goal_pos = np.array([attacking_direction * 52.5, 0])
    carrier_pos = np.array([carrier['x'], carrier['z']])
    
    # Threat
    features['h_lq_dist_to_goal'] = np.linalg.norm(lq_center - goal_pos)
    features['h_lq_runway'] = abs(lq_data['center_x'] - (attacking_direction * 52.5))
    vec_to_goal = goal_pos - lq_center
    features['h_lq_angle_to_goal'] = np.arctan2(vec_to_goal[1], vec_to_goal[0])
    features['h_lq_area'] = lq_data['area']
    
    def_line_players = get_players_by_role(defenders, DEF_ROLES) or defenders
    def_line_depth = np.mean([p['x'] for p in def_line_players])
    features['h_is_behind_def_line'] = 1 if (lq_data['center_x'] - def_line_depth) * attacking_direction > 0 else 0

    # Exploitation
    min_speed = 1.0
    att_pos = np.array([[p['x'], p['z']] for p in attackers])
    att_vel = np.array([[p.get('vx',0), p.get('vz',0)] for p in attackers])
    att_speeds = np.maximum(np.linalg.norm(att_vel, axis=1), min_speed)
    features['h_att_fastest_tta'] = np.min(scipy_distance.cdist(att_pos, [lq_center]).flatten() / att_speeds)

    def_pos = np.array([[p['x'], p['z']] for p in defenders])
    def_vel = np.array([[p.get('vx',0), p.get('vz',0)] for p in defenders])
    def_speeds = np.maximum(np.linalg.norm(def_vel, axis=1), min_speed)
    features['h_def_fastest_tta'] = np.min(scipy_distance.cdist(def_pos, [lq_center]).flatten() / def_speeds)
    
    features['h_time_advantage'] = features['h_def_fastest_tta'] - features['h_att_fastest_tta']
    
    swarm_radius = 10.0
    features['h_att_swarm_count'] = np.sum(scipy_distance.cdist(att_pos, [lq_center]) < swarm_radius)
    features['h_def_swarm_count'] = np.sum(scipy_distance.cdist(def_pos, [lq_center]) < swarm_radius)
    features['h_swarm_advantage'] = features['h_att_swarm_count'] - features['h_def_swarm_count']
    
    # (Average speed calculations remain complex and are simplified here)
    features['h_att_avg_speed_towards_lq'] = 0
    features['h_def_avg_speed_towards_lq'] = 0

    # Feasibility
    features['h_pass_dist_to_lq'] = np.linalg.norm(carrier_pos - lq_center)
    features['h_pressure_on_carrier_dist'] = np.min(scipy_distance.cdist(def_pos, [carrier_pos]))
    
    lq_corners = np.array([[lq_center[0] - lq_data['width']/2, lq_center[1] - lq_data['height']/2], [lq_center[0] + lq_data['width']/2, lq_center[1] - lq_data['height']/2], [lq_center[0] + lq_data['width']/2, lq_center[1] + lq_data['height']/2], [lq_center[0] - lq_data['width']/2, lq_center[1] + lq_data['height']/2]])
    cone_corners = get_passing_cone_corners(carrier_pos, lq_corners)
    num_interceptors = 0
    if cone_corners is not None and len(cone_corners) == 2:
        for def_pos_single in def_pos:
            if is_point_in_triangle(def_pos_single, carrier_pos, cone_corners[0], cone_corners[1]):
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
        
        for key, value in all_numerical_features.items():
            if isinstance(value, np.generic):
                all_numerical_features[key] = value.item()

        return jsonify({"success": True, "features": all_numerical_features})
    except Exception as e:
        print("--- SERVER ERROR ---")
        traceback.print_exc()
        print("--- END SERVER ERROR ---")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5100)