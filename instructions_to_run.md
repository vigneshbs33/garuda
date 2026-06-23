# 🚀 GARUDA — Instructions to Run

Follow these step-by-step instructions to run the entire **GARUDA** platform (FastAPI Backend, Next.js Frontend Dashboard, and ML Ingestion Pipeline) locally on your system.

---

## 📋 System Prerequisites
Before starting, ensure your host machine has the following tools installed:
* **Python 3.10+** (Required by open-image-models license plate detector).
* **Node.js (v18 or v20+)** & **npm** (Required by the Next.js dashboard).
* **Git** (For version control and pulls).

---

## 🔧 Step 1: Initial Repository & Environment Setup

1. **Navigate to the Project Root:**
   ```bash
   cd /Users/keshav/garuda/GARUDA
   ```
2. **Create the Environment Config File:**
   Copy the example environment template to create your `.env` file:
   ```bash
   cp .env.example .env
   ```
   *(Note: The default `.env` is configured to use an async SQLite database `sqlite+aiosqlite:///./garuda.db`, which requires no external database setup or configuration).*

---

## 🐍 Step 2: Set Up and Start the FastAPI Backend

The backend server manages the REST endpoints, registers cameras, tracks repeat offenders, persists e-Challan records, and streams live events to the dashboard via WebSockets.

1. **Create a Python Virtual Environment:**
   ```bash
   python3 -m venv venv
   ```
2. **Activate the Virtual Environment:**
   ```bash
   source venv/bin/activate
   # On Windows Command Prompt: venv\Scripts\activate.bat
   # On Windows PowerShell: venv\Scripts\Activate.ps1
   ```
3. **Install Dependencies:**
   Install the required libraries listed in `requirements.txt`. (This includes PyTorch, Ultralytics YOLO, MediaPipe, httpx, and async DB drivers):
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
4. **Start the FastAPI Server:**
   Launch the server on port `8000` using Uvicorn.
   ```bash
   uvicorn backend.main:app --reload --port 8000
   ```
   * **HTTPS Verification:** Since the repository contains `cert.pem` and `key.pem` local certificates, the backend starts automatically in secure mode at:
     **`https://localhost:8000`**
   * **API Swagger Documentation:** Open [https://localhost:8000/docs](https://localhost:8000/docs) in your browser (ignore the browser's self-signed certificate warnings) to view the interactive API playground.

---

## 🖥️ Step 3: Set Up and Start the Next.js Frontend

The Next.js dashboard provides a live command center to monitor cameras, review disputed or Tier 2 citations, calibrate camera lines, and inspect traffic analytics.

1. **Install Frontend Dependencies:**
   Open a **new terminal tab**, navigate to the project root, and install the npm packages:
   ```bash
   cd /Users/keshav/garuda/GARUDA
   npm install
   ```
2. **Start the Frontend Development Server:**
   Launch Next.js in development mode:
   ```bash
   npm run dev
   ```
3. **Access the Dashboard:**
   Open your browser and navigate to:
   **`http://localhost:3000`**
   *(Note: The frontend is configured to automatically discover the backend API at `https://localhost:8000` using your browser's current network interface).*

---

## 🚦 Step 4: Run the ML Ingestion Pipeline

Once the backend and frontend are running, you can stream detections to the dashboard using the standalone ML pipeline script (`ml/demo_pipeline.py`).

1. **Ensure your Python Virtual Environment is Active:**
   ```bash
   source venv/bin/activate
   ```
2. **Execute Ingestion Commands:**
   * **Process a Single Image (Recommended for Quick Testing):**
     Run the pipeline on a static image and ingest the resulting violations directly into the HTTPS backend:
     ```bash
     python3 ml/demo_pipeline.py --input /path/to/your/image.jpg --backend-url https://localhost:8000 --verbose
     ```
   * **Process a Video Clip (With Driver Distraction/Drowsiness Checking):**
     Analyze a driver feed video and upload violations to the dashboard:
     ```bash
     python3 ml/demo_pipeline.py --input /path/to/driver_feed.mp4 --video --driver-state --backend-url https://localhost:8000
     ```
   * **Run Live Webcam Stream:**
     Capture frames from your system camera and log real-time violations:
     ```bash
     python3 ml/demo_pipeline.py --webcam --backend-url https://localhost:8000
     ```

---

## 🔍 Step 5: Troubleshooting & Verification

### Port Conflicts
If you receive an error saying a port is already in use:
* **Port 8000 (Backend):**
  Check the process using port 8000 and terminate it:
  ```bash
  lsof -i :8000
  kill -9 <PID>
  ```
* **Port 3000 (Frontend):**
  Check the process using port 3000 and terminate it:
  ```bash
  lsof -i :3000
  kill -9 <PID>
  ```

### SSL Handshake Failures
If the ML pipeline throws a `[SSL: CERTIFICATE_VERIFY_FAILED]` error:
* The local FastAPI backend uses self-signed SSL certificates (`cert.pem` / `key.pem`).
* Make sure you are using the updated `ml/demo_pipeline.py` script. The HTTP client has been optimized with `verify=False` to ignore local self-signed certificate warnings when connecting to `https://localhost:8000`.
