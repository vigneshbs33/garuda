# 🌐 GARUDA Free Cloud Deployment Guide
### Deploying Next.js (Vercel), FastAPI (Render), and PostgreSQL (Neon/Supabase) for Free

This guide walks you through deploying the **GARUDA** platform online completely for free. This setup supports up to 100+ daily active users, features zero-cost persistent database hosting, and handles automatic deployments from your GitHub repository.

---

## 🏗️ The Free Deployment Stack

We will use three decoupled cloud providers, each offering a generous free tier:

```
+-----------------------------------+
|      Vercel (Free Frontend)       |
|    - Serves Next.js Dashboard      |
|    - https://garuda.vercel.app    |
+-----------------+-----------------+
                  |
             (HTTP / HTTPS)
                  v
+-----------------+-----------------+
|      Render (Free Backend)        |
|    - FastAPI Application server   |
|    - https://garuda.onrender.com  |
+--------+-----------------+--------+
         |                 |
    (PostgreSQL)      (WebSockets)
         v                 v
+--------+--------+  +-----+--------+
|  Neon Serverless|  | Live Camera  |
|  Postgres DB    |  | Edge Nodes   |
|  (Free / Neon)  |  | (Local R-Pi) |
+-----------------+  +--------------+
```

---

## ⏱️ Step 1: Create a Free PostgreSQL Database
Since Render’s free tier does not support persistent files, standard SQLite will reset every time the container restarts. We will use a dedicated PostgreSQL database.

### Option A: Neon.tech (Recommended)
1. Go to [Neon.tech](https://neon.tech/) and sign up for a free account.
2. Create a new project named `garuda-db`.
3. In the dashboard, copy your **Connection String**. Make sure the dropdown is set to **Pooled Connection** (adds `-pooler` to the host) or standard direct connection.
4. The connection string will look like:
   `postgresql://username:password@ep-some-hash.us-east-2.aws.neon.tech/neondb?sslmode=require`
5. **CRITICAL:** SQLAlchemy requires the `postgresql+asyncpg` protocol driver. Modify the beginning of the connection string to:
   `postgresql+asyncpg://username:password@ep-some-hash.us-east-2.aws.neon.tech/neondb?sslmode=require`

---

## 🐍 Step 2: Deploy the FastAPI Backend to Render
Render provides free web hosting for Python applications.

1. Create a free account on [Render.com](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. Configure the Web Service settings:
   * **Name:** `garuda-backend`
   * **Region:** Choose the region closest to you (e.g., Singapore for India, Oregon/Ohio for USA).
   * **Runtime:** `Python`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Click **Advanced** to add Environment Variables:
   * `DATABASE_URL` = *(Your `postgresql+asyncpg://...` connection string from Step 1)*
   * `DEBUG` = `false`
   * `PORT` = `10000` (Render binds this dynamically, but setting it explicitly ensures alignment)
6. Click **Deploy Web Service**.
7. Render will build and deploy the service. Note down your public backend URL (e.g., `https://garuda-backend.onrender.com`).

> 💡 *Note: Render's free tier spins down after 15 minutes of inactivity. The next visitor will trigger a cold-start taking about 50 seconds to boot up.*

---

## ⚡ Step 3: Deploy the Next.js Frontend to Vercel
Vercel is the creator of Next.js and hosts it with maximum performance on their edge network for free.

1. Go to [Vercel.com](https://vercel.com/) and sign up/login using GitHub.
2. Click **Add New** > **Project** and import your repository.
3. Vercel will auto-detect **Next.js** as the framework preset.
4. Expand the **Environment Variables** dropdown and add:
   * **Name:** `NEXT_PUBLIC_API_URL`
   * **Value:** `https://garuda-backend.onrender.com` *(Use your actual Render URL from Step 2)*
5. Click **Deploy**.
6. Within 2 minutes, Vercel will build the frontend and provide a global URL (e.g., `https://garuda-six.vercel.app`).

---

## 📡 Step 4: Connecting Edge Nodes & Webcams
Once the frontend and backend are deployed online, you can stream detections to your online ecosystem from any local device (your laptop, office webcam, or Raspberry Pi node):

Run the local ML pipeline and direct it to your public Render URL:
```bash
# Ingest local sample image to the public server
python ml/demo_pipeline.py --input sample.jpg --backend-url https://garuda-backend.onrender.com --verbose

# Run live webcam detection stream to the cloud server
python ml/demo_pipeline.py --webcam --backend-url https://garuda-backend.onrender.com
```

### How to test:
1. Open your Vercel URL in a browser.
2. Start the local `demo_pipeline.py` pointing to the Render backend.
3. You will see violations instantly pop up on the online dashboard feed in real-time, synced via secure WebSockets (`wss://`).
