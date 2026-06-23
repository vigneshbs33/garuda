const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");

// Icon imports
const {
    FaMicrochip, FaCar, FaShieldAlt, FaBrain, FaNetworkWired,
    FaServer, FaDatabase, FaLock, FaEye, FaCheckCircle,
    FaExclamationTriangle, FaCloud, FaRoad, FaCode, FaMobile,
    FaChartLine, FaUsers, FaGavel, FaWifi, FaClock
} = require("react-icons/fa");
const { MdSecurity, MdSpeed, MdVisibility } = require("react-icons/md");
const { BiNetworkChart } = require("react-icons/bi");

// ── PALETTE ──────────────────────────────────────────────────────────────────
const C = {
    darkBg: "0D1B2A",   // deep navy
    darkBg2: "112236",   // slightly lighter navy
    midBg: "1A3353",   // mid navy for cards
    cardBg: "162840",   // card background
    accent: "2E86C1",   // steel blue accent
    accentDk: "1B5E8C",   // darker steel blue
    accentLt: "5DADE2",   // lighter steel blue
    amber: "D4A017",   // amber for highlights
    green: "1E8449",   // forest green for success
    greenLt: "27AE60",   // lighter green
    red: "922B21",   // muted red for problems
    white: "FFFFFF",
    offWhite: "E8EEF4",
    gray: "8FA3B1",
    lightGray: "B8C9D6",
    darkText: "1A2738",
    gold: "C9A84C",
};

async function iconPng(IconComp, color, size = 256) {
    const svg = ReactDOMServer.renderToStaticMarkup(
        React.createElement(IconComp, { color: `#${color}`, size: String(size) })
    );
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    return "image/png;base64," + buf.toString("base64");
}

function makeShadow() {
    return { type: "outer", color: "000000", blur: 8, offset: 3, angle: 45, opacity: 0.18 };
}
function makeCardShadow() {
    return { type: "outer", color: "000000", blur: 12, offset: 4, angle: 45, opacity: 0.22 };
}

