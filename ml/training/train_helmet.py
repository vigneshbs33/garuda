"""
GARUDA — HelmetCNN Training Script
=====================================
Trains ml/models/helmet_cnn.py::HelmetCNN on the dataset produced by
prepare_helmet_data.py. Produces:
  - models/weights/helmet_cnn.pt          (state_dict, best val accuracy)
  - models/weights/helmet_metrics.json    (accuracy, precision, recall, F1, confusion matrix)
  - models/weights/helmet_training_curve.png
  - models/weights/helmet_confusion_matrix.png

Usage:
    python -m ml.training.train_helmet --data datasets/helmet --epochs 25 --device cpu
    python -m ml.training.train_helmet --data datasets/helmet --epochs 25 --device cuda:0
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from ml.models.helmet_cnn import HelmetCNN  # noqa: E402

logger = logging.getLogger(__name__)

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]


def build_loaders(data_dir: str, batch_size: int, input_size: int = 64):
    train_tf = transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.3),
        transforms.RandomRotation(10),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((input_size, input_size)),
        transforms.ToTensor(),
        transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
    ])

    root = Path(data_dir)
    train_ds = datasets.ImageFolder(root / "train", transform=train_tf)
    val_ds = datasets.ImageFolder(root / "val", transform=eval_tf)
    test_ds = datasets.ImageFolder(root / "test", transform=eval_tf) if (root / "test").exists() else None

    logger.info("Classes (alphabetical → index): %s", train_ds.class_to_idx)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)
    test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False, num_workers=0) if test_ds else None
    return train_loader, val_loader, test_loader, train_ds.class_to_idx


@torch.no_grad()
def evaluate(model, loader, device) -> dict:
    model.eval()
    all_preds, all_labels = [], []
    for x, y in loader:
        x = x.to(device)
        logits = model(x)
        preds = logits.argmax(dim=1).cpu().numpy()
        all_preds.extend(preds.tolist())
        all_labels.extend(y.numpy().tolist())

    all_preds = np.array(all_preds)
    all_labels = np.array(all_labels)

    tp = int(np.sum((all_preds == 1) & (all_labels == 1)))
    tn = int(np.sum((all_preds == 0) & (all_labels == 0)))
    fp = int(np.sum((all_preds == 1) & (all_labels == 0)))
    fn = int(np.sum((all_preds == 0) & (all_labels == 1)))

    accuracy = (tp + tn) / max(1, len(all_labels))
    precision = tp / max(1, tp + fp)
    recall = tp / max(1, tp + fn)
    f1 = 2 * precision * recall / max(1e-9, precision + recall)

    return {
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "confusion_matrix": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
        "n_samples": int(len(all_labels)),
    }


def train(args) -> None:
    device = torch.device(args.device if torch.cuda.is_available() or "cpu" in args.device else "cpu")
    logger.info("Training on device: %s", device)

    train_loader, val_loader, test_loader, class_to_idx = build_loaders(args.data, args.batch_size)

    model = HelmetCNN(dropout=0.3, pretrained_mobilenet=True).to(device)
    logger.info("Model: %s", model)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss()

    history = {"train_loss": [], "val_accuracy": [], "val_f1": []}
    best_f1 = -1.0
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        model.train()
        running_loss = 0.0
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * x.size(0)

        scheduler.step()
        train_loss = running_loss / max(1, len(train_loader.dataset))
        val_metrics = evaluate(model, val_loader, device)

        history["train_loss"].append(round(train_loss, 4))
        history["val_accuracy"].append(val_metrics["accuracy"])
        history["val_f1"].append(val_metrics["f1"])

        logger.info(
            "Epoch %2d/%d | train_loss=%.4f | val_acc=%.4f | val_f1=%.4f",
            epoch, args.epochs, train_loss, val_metrics["accuracy"], val_metrics["f1"],
        )

        if val_metrics["f1"] > best_f1:
            best_f1 = val_metrics["f1"]
            torch.save(model.state_dict(), out_dir / "helmet_cnn.pt")
            logger.info("  ↳ New best (val_f1=%.4f) — saved to %s", best_f1, out_dir / "helmet_cnn.pt")

    # Final evaluation on test split using the best checkpoint
    model.load_state_dict(torch.load(out_dir / "helmet_cnn.pt", map_location=device))
    final_metrics = evaluate(model, test_loader or val_loader, device)
    final_metrics["class_to_idx"] = class_to_idx
    final_metrics["history"] = history
    final_metrics["params"] = model.count_params()

    with open(out_dir / "helmet_metrics.json", "w") as f:
        json.dump(final_metrics, f, indent=2)

    logger.info("=" * 60)
    logger.info("FINAL TEST METRICS: %s", {k: v for k, v in final_metrics.items() if k not in ("history", "class_to_idx")})
    logger.info("Saved: %s", out_dir / "helmet_metrics.json")
    logger.info("=" * 60)

    _save_plots(history, final_metrics, out_dir)


def _save_plots(history: dict, final_metrics: dict, out_dir: Path) -> None:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.warning("matplotlib not installed — skipping plots")
        return

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
    axes[0].plot(history["train_loss"], label="train_loss")
    axes[0].plot(history["val_accuracy"], label="val_accuracy")
    axes[0].plot(history["val_f1"], label="val_f1")
    axes[0].set_xlabel("Epoch")
    axes[0].legend()
    axes[0].set_title("Training Curves")

    cm = final_metrics["confusion_matrix"]
    matrix = np.array([[cm["tn"], cm["fp"]], [cm["fn"], cm["tp"]]])
    axes[1].imshow(matrix, cmap="Blues")
    axes[1].set_xticks([0, 1], ["no_helmet", "helmet"])
    axes[1].set_yticks([0, 1], ["no_helmet", "helmet"])
    axes[1].set_xlabel("Predicted")
    axes[1].set_ylabel("Actual")
    axes[1].set_title(f"Confusion Matrix (acc={final_metrics['accuracy']:.3f})")
    for i in range(2):
        for j in range(2):
            axes[1].text(j, i, str(matrix[i, j]), ha="center", va="center")

    fig.tight_layout()
    fig.savefig(out_dir / "helmet_training_report.png", dpi=130)
    logger.info("Saved plot: %s", out_dir / "helmet_training_report.png")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    parser = argparse.ArgumentParser(description="Train GARUDA HelmetCNN")
    parser.add_argument("--data", default="datasets/helmet")
    parser.add_argument("--out", default="models/weights")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    train(args)


if __name__ == "__main__":
    main()
