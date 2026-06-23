import sys
import time
from pathlib import Path

print("Step 0: sys.path configuration")
sys.path.insert(0, str(Path(__file__).parent.parent))

print("Step 1: Importing packages")
t0 = time.time()
import cv2
import numpy as np
print(f"Imports done in {time.time() - t0:.2f}s")

print("Step 2: Importing local ML components")
t0 = time.time()
from ml.pipeline.detector import VehicleDetector
from ml.pipeline.ocr import PlateOCR
from ml.utils.visualizer import FrameVisualizer
print(f"Local imports done in {time.time() - t0:.2f}s")

print("Step 3: Initializing VehicleDetector...")
t0 = time.time()
detector = VehicleDetector(device="cpu")
print(f"VehicleDetector initialized in {time.time() - t0:.2f}s")

print("Step 4: Initializing PlateOCR...")
t0 = time.time()
ocr = PlateOCR()
print(f"PlateOCR initialized in {time.time() - t0:.2f}s")

print("Step 5: Initializing FrameVisualizer...")
t0 = time.time()
visualizer = FrameVisualizer()
print(f"FrameVisualizer initialized in {time.time() - t0:.2f}s")

print("All components initialized successfully!")
