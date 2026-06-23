import cv2
import time

input_video = "test/videos/License Plate Detection Test - Dev Drone Bhowmik (720p, h264).mp4"
print("Attempting to open video using cv2.VideoCapture...")
t0 = time.time()
cap = cv2.VideoCapture(input_video)
print(f"VideoCapture object created in {time.time() - t0:.2f}s")

if not cap.isOpened():
    print("Error: Cannot open video file!")
else:
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    print(f"Video opened successfully! Dimensions: {width}x{height}, FPS: {fps}, Total Frames: {total_frames}")

cap.release()
print("Released video capture.")
