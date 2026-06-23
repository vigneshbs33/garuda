import sys
import time
from pathlib import Path

print("Importing YOLO...")
t0 = time.time()
from ultralytics import YOLO
print(f"YOLO imported in {time.time() - t0:.2f}s")

print("Loading yolov8n.pt...")
t0 = time.time()
try:
    model_n = YOLO("yolov8n.pt")
    print(f"yolov8n.pt loaded in {time.time() - t0:.2f}s")
except Exception as e:
    print(f"Error loading yolov8n.pt: {e}")

print("Loading yolov8m.pt...")
t0 = time.time()
try:
    model_m = YOLO("yolov8m.pt")
    print(f"yolov8m.pt loaded in {time.time() - t0:.2f}s")
except Exception as e:
    print(f"Error loading yolov8m.pt: {e}")

print("Done!")
