---
license: mit
tags:
  - yolov12
  - object-detection
  - road-damage
  - pytorch
  - ultralytics
datasets:
  - RDD2022
metrics:
  - mAP
library_name: ultralytics
pipeline_tag: object-detection
---

# YOLOv12s Road Damage Detection (RDD2022)

A YOLOv12-small model fine-tuned on the Road Damage Dataset 2022 (RDD2022) for detecting road surface damage.

## Model Details

- **Architecture**: YOLOv12-small (with A2C2f attention modules)
- **Input Size**: 640x640
- **Classes**: 5 (D00, D10, D20, D40, Repair)
- **Framework**: Ultralytics (YOLOv12 fork)

## Classes

| Class | Description |
|-------|-------------|
| D00 | Longitudinal Crack |
| D10 | Transverse Crack |
| D20 | Alligator Crack |
| D40 | Pothole |
| Repair | Repaired Area |

## Usage

```python
# Install YOLOv12 ultralytics fork
# pip install git+https://github.com/sunsmarterjie/yolov12.git

from ultralytics import YOLO

# Load model
model = YOLO("rezzzq/yolo12s-road-damage-rdd2022")
# or download and load locally:
# model = YOLO("yolo12s_RDD2022_best.pt")

# Run inference
results = model("path/to/road_image.jpg")

# Process results
for result in results:
    boxes = result.boxes
    for box in boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])
        print(f"Class: {model.names[cls]}, Confidence: {conf:.2%}")
```

## Training Details

- **Base Model**: YOLOv12s pretrained
- **Dataset**: RDD2022 (Road Damage Dataset)
- **Image Size**: 640x640
- **Batch Size**: 32

## Citation

If you use this model, please cite the RDD2022 dataset:
```
@article{arya2022rdd2022,
  title={RDD2022: A multi-national image dataset for automatic Road Damage Detection},
  author={Arya, Deeksha and others},
  year={2022}
}
```