async function build() {
    const pres = new pptxgen();
    pres.layout = "LAYOUT_16x9";
    pres.title = "GARUDA: Gridlock Guardian";

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 1 — TITLE
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: C.darkBg };

        // Left dark panel (60%)
        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 6.2, h: 5.625,
            fill: { color: C.darkBg },
            line: { color: C.darkBg, width: 0 }
        });

        // Right accent panel
        s.addShape(pres.shapes.RECTANGLE, {
            x: 6.2, y: 0, w: 3.8, h: 5.625,
            fill: { color: C.darkBg2 },
            line: { color: C.darkBg2, width: 0 }
        });

        // Decorative circuit grid lines on right panel
        for (let i = 0; i < 8; i++) {
            s.addShape(pres.shapes.LINE, {
                x: 6.3 + i * 0.4, y: 0.2, w: 0, h: 5.2,
                line: { color: "1E3A52", width: 0.5 }
            });
        }
        for (let j = 0; j < 14; j++) {
            s.addShape(pres.shapes.LINE, {
                x: 6.3, y: 0.2 + j * 0.38, w: 3.5, h: 0,
                line: { color: "1E3A52", width: 0.5 }
            });
        }

        // Glowing circle on right
        s.addShape(pres.shapes.OVAL, {
            x: 7.05, y: 0.8, w: 2.3, h: 2.3,
            fill: { color: C.accentDk, transparency: 65 },
            line: { color: C.accent, width: 1.5 }
        });
        s.addShape(pres.shapes.OVAL, {
            x: 7.35, y: 1.1, w: 1.7, h: 1.7,
            fill: { color: C.accent, transparency: 75 },
            line: { color: C.accentLt, width: 1 }
        });

        // Eye icon in circle
        const eyeIcon = await iconPng(FaEye, C.accentLt, 256);
        s.addImage({ data: eyeIcon, x: 7.6, y: 1.35, w: 1.2, h: 1.2 });

        // GARUDA word mark
        s.addText("GARUDA", {
            x: 0.5, y: 0.5, w: 5.4, h: 1.0,
            fontSize: 58, fontFace: "Cambria", bold: true,
            color: C.white, charSpacing: 8, margin: 0
        });

        // Accent line under title — using thick shape, not a stripe bar
        s.addShape(pres.shapes.RECTANGLE, {
            x: 0.5, y: 1.5, w: 1.8, h: 0.06,
            fill: { color: C.accent },
            line: { color: C.accent, width: 0 }
        });
        s.addShape(pres.shapes.RECTANGLE, {
            x: 2.38, y: 1.5, w: 0.5, h: 0.06,
            fill: { color: C.amber },
            line: { color: C.amber, width: 0 }
        });

        // Subtitle
        s.addText("Gridlock Guardian", {
            x: 0.5, y: 1.65, w: 5.5, h: 0.5,
            fontSize: 22, fontFace: "Calibri", bold: false,
            color: C.accentLt, margin: 0
        });
        s.addText("Autonomous Edge-Native Traffic Intelligence\n& Enforcement Platform", {
            x: 0.5, y: 2.1, w: 5.5, h: 0.85,
            fontSize: 15, fontFace: "Calibri",
            color: C.lightGray, margin: 0
        });

        // Three feature pills
        const pills = [
            { icon: FaMicrochip, text: "Edge-Native CV Pipeline" },
            { icon: FaCar, text: "Plate Reconstruction" },
            { icon: FaGavel, text: "Automated E-Challan" },
        ];
        for (let i = 0; i < pills.length; i++) {
            const px = 0.5, py = 3.15 + i * 0.62;
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: px, y: py, w: 4.8, h: 0.5,
                fill: { color: C.midBg },
                line: { color: C.accent, width: 0.8 },
                rectRadius: 0.08,
                shadow: makeShadow()
            });
            const ic = await iconPng(pills[i].icon, C.accentLt, 128);
            s.addImage({ data: ic, x: px + 0.12, y: py + 0.08, w: 0.34, h: 0.34 });
            s.addText(pills[i].text, {
                x: px + 0.56, y: py + 0.08, w: 4.1, h: 0.34,
                fontSize: 13, fontFace: "Calibri", color: C.offWhite, margin: 0
            });
        }

        // Team tag bottom
        s.addText("Team CodeKrafters  ·  2025", {
            x: 0.5, y: 5.15, w: 5.5, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.gray, margin: 0
        });

        // Right panel label
        s.addText("INTELLIGENT\nTRAFFIC\nENFORCEMENT", {
            x: 6.3, y: 3.5, w: 3.4, h: 1.8,
            fontSize: 14, fontFace: "Cambria", bold: true,
            color: C.gray, align: "center", charSpacing: 3, margin: 0
        });

        s.addNotes("Good morning everyone. We are Team CodeKrafters, and today we are presenting GARUDA (Gridlock Guardian)—a fully autonomous, edge-native traffic intelligence platform designed to enforce traffic rules, prevent accidents, and streamline municipal billing without relying on expensive, privacy-intrusive cloud infrastructure.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 2 — THE PROBLEM
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: "F4F7FA" };

        // Header bar
        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.05,
            fill: { color: C.darkBg },
            line: { color: C.darkBg, width: 0 }
        });
        s.addText("THE PROBLEM", {
            x: 0.4, y: 0.08, w: 3, h: 0.35,
            fontSize: 10, fontFace: "Calibri", color: C.accent,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("The Chaos of Modern Urban Traffic", {
            x: 0.4, y: 0.42, w: 9, h: 0.5,
            fontSize: 26, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // 4 problem cards — 2x2
        const problems = [
            {
                icon: FaCloud, color: C.red, title: "Cloud Dependency",
                body: "Traffic cameras stream raw video 24/7 to the cloud — causing massive bandwidth bills and high latency in enforcement response."
            },
            {
                icon: FaCar, color: C.red, title: "Unreadable Plates",
                body: "Mud, physical damage, or motion blur renders typical OCR engines useless — violators escape identification entirely."
            },
            {
                icon: FaExclamationTriangle, color: C.amber, title: "False Accusations",
                body: "Static, non-gated systems issue incorrect challans causing citizen outrage and a growing dispute resolution backlog."
            },
            {
                icon: FaEye, color: C.amber, title: "Reactive Policing",
                body: "Existing systems only record accidents after they occur. No proactive screening for drowsiness or driver distraction."
            },
        ];

        const cols = [0.3, 5.2];
        const rows = [1.25, 3.45];
        for (let i = 0; i < 4; i++) {
            const cx = cols[i % 2], cy = rows[Math.floor(i / 2)];
            const p = problems[i];

            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: cx, y: cy, w: 4.6, h: 2.0,
                fill: { color: C.white },
                line: { color: "DDE4EC", width: 1 },
                rectRadius: 0.1,
                shadow: makeCardShadow()
            });

            // Icon circle
            s.addShape(pres.shapes.OVAL, {
                x: cx + 0.2, y: cy + 0.22, w: 0.6, h: 0.6,
                fill: { color: p.color, transparency: 85 },
                line: { color: p.color, width: 1 }
            });
            const ic = await iconPng(p.icon, p.color, 128);
            s.addImage({ data: ic, x: cx + 0.27, y: cy + 0.28, w: 0.46, h: 0.46 });

            s.addText(p.title, {
                x: cx + 0.95, y: cy + 0.22, w: 3.5, h: 0.42,
                fontSize: 14, fontFace: "Cambria", bold: true,
                color: C.darkText, margin: 0
            });
            s.addText(p.body, {
                x: cx + 0.2, y: cy + 0.72, w: 4.2, h: 1.15,
                fontSize: 12, fontFace: "Calibri", color: "445566",
                margin: 0
            });
        }

        s.addNotes("In developing countries like India, traffic enforcement is broken. Cities deploy thousands of CCTV cameras, but streaming all that footage to the cloud eats up bandwidth. Plates are often blurry, and incorrect fines cause citizen outrage. Existing systems are completely reactive—they record crashes instead of preventing them.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 3 — THE SOLUTION / ARCHITECTURE
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: C.darkBg };

        // Header
        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.0,
            fill: { color: C.darkBg2 },
            line: { color: C.darkBg2, width: 0 }
        });
        s.addText("THE SOLUTION", {
            x: 0.4, y: 0.08, w: 3, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.amber,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("GARUDA: Edge-Native & Offline-First Architecture", {
            x: 0.4, y: 0.38, w: 9, h: 0.48,
            fontSize: 24, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // Architecture flow diagram: Camera → Edge Node → JSON → Backend → Dashboard
        const flowItems = [
            { icon: FaEye, label: "Camera\nFeed", sub: "RTSP / USB", x: 0.25 },
            { icon: FaMicrochip, label: "Edge Node\nYOLOv8", sub: "RPi5 + Coral", x: 2.05 },
            { icon: FaDatabase, label: "JSON\nTicket", sub: "< 2KB payload", x: 3.85 },
            { icon: FaServer, label: "FastAPI\nBackend", sub: "Async + WS", x: 5.65 },
            { icon: FaShieldAlt, label: "Officer\nDashboard", sub: "Next.js 16", x: 7.45 },
        ];

        // Draw connecting arrows first
        for (let i = 0; i < 4; i++) {
            const ax = flowItems[i].x + 1.55;
            s.addShape(pres.shapes.LINE, {
                x: ax, y: 2.45, w: 0.45, h: 0,
                line: { color: C.accent, width: 2 }
            });
            // Arrowhead
            s.addShape(pres.shapes.RECTANGLE, {
                x: ax + 0.38, y: 2.4, w: 0.12, h: 0.12,
                fill: { color: C.accent },
                line: { color: C.accent, width: 0 }
            });
        }

        for (let i = 0; i < flowItems.length; i++) {
            const f = flowItems[i];
            // Box
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: f.x, y: 1.2, w: 1.6, h: 2.5,
                fill: { color: C.midBg },
                line: { color: C.accent, width: 1 },
                rectRadius: 0.1,
                shadow: makeShadow()
            });
            const ic = await iconPng(f.icon, C.accentLt, 128);
            s.addImage({ data: ic, x: f.x + 0.45, y: 1.35, w: 0.7, h: 0.7 });
            s.addText(f.label, {
                x: f.x + 0.05, y: 2.1, w: 1.5, h: 0.65,
                fontSize: 11, fontFace: "Cambria", bold: true,
                color: C.white, align: "center", margin: 0
            });
            s.addText(f.sub, {
                x: f.x + 0.05, y: 2.78, w: 1.5, h: 0.35,
                fontSize: 9, fontFace: "Calibri",
                color: C.accentLt, align: "center", margin: 0
            });
        }

        // Key callout: no raw video
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 3.6, y: 3.85, w: 2.8, h: 0.5,
            fill: { color: C.green, transparency: 80 },
            line: { color: C.greenLt, width: 1 },
            rectRadius: 0.08
        });
        s.addText("✓  No raw video leaves the intersection", {
            x: 3.65, y: 3.9, w: 2.7, h: 0.38,
            fontSize: 11, fontFace: "Calibri", bold: true,
            color: C.greenLt, align: "center", margin: 0
        });

        // 4 solution bullets at bottom
        const sols = [
            { t: "Edge-Native", d: "ML models run locally on camera nodes" },
            { t: "Plate Heuristic", d: "Partial chars + vehicle class + color" },
            { t: "Auto SMS Challan", d: "Vahan DB lookup → instant fine delivery" },
            { t: "Human-in-Loop", d: "Low-confidence → officer review queue" },
        ];
        const sc = [0.25, 2.55, 5.1, 7.4];
        for (let i = 0; i < 4; i++) {
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: sc[i], y: 4.5, w: 2.1, h: 0.88,
                fill: { color: C.cardBg },
                line: { color: C.accentDk, width: 0.8 },
                rectRadius: 0.08
            });
            s.addText(sols[i].t, {
                x: sc[i] + 0.12, y: 4.55, w: 1.88, h: 0.3,
                fontSize: 11, fontFace: "Cambria", bold: true,
                color: C.amber, margin: 0
            });
            s.addText(sols[i].d, {
                x: sc[i] + 0.12, y: 4.85, w: 1.88, h: 0.44,
                fontSize: 10, fontFace: "Calibri",
                color: C.lightGray, margin: 0
            });
        }

        s.addNotes("GARUDA shifts intelligence directly to the edge. No raw video is streamed. The edge node analyzes video locally and uploads only a tiny JSON ticket when a violation occurs. Damaged or blurry plates are reconstructed using vehicle color and type matching. High-confidence tickets are sent automatically; borderline cases go to human review.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 4 — EDGE HARDWARE
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: "F4F7FA" };

        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.05,
            fill: { color: C.darkBg },
            line: { color: C.darkBg, width: 0 }
        });
        s.addText("HARDWARE", {
            x: 0.4, y: 0.08, w: 3, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.accentLt,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("Edge-Node Hardware Deployment", {
            x: 0.4, y: 0.4, w: 9, h: 0.5,
            fontSize: 26, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // Two hardware config cards side by side
        // Budget card
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 0.3, y: 1.2, w: 4.3, h: 3.0,
            fill: { color: C.white },
            line: { color: "DDE4EC", width: 1 },
            rectRadius: 0.1,
            shadow: makeCardShadow()
        });
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 0.3, y: 1.2, w: 4.3, h: 0.5,
            fill: { color: C.accent },
            line: { color: C.accent, width: 0 },
            rectRadius: 0.1
        });
        // Fix bottom of pill to be square
        s.addShape(pres.shapes.RECTANGLE, {
            x: 0.3, y: 1.5, w: 4.3, h: 0.2,
            fill: { color: C.accent },
            line: { color: C.accent, width: 0 }
        });
        s.addText("BUDGET SETUP", {
            x: 0.4, y: 1.25, w: 4.1, h: 0.38,
            fontSize: 13, fontFace: "Cambria", bold: true,
            color: C.white, align: "center", margin: 0
        });

        const budgetSpecs = [
            ["Platform", "Raspberry Pi 5 (8GB RAM)"],
            ["Accelerator", "Google Coral USB TPU"],
            ["Model Format", "TFLite INT8 Quantized"],
            ["Power Draw", "< 15 Watts total"],
            ["Inference", "High FPS local detection"],
            ["Offline Cache", "SQLite — auto-sync on reconnect"],
        ];
        for (let i = 0; i < budgetSpecs.length; i++) {
            const by = 1.82 + i * 0.36;
            s.addText(budgetSpecs[i][0] + ":", {
                x: 0.5, y: by, w: 1.5, h: 0.3,
                fontSize: 11, fontFace: "Calibri", bold: true,
                color: C.accentDk, margin: 0
            });
            s.addText(budgetSpecs[i][1], {
                x: 2.05, y: by, w: 2.4, h: 0.3,
                fontSize: 11, fontFace: "Calibri",
                color: C.darkText, margin: 0
            });
        }

        // High-end card
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 5.1, y: 1.2, w: 4.3, h: 3.0,
            fill: { color: C.white },
            line: { color: "DDE4EC", width: 1 },
            rectRadius: 0.1,
            shadow: makeCardShadow()
        });
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 5.1, y: 1.2, w: 4.3, h: 0.5,
            fill: { color: C.darkText },
            line: { color: C.darkText, width: 0 },
            rectRadius: 0.1
        });
        s.addShape(pres.shapes.RECTANGLE, {
            x: 5.1, y: 1.5, w: 4.3, h: 0.2,
            fill: { color: C.darkText },
            line: { color: C.darkText, width: 0 }
        });
        s.addText("HIGH-END SETUP", {
            x: 5.2, y: 1.25, w: 4.1, h: 0.38,
            fontSize: 13, fontFace: "Cambria", bold: true,
            color: C.amber, align: "center", margin: 0
        });

        const highSpecs = [
            ["Platform", "NVIDIA Jetson Orin NX"],
            ["Accelerator", "Integrated GPU (1024 CUDA cores)"],
            ["Model Format", "TensorRT FP16 Optimized"],
            ["Power Draw", "10–25 Watts configurable"],
            ["Inference", "Real-time multi-stream"],
            ["Precision", "FP16 — higher accuracy"],
        ];
        for (let i = 0; i < highSpecs.length; i++) {
            const hy = 1.82 + i * 0.36;
            s.addText(highSpecs[i][0] + ":", {
                x: 5.3, y: hy, w: 1.5, h: 0.3,
                fontSize: 11, fontFace: "Calibri", bold: true,
                color: C.darkText, margin: 0
            });
            s.addText(highSpecs[i][1], {
                x: 6.85, y: hy, w: 2.4, h: 0.3,
                fontSize: 11, fontFace: "Calibri",
                color: C.darkText, margin: 0
            });
        }

        // Offline resilience banner
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 0.3, y: 4.35, w: 9.1, h: 0.95,
            fill: { color: C.darkBg2 },
            line: { color: C.accent, width: 1 },
            rectRadius: 0.1
        });
        const wifiIc = await iconPng(FaWifi, C.accentLt, 128);
        s.addImage({ data: wifiIc, x: 0.5, y: 4.5, w: 0.52, h: 0.52 });
        s.addText("Network Resilience:", {
            x: 1.15, y: 4.42, w: 2.5, h: 0.35,
            fontSize: 12, fontFace: "Cambria", bold: true,
            color: C.accentLt, margin: 0
        });
        s.addText("If the cellular or broadband link drops, the edge node caches all violations locally in SQLite and automatically syncs them once connectivity is restored. Fully offline-first.", {
            x: 1.15, y: 4.75, w: 8.1, h: 0.46,
            fontSize: 11, fontFace: "Calibri",
            color: C.lightGray, margin: 0
        });

        s.addNotes("Raspberry Pi 5 with Google Coral TPU runs our complete detection pipeline locally. Models are quantized to INT8 for minimal power draw — under 15 Watts. If the network drops, violations are cached in SQLite and synced on reconnection. Fully offline-first.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 5 — PLATE RECONSTRUCTION PIPELINE
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: C.darkBg };

        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.0,
            fill: { color: C.darkBg2 },
            line: { color: C.darkBg2, width: 0 }
        });
        s.addText("CORE ALGORITHM", {
            x: 0.4, y: 0.08, w: 4, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.amber,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("Plate Reconstruction Pipeline: Resolving Blurry & Obscured Plates", {
            x: 0.4, y: 0.38, w: 9.2, h: 0.48,
            fontSize: 22, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // Pipeline steps (4 stages with arrows)
        const stages = [
            { step: "01", title: "Camera Capture", desc: "Partial plate detected:\nKA 03 M_ _ _92\n(blurry / obscured)", color: C.red },
            { step: "02", title: "Feature Extract", desc: "YOLO → Vehicle Type: Hatchback\nHSV Histogram → Color: Red\nOCR → KA03M??92", color: C.amber },
            { step: "03", title: "DB Query + Rank", desc: "Regex match on partial chars\n+ filter by vehicle class\n+ filter by color", color: C.accent },
            { step: "04", title: "Identity Resolved", desc: "KA 03 MD 8292\nConfidence: HIGH ✓\nChallan issued automatically", color: C.greenLt },
        ];

        for (let i = 0; i < 4; i++) {
            const sx = 0.25 + i * 2.42;
            const st = stages[i];

            // Card
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: sx, y: 1.15, w: 2.15, h: 3.4,
                fill: { color: C.cardBg },
                line: { color: st.color, width: 1.2 },
                rectRadius: 0.1,
                shadow: makeShadow()
            });

            // Step number circle
            s.addShape(pres.shapes.OVAL, {
                x: sx + 0.7, y: 1.28, w: 0.75, h: 0.75,
                fill: { color: st.color, transparency: 20 },
                line: { color: st.color, width: 1.5 }
            });
            s.addText(st.step, {
                x: sx + 0.7, y: 1.28, w: 0.75, h: 0.75,
                fontSize: 18, fontFace: "Cambria", bold: true,
                color: C.white, align: "center", valign: "middle", margin: 0
            });

            s.addText(st.title, {
                x: sx + 0.12, y: 2.15, w: 1.92, h: 0.45,
                fontSize: 13, fontFace: "Cambria", bold: true,
                color: st.color, align: "center", margin: 0
            });
            s.addText(st.desc, {
                x: sx + 0.12, y: 2.65, w: 1.92, h: 1.65,
                fontSize: 11, fontFace: "Calibri",
                color: C.offWhite, align: "center", margin: 0
            });

            // Arrow between cards
            if (i < 3) {
                s.addShape(pres.shapes.LINE, {
                    x: sx + 2.2, y: 2.85, w: 0.17, h: 0,
                    line: { color: C.accent, width: 2 }
                });
            }
        }

        // Bottom: 3 technical method pills
        const methods = [
            { icon: FaEye, title: "Visual Extraction", body: "YOLO vehicle type + HSV histogram color analysis" },
            { icon: FaCode, title: "Regex Recovery", body: "State-code pattern matching — KA, MH, TN, DL, etc." },
            { icon: FaDatabase, title: "Candidate Ranking", body: "DB query on partial chars → filtered by type & color" },
        ];
        for (let i = 0; i < 3; i++) {
            const mx = 0.3 + i * 3.23;
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: mx, y: 4.72, w: 2.9, h: 0.72,
                fill: { color: C.midBg },
                line: { color: C.accentDk, width: 0.8 },
                rectRadius: 0.08
            });
            const ic = await iconPng(methods[i].icon, C.accentLt, 128);
            s.addImage({ data: ic, x: mx + 0.14, y: 4.85, w: 0.42, h: 0.42 });
            s.addText(methods[i].title, {
                x: mx + 0.65, y: 4.76, w: 2.15, h: 0.28,
                fontSize: 11, fontFace: "Cambria", bold: true,
                color: C.amber, margin: 0
            });
            s.addText(methods[i].body, {
                x: mx + 0.65, y: 5.03, w: 2.15, h: 0.32,
                fontSize: 9.5, fontFace: "Calibri",
                color: C.lightGray, margin: 0
            });
        }

        s.addNotes("Our plate reconstruction pipeline is key. When a license plate is partially hidden or blurry, normal OCR gives up. GARUDA extracts partial characters, classifies vehicle type via YOLO, and performs HSV color analysis. A database query then matches all factors to uniquely identify the vehicle with high confidence.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 6 — FIVE CORE USPs
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: "F4F7FA" };

        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.05,
            fill: { color: C.darkBg },
            line: { color: C.darkBg, width: 0 }
        });
        s.addText("DIFFERENTIATION", {
            x: 0.4, y: 0.08, w: 3, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.amber,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("Five Core Unique Selling Propositions", {
            x: 0.4, y: 0.4, w: 9, h: 0.5,
            fontSize: 26, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        const usps = [
            {
                num: "01", icon: FaMicrochip, color: C.accent, title: "Edge-Native Autonomy",
                body: "Operates without high-speed internet. Full detection, tracking and enforcement runs locally — ideal for connectivity dead zones."
            },
            {
                num: "02", icon: FaCar, color: C.amber, title: "Obscured Plate Resolution",
                body: "Solves the unreadable plate problem through multi-factor DB lookups combining partial characters, vehicle class and color."
            },
            {
                num: "03", icon: FaBrain, color: C.green, title: "Driver State Alerts",
                body: "Proactive accident prevention via MediaPipe FaceMesh — detects drowsiness and mobile phone usage in real time."
            },
            {
                num: "04", icon: FaNetworkWired, color: C.accentLt, title: "Privacy-First Federated Learning",
                body: "Models train locally on officer-confirmed samples. Only weight deltas are shared weekly via Flower — no video leaves the node."
            },
            {
                num: "05", icon: FaShieldAlt, color: C.gold, title: "Confidence-Gated Review Queue",
                body: "Dual safety check: high-confidence violations are auto-issued; borderline cases route to officers — preventing all false challans."
            },
        ];

        for (let i = 0; i < 5; i++) {
            const ux = 0.28 + i * 1.9;
            const u = usps[i];

            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: ux, y: 1.2, w: 1.7, h: 4.18,
                fill: { color: C.white },
                line: { color: "DDE4EC", width: 1 },
                rectRadius: 0.1,
                shadow: makeCardShadow()
            });

            // Top colored area
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: ux, y: 1.2, w: 1.7, h: 1.3,
                fill: { color: u.color, transparency: 88 },
                line: { color: u.color, width: 0.8 },
                rectRadius: 0.1
            });
            // Square out the bottom corners of top area
            s.addShape(pres.shapes.RECTANGLE, {
                x: ux, y: 2.1, w: 1.7, h: 0.4,
                fill: { color: u.color, transparency: 88 },
                line: { color: u.color, width: 0 }
            });

            // Number
            s.addText(u.num, {
                x: ux + 0.08, y: 1.25, w: 0.55, h: 0.42,
                fontSize: 18, fontFace: "Cambria", bold: true,
                color: u.color, margin: 0
            });

            // Icon
            const ic = await iconPng(u.icon, u.color, 128);
            s.addImage({ data: ic, x: ux + 0.55, y: 1.32, w: 0.62, h: 0.62 });

            // Title
            s.addText(u.title, {
                x: ux + 0.1, y: 2.18, w: 1.52, h: 0.65,
                fontSize: 11, fontFace: "Cambria", bold: true,
                color: C.darkText, align: "center", margin: 0
            });

            // Body
            s.addText(u.body, {
                x: ux + 0.1, y: 2.88, w: 1.52, h: 2.28,
                fontSize: 10, fontFace: "Calibri",
                color: "445566", align: "center", margin: 0
            });
        }

        s.addNotes("Five key differentiators: edge-native operation, plate reconstruction via multi-factor matching, proactive drowsiness detection via MediaPipe, Federated Learning with Flower sharing only weights not video, and confidence-gated routing preventing false challans.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 7 — TECHNICAL STACK
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: C.darkBg };

        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.0,
            fill: { color: C.darkBg2 },
            line: { color: C.darkBg2, width: 0 }
        });
        s.addText("IMPLEMENTATION", {
            x: 0.4, y: 0.08, w: 4, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.greenLt,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("Technical Stack — Fully Implemented & Operational", {
            x: 0.4, y: 0.38, w: 9, h: 0.48,
            fontSize: 24, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // Three columns: Frontend / Backend / ML
        const cols3 = [
            {
                icon: FaCode, color: C.accentLt, title: "Frontend",
                stack: "Next.js 16 + TypeScript + React 19",
                features: [
                    "Live camera feed viewer",
                    "Real-time violation heatmaps",
                    "Camera calibration panel",
                    "Officer approval / reject queue",
                    "WebSocket-driven updates",
                ]
            },
            {
                icon: FaServer, color: C.amber, title: "Backend",
                stack: "FastAPI + Async SQLite / PostgreSQL",
                features: [
                    "Async WebSocket streams",
                    "SQL ORM database models",
                    "Secure HTTPS API endpoint",
                    "SSL self-signed support",
                    "RESTful violation ingestion",
                ]
            },
            {
                icon: FaBrain, color: C.greenLt, title: "ML Pipeline",
                stack: "YOLOv8 + ByteTrack + Tesseract",
                features: [
                    "Vehicle detection — COCO 6 classes",
                    "ByteTrack multi-object tracking",
                    "Helmet CNN (MobileNetV3)",
                    "Drowsiness — MediaPipe FaceMesh",
                    "OCR plate reading pipeline",
                ]
            },
        ];

        for (let i = 0; i < 3; i++) {
            const cx = 0.28 + i * 3.25;
            const c = cols3[i];

            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: cx, y: 1.1, w: 3.0, h: 4.28,
                fill: { color: C.cardBg },
                line: { color: c.color, width: 1.2 },
                rectRadius: 0.1,
                shadow: makeShadow()
            });

            // Header bar
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: cx, y: 1.1, w: 3.0, h: 0.9,
                fill: { color: C.midBg },
                line: { color: c.color, width: 0 },
                rectRadius: 0.1
            });
            s.addShape(pres.shapes.RECTANGLE, {
                x: cx, y: 1.6, w: 3.0, h: 0.4,
                fill: { color: C.midBg },
                line: { color: C.midBg, width: 0 }
            });

            const ic = await iconPng(c.icon, c.color, 128);
            s.addImage({ data: ic, x: cx + 0.15, y: 1.2, w: 0.55, h: 0.55 });
            s.addText(c.title, {
                x: cx + 0.8, y: 1.22, w: 2.1, h: 0.38,
                fontSize: 16, fontFace: "Cambria", bold: true,
                color: c.color, margin: 0
            });

            // Stack badge
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: cx + 0.12, y: 2.1, w: 2.76, h: 0.4,
                fill: { color: C.darkBg },
                line: { color: C.accentDk, width: 0.6 },
                rectRadius: 0.06
            });
            s.addText(c.stack, {
                x: cx + 0.18, y: 2.14, w: 2.65, h: 0.32,
                fontSize: 9.5, fontFace: "Calibri", bold: true,
                color: c.color, margin: 0
            });

            // Feature list
            for (let j = 0; j < c.features.length; j++) {
                const fy = 2.62 + j * 0.5;
                s.addShape(pres.shapes.OVAL, {
                    x: cx + 0.18, y: fy + 0.1, w: 0.14, h: 0.14,
                    fill: { color: c.color },
                    line: { color: c.color, width: 0 }
                });
                s.addText(c.features[j], {
                    x: cx + 0.4, y: fy + 0.04, w: 2.48, h: 0.38,
                    fontSize: 11, fontFace: "Calibri",
                    color: C.offWhite, margin: 0
                });
            }
        }

        // Performance stat banner
        s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
            x: 0.28, y: 5.1, w: 9.44, h: 0.38,
            fill: { color: C.midBg },
            line: { color: C.accent, width: 0.8 },
            rectRadius: 0.06
        });
        s.addText("⚡  ML pipeline executes in < 6.7 sec on CPU  ·  35+ vehicles detected per frame  ·  Verified in local environment tests", {
            x: 0.4, y: 5.14, w: 9.1, h: 0.3,
            fontSize: 11, fontFace: "Calibri", bold: true,
            color: C.greenLt, align: "center", margin: 0
        });

        s.addNotes("Platform is fully operational today. Next.js 16 + TypeScript + React 19 frontend. FastAPI async backend with WebSocket streams. YOLOv8 + ByteTrack ML pipeline running under 6.7 seconds on CPU, detecting 35+ vehicles per frame.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 8 — ROADMAP
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: "F4F7FA" };

        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.05,
            fill: { color: C.darkBg },
            line: { color: C.darkBg, width: 0 }
        });
        s.addText("ROADMAP", {
            x: 0.4, y: 0.08, w: 3, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.accentLt,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("Future Scope: Moving to Production", {
            x: 0.4, y: 0.4, w: 9, h: 0.5,
            fontSize: 26, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // Horizontal timeline spine
        s.addShape(pres.shapes.LINE, {
            x: 0.8, y: 2.62, w: 8.5, h: 0,
            line: { color: C.accent, width: 2.5 }
        });

        const milestones = [
            { icon: FaMicrochip, phase: "Phase 1", title: "Edge Quantization", body: "INT8 TFLite on\nRPi5 + Coral TPU", status: "In Progress", color: C.amber },
            { icon: FaDatabase, phase: "Phase 2", title: "Vahan API Linkage", body: "Live govt database\nintegration", status: "Planned", color: C.accentLt },
            { icon: FaMobile, phase: "Phase 3", title: "Twilio SMS / WhatsApp", body: "Live alert delivery\nfrom mock to prod", status: "Planned", color: C.accentLt },
            { icon: FaNetworkWired, phase: "Phase 4", title: "Federated Learning Loop", body: "_local_train retraining\non confirmed samples", status: "Planned", color: C.accentLt },
            { icon: FaEye, phase: "Phase 5", title: "Cross-Camera Re-ID", body: "OSNet tracking\nwithout plate dependency", status: "Planned", color: C.accentLt },
        ];

        for (let i = 0; i < 5; i++) {
            const mx = 0.55 + i * 1.82;
            const m = milestones[i];
            const isEven = i % 2 === 0;

            // Connector dot on timeline
            s.addShape(pres.shapes.OVAL, {
                x: mx + 0.55, y: 2.49, w: 0.26, h: 0.26,
                fill: { color: m.color },
                line: { color: m.color, width: 0 }
            });

            // Connector line
            const cardY = isEven ? 1.15 : 3.05;
            const lineY = isEven ? 2.49 : 2.75;
            const lineH = isEven ? 1.34 : 0.3;
            s.addShape(pres.shapes.LINE, {
                x: mx + 0.68, y: lineY, w: 0, h: lineH * (isEven ? -1 : 1),
                line: { color: m.color, width: 1, dashType: "dash" }
            });

            const cy = isEven ? 1.15 : 3.1;
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: mx, y: cy, w: 1.62, h: 1.3,
                fill: { color: C.white },
                line: { color: "DDE4EC", width: 1 },
                rectRadius: 0.08,
                shadow: makeCardShadow()
            });

            // Status badge
            const badgeColor = m.status === "In Progress" ? C.amber : "778899";
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: mx + 0.08, y: cy + 0.06, w: 1.46, h: 0.24,
                fill: { color: badgeColor, transparency: 80 },
                line: { color: badgeColor, width: 0.5 },
                rectRadius: 0.04
            });
            s.addText(m.status, {
                x: mx + 0.08, y: cy + 0.07, w: 1.46, h: 0.22,
                fontSize: 8, fontFace: "Calibri", bold: true,
                color: m.status === "In Progress" ? C.amber : "556677",
                align: "center", margin: 0
            });

            s.addText(m.title, {
                x: mx + 0.08, y: cy + 0.34, w: 1.46, h: 0.4,
                fontSize: 10.5, fontFace: "Cambria", bold: true,
                color: C.darkText, align: "center", margin: 0
            });
            s.addText(m.body, {
                x: mx + 0.08, y: cy + 0.76, w: 1.46, h: 0.48,
                fontSize: 9.5, fontFace: "Calibri",
                color: "445566", align: "center", margin: 0
            });

            // Phase label below timeline
            s.addText(m.phase, {
                x: mx + 0.35, y: 2.82, w: 0.9, h: 0.25,
                fontSize: 9, fontFace: "Calibri", bold: true,
                color: C.accent, align: "center", margin: 0
            });
        }

        s.addNotes("Future scope: Phase 1 deploys quantized models on physical RPi5, Phase 2 integrates Vahan government database, Phase 3 activates live Twilio SMS/WhatsApp, Phase 4 completes federated learning backpropagation, Phase 5 adds OSNet cross-camera Re-ID without plate dependency.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 9 — IMPACT
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: C.darkBg };

        s.addShape(pres.shapes.RECTANGLE, {
            x: 0, y: 0, w: 10, h: 1.0,
            fill: { color: C.darkBg2 },
            line: { color: C.darkBg2, width: 0 }
        });
        s.addText("IMPACT", {
            x: 0.4, y: 0.08, w: 3, h: 0.3,
            fontSize: 10, fontFace: "Calibri", color: C.greenLt,
            bold: true, charSpacing: 3, margin: 0
        });
        s.addText("Socio-Economic & Governance Impact", {
            x: 0.4, y: 0.38, w: 9, h: 0.48,
            fontSize: 24, fontFace: "Cambria", bold: true,
            color: C.white, margin: 0
        });

        // Big stat numbers row
        const stats = [
            { num: "60%", label: "Reduction in manual\nofficer review time" },
            { num: "0", label: "Raw video bytes\nleave the intersection" },
            { num: "35+", label: "Vehicles detected\nper frame" },
            { num: "100%", label: "DPDP Act compliant\ndata locality" },
        ];

        for (let i = 0; i < 4; i++) {
            const sx = 0.3 + i * 2.42;
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: sx, y: 1.15, w: 2.15, h: 1.38,
                fill: { color: C.midBg },
                line: { color: C.accentDk, width: 1 },
                rectRadius: 0.1,
                shadow: makeShadow()
            });
            s.addText(stats[i].num, {
                x: sx + 0.08, y: 1.22, w: 1.98, h: 0.72,
                fontSize: 38, fontFace: "Cambria", bold: true,
                color: C.amber, align: "center", margin: 0
            });
            s.addText(stats[i].label, {
                x: sx + 0.08, y: 1.92, w: 1.98, h: 0.5,
                fontSize: 10, fontFace: "Calibri",
                color: C.lightGray, align: "center", margin: 0
            });
        }

        // Four impact areas
        const impacts = [
            {
                icon: FaCheckCircle, color: C.greenLt, title: "Improved Road Compliance",
                body: "Immediate automated SMS feedback creates a direct enforcement loop — reducing repeat violations at monitored intersections."
            },
            {
                icon: FaShieldAlt, color: C.accentLt, title: "Proactive Accident Prevention",
                body: "Real-time drowsiness and phone-use detection alerts officers before accidents occur — not after."
            },
            {
                icon: FaUsers, color: C.amber, title: "Officer Workflow Relief",
                body: "Confidence-gated automation handles high-certainty cases. Officers focus exclusively on ambiguous or borderline violations."
            },
            {
                icon: FaLock, color: C.gold, title: "Legal & Privacy Compliance",
                body: "Fully aligned with India's DPDP Act. All visual data processed and stored locally — no citizen footage enters external servers."
            },
        ];

        for (let i = 0; i < 4; i++) {
            const ix = 0.3 + i * 2.42;
            const imp = impacts[i];

            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: ix, y: 2.72, w: 2.15, h: 2.68,
                fill: { color: C.cardBg },
                line: { color: imp.color, width: 1 },
                rectRadius: 0.1,
                shadow: makeShadow()
            });

            s.addShape(pres.shapes.OVAL, {
                x: ix + 0.67, y: 2.86, w: 0.82, h: 0.82,
                fill: { color: imp.color, transparency: 82 },
                line: { color: imp.color, width: 1 }
            });
            const ic = await iconPng(imp.icon, imp.color, 128);
            s.addImage({ data: ic, x: ix + 0.73, y: 2.92, w: 0.7, h: 0.7 });

            s.addText(imp.title, {
                x: ix + 0.1, y: 3.82, w: 1.96, h: 0.5,
                fontSize: 11.5, fontFace: "Cambria", bold: true,
                color: imp.color, align: "center", margin: 0
            });
            s.addText(imp.body, {
                x: ix + 0.1, y: 4.35, w: 1.96, h: 1.0,
                fontSize: 10, fontFace: "Calibri",
                color: C.lightGray, align: "center", margin: 0
            });
        }

        s.addNotes("GARUDA creates safer streets, saves administrative time, protects citizen privacy through local processing, and maintains a transparent, auditable enforcement trail. Fully DPDP Act compliant. Thank you — we are open to your questions.");
    }

    // ════════════════════════════════════════════════════════════════════════════
    // SLIDE 10 — CLOSING / THANK YOU
    // ════════════════════════════════════════════════════════════════════════════
    {
        const s = pres.addSlide();
        s.background = { color: C.darkBg };

        // Grid background
        for (let i = 0; i < 20; i++) {
            s.addShape(pres.shapes.LINE, {
                x: i * 0.55, y: 0, w: 0, h: 5.625,
                line: { color: "162030", width: 0.5 }
            });
        }
        for (let j = 0; j < 12; j++) {
            s.addShape(pres.shapes.LINE, {
                x: 0, y: j * 0.5, w: 10, h: 0,
                line: { color: "162030", width: 0.5 }
            });
        }

        // Central glow oval
        s.addShape(pres.shapes.OVAL, {
            x: 2.8, y: 0.6, w: 4.4, h: 4.4,
            fill: { color: C.accentDk, transparency: 88 },
            line: { color: C.accent, width: 1, dashType: "dash" }
        });

        s.addText("GARUDA", {
            x: 0.5, y: 1.0, w: 9, h: 1.2,
            fontSize: 72, fontFace: "Cambria", bold: true,
            color: C.white, align: "center", charSpacing: 10, margin: 0
        });

        s.addText("Gridlock Guardian", {
            x: 0.5, y: 2.2, w: 9, h: 0.55,
            fontSize: 24, fontFace: "Calibri",
            color: C.accentLt, align: "center", charSpacing: 4, margin: 0
        });

        // Three closing pillars
        const pillars = ["Edge Intelligence", "Privacy-First", "Zero Cloud Dependency"];
        const pxs = [1.2, 3.88, 6.55];
        for (let i = 0; i < 3; i++) {
            s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
                x: pxs[i], y: 3.0, w: 2.1, h: 0.48,
                fill: { color: C.midBg },
                line: { color: C.accent, width: 0.8 },
                rectRadius: 0.06
            });
            s.addText(pillars[i], {
                x: pxs[i], y: 3.04, w: 2.1, h: 0.38,
                fontSize: 12, fontFace: "Calibri", bold: true,
                color: C.offWhite, align: "center", margin: 0
            });
        }

        s.addText("Thank You — Questions Welcome", {
            x: 0.5, y: 3.72, w: 9, h: 0.48,
            fontSize: 18, fontFace: "Calibri",
            color: C.gray, align: "center", margin: 0
        });

        s.addText("Team CodeKrafters  ·  2025", {
            x: 0.5, y: 5.1, w: 9, h: 0.3,
            fontSize: 11, fontFace: "Calibri",
            color: "445566", align: "center", margin: 0
        });

        s.addNotes("Thank you. GARUDA is the future of smart, localized public safety. We are open to your questions.");
    }

    const outPath = "./GARUDA_Presentation.pptx";
    await pres.writeFile({ fileName: outPath });
    console.log("Written:", outPath);
}

build().catch(e => { console.error(e); process.exit(1); });