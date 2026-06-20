"""
GARUDA — Pascal VOC Annotation Utilities
==========================================
Shared parser for Kaggle/Roboflow datasets exported in Pascal VOC XML format
(the format used by andrewmvd/helmet-detection and andrewmvd/car-plate-detection).

VOC layout expected:
    <dataset_root>/
        images/        *.png or *.jpg
        annotations/   *.xml  (one per image, same stem)
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class VocObject:
    name: str
    xmin: int
    ymin: int
    xmax: int
    ymax: int


@dataclass
class VocAnnotation:
    image_path: Path
    width: int
    height: int
    objects: List[VocObject]


def parse_voc_xml(xml_path: Path, images_dir: Path) -> Optional[VocAnnotation]:
    """Parse one Pascal VOC XML file. Returns None if the image file is missing."""
    tree = ET.parse(xml_path)
    root = tree.getroot()

    filename = root.findtext("filename")
    image_path = images_dir / filename if filename else None
    if image_path is None or not image_path.exists():
        # Fall back to same stem as the XML (some exports mismatch filename casing)
        for ext in (".png", ".jpg", ".jpeg"):
            candidate = images_dir / f"{xml_path.stem}{ext}"
            if candidate.exists():
                image_path = candidate
                break
    if image_path is None or not image_path.exists():
        return None

    size = root.find("size")
    width = int(size.findtext("width")) if size is not None else 0
    height = int(size.findtext("height")) if size is not None else 0

    objects: List[VocObject] = []
    for obj in root.findall("object"):
        name = obj.findtext("name", "").strip()
        bnd = obj.find("bndbox")
        if bnd is None:
            continue
        xmin = int(float(bnd.findtext("xmin")))
        ymin = int(float(bnd.findtext("ymin")))
        xmax = int(float(bnd.findtext("xmax")))
        ymax = int(float(bnd.findtext("ymax")))
        objects.append(VocObject(name, xmin, ymin, xmax, ymax))

    return VocAnnotation(image_path=image_path, width=width, height=height, objects=objects)


def load_voc_dataset(root_dir: str) -> List[VocAnnotation]:
    """
    Load every annotation under <root_dir>/annotations matched against
    <root_dir>/images. Handles both 'annotations'/'images' and flat layouts.
    """
    root = Path(root_dir)
    images_dir = root / "images"
    ann_dir = root / "annotations"
    if not ann_dir.exists():
        # Some Kaggle exports use singular folder names
        ann_dir = root / "annotation"
    if not images_dir.exists():
        images_dir = root

    annotations: List[VocAnnotation] = []
    for xml_path in sorted(ann_dir.glob("*.xml")):
        parsed = parse_voc_xml(xml_path, images_dir)
        if parsed is not None and parsed.objects:
            annotations.append(parsed)
    return annotations


def class_histogram(annotations: List[VocAnnotation]) -> dict:
    hist: dict = {}
    for ann in annotations:
        for obj in ann.objects:
            hist[obj.name] = hist.get(obj.name, 0) + 1
    return hist
