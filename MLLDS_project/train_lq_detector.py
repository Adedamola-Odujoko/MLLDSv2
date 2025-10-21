# train_lq_detector.py

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm

from mlds_dataset import LQ_Detector_Dataset 

# ====================================================================
# 1. LOSS FUNCTION
# ====================================================================

def dice_loss(pred, target, smooth=1.):
    pred = pred.contiguous()
    target = target.contiguous()    
    intersection = (pred * target).sum(dim=2).sum(dim=2)
    loss = (1 - ((2. * intersection + smooth) / (pred.sum(dim=2).sum(dim=2) + target.sum(dim=2).sum(dim=2) + smooth)))
    return loss.mean()

# ====================================================================
# 2. MODEL: U-Net with Global Feature Fusion (Single Head)
# ====================================================================

class DoubleConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )
    def forward(self, x): return self.double_conv(x)

class LQ_Detector_UNet_Fused(nn.Module):
    def __init__(self, n_channels=11, n_global_features=11):
        super().__init__()
        
        self.inc = DoubleConv(n_channels, 64)
        self.down1 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(64, 128))
        self.down2 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(128, 256))
        self.down3 = nn.Sequential(nn.MaxPool2d(2), DoubleConv(256, 512))

        self.flatten = nn.Flatten()
        # Input: 80x128 -> d1:40x64 -> d2:20x32 -> d3:10x16. Flattened size = 512*10*16 = 81920
        self.fusion_layer = nn.Sequential(
            nn.Linear(512 * 10 * 16 + n_global_features, 2048),
            nn.ReLU(),
            nn.Linear(2048, 512 * 10 * 16),
            nn.ReLU()
        )

        self.up1 = nn.ConvTranspose2d(512, 256, kernel_size=2, stride=2)
        self.conv1 = DoubleConv(512, 256)
        self.up2 = nn.ConvTranspose2d(256, 128, kernel_size=2, stride=2)
        self.conv2 = DoubleConv(256, 128)
        self.up3 = nn.ConvTranspose2d(128, 64, kernel_size=2, stride=2)
        self.conv3 = DoubleConv(128, 64)
        
        self.outc = nn.Sequential(
            nn.Conv2d(64, 1, kernel_size=1),
            nn.Sigmoid()
        )

    def forward(self, raster_input, global_features):
        x1 = self.inc(raster_input)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)

        flattened_img = self.flatten(x4)
        combined_features = torch.cat([flattened_img, global_features], dim=1)
        fused = self.fusion_layer(combined_features)
        bottleneck = fused.view(-1, 512, 10, 16)
        
        x = self.up1(bottleneck)
        x = torch.cat([x, x3], dim=1)
        x = self.conv1(x)
        
        x = self.up2(x)
        x = torch.cat([x, x2], dim=1)
        x = self.conv2(x)
        
        x = self.up3(x)
        x = torch.cat([x, x1], dim=1)
        x = self.conv3(x)
        
        heatmap = self.outc(x)
        return heatmap

# ====================================================================
# 3. TRAINING SCRIPT
# ====================================================================
if __name__ == '__main__':
    CONFIG = {
        "DATA_FILE": "mlds_data_v2_augmented.jsonl",
        "PITCH_CONTROL_DIR": "data/pitch_control",
        "LEARNING_RATE": 1e-4,
        "BATCH_SIZE": 16,
        "EPOCHS": 50,
        "VAL_SPLIT_RATIO": 0.15,
        "NUM_RASTER_CHANNELS": 11,
        "NUM_GLOBAL_FEATURES": 11
    }

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"Using device: {device}")
    
    full_dataset = LQ_Detector_Dataset(jsonl_path=CONFIG["DATA_FILE"], pitch_control_dir=CONFIG["PITCH_CONTROL_DIR"])
    
    train_size = int((1 - CONFIG["VAL_SPLIT_RATIO"]) * len(full_dataset))
    val_size = len(full_dataset) - train_size
    train_dataset, val_dataset = random_split(full_dataset, [train_size, val_size])

    print(f"Total samples: {len(full_dataset)}")
    print(f"Training on {len(train_dataset)} samples, validating on {len(val_dataset)} samples.")

    train_loader = DataLoader(train_dataset, batch_size=CONFIG["BATCH_SIZE"], shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_dataset, batch_size=CONFIG["BATCH_SIZE"], shuffle=False, num_workers=4, pin_memory=True)

    model = LQ_Detector_UNet_Fused(
        n_channels=CONFIG["NUM_RASTER_CHANNELS"],
        n_global_features=CONFIG["NUM_GLOBAL_FEATURES"]
    ).to(device)
    
    optimizer = optim.Adam(model.parameters(), lr=CONFIG["LEARNING_RATE"])
    best_val_loss = float('inf')

    for epoch in range(CONFIG["EPOCHS"]):
        model.train()
        running_train_loss = 0.0
        for batch in tqdm(train_loader, desc=f"Epoch {epoch+1}/{CONFIG['EPOCHS']} [Train]"):
            raster = batch['raster_input'].to(device)
            globals = batch['global_features'].to(device)
            true_heatmap = batch['target_heatmap'].to(device)
            
            pred_heatmap = model(raster, globals)
            loss = dice_loss(pred_heatmap, true_heatmap)
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            running_train_loss += loss.item()
        avg_train_loss = running_train_loss / len(train_loader)

        model.eval()
        running_val_loss = 0.0
        with torch.no_grad():
            for batch in tqdm(val_loader, desc=f"Epoch {epoch+1}/{CONFIG['EPOCHS']} [Val]"):
                raster = batch['raster_input'].to(device)
                globals = batch['global_features'].to(device)
                true_heatmap = batch['target_heatmap'].to(device)
                
                pred_heatmap = model(raster, globals)
                loss = dice_loss(pred_heatmap, true_heatmap)
                running_val_loss += loss.item()
        avg_val_loss = running_val_loss / len(val_loader)

        print(f"Epoch {epoch+1}/{CONFIG['EPOCHS']} - Train Loss: {avg_train_loss:.4f}, Val Loss: {avg_val_loss:.4f}")

        if avg_val_loss < best_val_loss:
            best_val_loss = avg_val_loss
            torch.save(model.state_dict(), 'lq_detector_v2_best_model.pth')
            print(f"  -> New best LQ Detector model saved with val loss: {best_val_loss:.4f}")

    print("\n--- Training Complete ---")
    print(f"Best LQ Detector model saved to 'lq_detector_v2_best_model.pth'")