# 🚀 GARUDA Deployment Guide
### Complete Setup and Deployment Instructions for Frontend, Backend, and ML Edge Nodes

This guide outlines the step-by-step instructions for deploying the **GARUDA** platform. It covers local development setup, containerized Docker deployment, and edge deployment on a **Raspberry Pi 5 + Coral TPU**.

---

## 📋 Table of Contents
1. [Method 1: Docker Compose Deployment (Recommended)](#1-docker-compose-deployment-recommended)
2. [Method 2: Local Development Setup (Manual)](#2-local-development-setup-manual)
3. [Method 3: Edge-Node Deployment (Raspberry Pi 5 + Coral TPU)](#3-edge-node-deployment-raspberry-pi-5--coral-tpu)
4. [ML Pipeline Execution (Ingesting Violations)](#ml-pipeline-execution-ingesting-violations)
5. [Environment Configurations (.env)](#environment-configurations-env)

---

## 1. Docker Compose Deployment (Recommended)

This compiles and runs both the **Next.js Frontend** (Port `3000`) and the **FastAPI Backend** (Port `8000`) inside Docker containers. Detections and database records are persistent.

### Prerequisites
*   Docker & Docker Compose installed on your host system.

### Steps
1.  **Clone / Navigate to Repository:**
    ```bash
    cd /Users/keshav/garuda/GARUDA
    ```
2.  **Set up Environment File:**
    Copy `.env.example` to `.env` (refer to [Section 5](#5-environment-configurations-env) to customize parameters):
    ```bash
    cp .env.example .env
    ```
3.  **Launch Container Ecosystem:**
    Build and start both containers in detached mode:
    ```bash
    docker-compose up -d --build
    ```
4.  **Monitor Logs:**
    Track server execution and connection statuses:
    ```bash
    docker-compose logs -f
    ```
5.  **Access the Applications:**
    *   **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
    *   **Backend API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)

---

## 2. Local Development Setup (Manual)

If you wish to run the servers directly on your host machine for development or inspection without Docker.

### Part A: FastAPI Backend
1.  **Create and Activate Python Virtual Environment:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On macOS/Linux
    # venv\Scripts\activate   # On Windows
    ```
2.  **Install Python Dependencies:**
    ```bash
    pip install -r requirements.txt
    ```
3.  **Run Server via Uvicorn:**
    ```bash
    uvicorn backend.main:app --reload --port 8000
    ```

### Part B: Next.js Frontend
1.  **Install Node Modules:**
    Make sure Node.js (v18 or v20) is installed.
    ```bash
    npm install
    ```
2.  **Start Development Server:**
    ```bash
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 3. Edge-Node Deployment (Raspberry Pi 5 + Coral TPU)

Edge deployment shifts the computational load of ML inference directly to the camera node. Detections are pushed to the central backend.

```
+--------------------+        (HTTP / WS)       +--------------------+
|  Raspberry Pi 5    | -----------------------> |  Central Server    |
|  + Coral USB TPU   |                          |  (FastAPI + DB +   |
| (Runs ML Pipeline) |                          |  Next.js Console)  |
+--------------------+                          +--------------------+
```

### Prerequisites
*   **Hardware:** Raspberry Pi 5 (running Raspberry Pi OS 64-bit) + Google Coral USB Accelerator (TPU).
*   **Edge TPU Runtime:** Install Google Coral runtime drivers on the Pi:
    ```bash
    # Add Debian package keys and repository
    echo "deb https://packages.cloud.google.com/apt coral-edgetpu-stable main" | sudo tee /etc/apt/sources.list.d/coral-edgetpu.list
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
    sudo apt-get update
    
    # Install Edge TPU runtime library
    sudo apt-get install libedgetpu1-std
    ```

### Steps to Run ML Pipeline on the Pi
1.  **Clone Repository and Install Requirements:**
    Follow the Python local setup to initialize `venv` and install `requirements.txt`.
2.  **Export PyTorch Weights to Quantized TFLite (INT8):**
    For Google Coral TPU execution, the YOLO weights must be compiled into INT8 format:
    ```python
    from ultralytics import YOLO
    
    # Export YOLOv8 / YOLO11 model to TFLite with Edge TPU INT8 quantization
    model = YOLO("yolo11n.pt")
    model.export(format="tflite", int8=True)  # Creates yolo11n_saved_model/yolo11n_int8.tflite
    ```
3.  **Launch the Pipeline:**
    Execute the demo pipeline, pointing the `--backend-url` to your central server IP address:
    ```bash
    python ml/demo_pipeline.py --input video.mp4 --video --backend-url http://<CENTRAL_SERVER_IP>:8000
    ```

---

## 4. ML Pipeline Execution (Ingesting Violations)

Whether running on your local machine, a workstation, or a Pi, you can trigger the ML pipeline to process data and automatically ingest violations into the backend:

*   **Process static image and upload results:**
    ```bash
    python ml/demo_pipeline.py --input sample.jpg --backend-url http://localhost:8000 --verbose
    ```
*   **Process driver-state (drowsiness / phone use) on a video stream:**
    ```bash
    python ml/demo_pipeline.py --input driver_feed.mp4 --driver-state --backend-url http://localhost:8000
    ```
*   **Capture live video from local webcam:**
    ```bash
    python ml/demo_pipeline.py --webcam --backend-url http://localhost:8000
    ```

---

## 5. Environment Configurations (.env)

Configure your `.env` settings before launching. Important values are:

```env
# Server Mode
DEBUG=true
PORT=8000

# Database Settings
# Use SQLite locally, or PostgreSQL in production:
DATABASE_URL=sqlite+aiosqlite:///garuda.db
# DATABASE_URL=postgresql+asyncpg://user:pass@host:5420/db

# Alert Services Configuration (Twilio SMS/WhatsApp)
ALERTS_ENABLED=false # Set to true to enable real notifications
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_FROM_NUMBER=your_twilio_phone_number
TWILIO_WHATSAPP_FROM=+14155238886 # Twilio WhatsApp sandbox number
OFFICER_PHONES=+919876543210,+919988776655
```
