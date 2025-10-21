# eda_script.py (Version 2)

import pandas as pd
import json
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np

def load_mlds_v2_data_to_df(jsonl_path):
    """Loads the new universal data packet format into a pandas DataFrame."""
    records = []
    with open(jsonl_path, 'r') as f:
        for line in f:
            data = json.loads(line)
            
            # Start with metadata
            record = data['metadata'].copy()
            
            # Add ground truth labels
            record.update(data['ground_truth_labels'])
            
            # Flatten the numerical features
            if 'numerical_features' in data['input_features']:
                record.update(data['input_features']['numerical_features'])
                
            records.append(record)
            
    return pd.DataFrame(records)

if __name__ == '__main__':
    DATA_FILE = 'mlds_test_2.jsonl' # <-- CHANGE THIS TO YOUR NEW FILE NAME
    
    try:
        df = load_mlds_v2_data_to_df(DATA_FILE)
    except FileNotFoundError:
        print(f"Error: Make sure '{DATA_FILE}' is correctly named.")
        exit()

    sns.set_theme(style="whitegrid")

    # --- 1. Analyze the New Label Distribution ---
    print("--- Analyzing Label Distribution ---")
    print(df['label_type'].value_counts())
    
    plt.figure(figsize=(10, 6))
    sns.countplot(data=df, x='label_type', order=['LQ_CC', 'LQ_noCC', 'LQ_no_pass', 'negative'])
    plt.title('Distribution of Collected Label Types')
    plt.xlabel('Label Type')
    plt.ylabel('Count')
    plt.show()

    # --- 2. Analyze a Key New Feature: Packing ---
    plt.figure(figsize=(12, 7))
    sns.boxplot(data=df, x='label_type', y='packing_raw')
    plt.title('Packing Score Distribution by Label Type')
    plt.xlabel('Label Type')
    plt.ylabel('Packing (Defenders Bypassed)')
    plt.show()

    # --- 3. Validate a Hypothesis for the LS Predictor ---
    # We expect 'chance_created' (1 or 0) to correlate with our features.
    # Let's compare the 'def_mid_distance' for chances vs. non-chances.
    chance_df = df[df['chance_created'].notna()].copy()
    chance_df['chance_created'] = chance_df['chance_created'].astype(int)

    plt.figure(figsize=(12, 7))
    sns.kdeplot(data=chance_df, x='def_mid_distance', hue='chance_created', fill=True, common_norm=False)
    plt.title('Density of "Defense-Midfield Distance" for Chances vs. Non-Chances')
    plt.xlabel('Distance Between Defensive and Midfield Lines')
    plt.legend(title='Chance Created', labels=['Yes (1)', 'No (0)'])
    plt.show()
    
    # --- 4. Analyze Feature Correlation for the LS Predictor ---
    corr_df = chance_df.select_dtypes(include=np.number)
    # Don't show correlations for every single feature, just the top ones with the target
    ls_correlations = corr_df.corr()['chance_created'].sort_values(ascending=False).dropna()
    print("\n--- Top Feature Correlations with 'chance_created' ---")
    print(ls_correlations.head(10))
    print("\n--- Bottom Feature Correlations with 'chance_created' ---")
    print(ls_correlations.tail(10))