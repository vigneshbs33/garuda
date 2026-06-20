"""
GARUDA — Federated Learning Aggregation Server
=================================================
Runs on the central machine (NOT on camera nodes).
Aggregates model weight updates from all participating cameras
using the FedAvg algorithm, then pushes improved global model back.

Schedule: Every Sunday 2 AM (via cron / Windows Task Scheduler)
Framework: Flower (flwr)

Usage:
    python -m ml.federated.server \
        --port 8080 \
        --min-cameras 3 \
        --rounds 3
"""
from __future__ import annotations

import argparse
import logging
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom strategy with logging
# ---------------------------------------------------------------------------

def _build_strategy(
    min_fit_cameras: int = 3,
    min_eval_cameras: int = 2,
    fraction_fit: float = 1.0,
):
    """
    Build a FedAvg strategy with custom aggregation hooks.
    """
    try:
        import flwr as fl  # type: ignore
        import flwr.server.strategy as strategies

        class LoggedFedAvg(strategies.FedAvg):
            """FedAvg with per-round accuracy logging"""

            def aggregate_fit(self, server_round, results, failures):
                logger.info(
                    "Round %d: %d cameras reporting, %d failures",
                    server_round, len(results), len(failures),
                )
                aggregated = super().aggregate_fit(server_round, results, failures)

                if aggregated:
                    logger.info(
                        "Round %d: aggregation complete. "
                        "Samples used: %d",
                        server_round,
                        sum(n for _, n, _ in (r.metrics for r in results if hasattr(r, "metrics")) or []),
                    )
                return aggregated

            def aggregate_evaluate(self, server_round, results, failures):
                """Collect per-camera accuracy metrics"""
                agg = super().aggregate_evaluate(server_round, results, failures)
                if results:
                    camera_metrics = [
                        (r.metrics.get("camera_id", "?"), r.metrics.get("accuracy", 0.0))
                        for _, r in results
                    ]
                    logger.info(
                        "Round %d evaluation — camera accuracies: %s",
                        server_round,
                        {cam: f"{acc:.3f}" for cam, acc in camera_metrics},
                    )
                return agg

        return LoggedFedAvg(
            fraction_fit=fraction_fit,
            fraction_evaluate=1.0,
            min_fit_clients=min_fit_cameras,
            min_evaluate_clients=min_eval_cameras,
            min_available_clients=min_fit_cameras,
        )

    except ImportError:
        raise ImportError(
            "Flower not installed. Run: pip install flwr[simulation]"
        )


# ---------------------------------------------------------------------------
# Server entrypoint
# ---------------------------------------------------------------------------

def start_server(
    host: str = "0.0.0.0",
    port: int = 8080,
    num_rounds: int = 3,
    min_cameras: int = 3,
    min_eval_cameras: int = 2,
) -> None:
    """
    Start the Flower FL aggregation server.

    Parameters
    ----------
    host          : Bind address
    port          : Bind port
    num_rounds    : Number of training rounds per session
    min_cameras   : Minimum cameras that must participate
    min_eval_cameras: Minimum cameras for evaluation round
    """
    try:
        import flwr as fl  # type: ignore
    except ImportError:
        logger.error("Flower not installed. Run: pip install flwr[simulation]")
        return

    strategy = _build_strategy(
        min_fit_cameras=min_cameras,
        min_eval_cameras=min_eval_cameras,
    )

    server_address = f"{host}:{port}"
    logger.info(
        "Starting GARUDA FL server at %s | rounds=%d | min_cameras=%d",
        server_address, num_rounds, min_cameras,
    )

    fl.server.start_server(
        server_address=server_address,
        strategy=strategy,
        config=fl.server.ServerConfig(num_rounds=num_rounds),
    )

    logger.info("FL training session complete. Improved model ready for distribution.")


# ---------------------------------------------------------------------------
# Simulation mode (for testing without real edge nodes)
# ---------------------------------------------------------------------------

def simulate_training(
    num_cameras: int = 5,
    num_rounds: int = 3,
) -> None:
    """
    Run a local simulation with N virtual camera clients.
    Useful for testing the FL pipeline without actual Jetson hardware.

    Usage:
        python -c "from ml.federated.server import simulate_training; simulate_training()"
    """
    try:
        import flwr as fl  # type: ignore
        from ml.federated.client import TrafficViolationClient, LocalCorrectionDataset

        def client_fn(cid: str):
            db = LocalCorrectionDataset(f"evidence/sim_corrections_{cid}.db")
            client_obj = TrafficViolationClient(f"SIM-CAM-{cid}", db)
            return client_obj._get_fl_client()

        strategy = _build_strategy(
            min_fit_cameras=min(num_cameras, 2),
            min_eval_cameras=1,
            fraction_fit=1.0,
        )

        logger.info(
            "FL simulation: %d virtual cameras, %d rounds",
            num_cameras, num_rounds,
        )

        fl.simulation.start_simulation(
            client_fn=client_fn,
            num_clients=num_cameras,
            config=fl.server.ServerConfig(num_rounds=num_rounds),
            strategy=strategy,
        )

    except ImportError as e:
        logger.error("Simulation requires flwr[simulation]: %s", e)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="GARUDA FL Aggregation Server")
    parser.add_argument("--host",         default="0.0.0.0")
    parser.add_argument("--port",         type=int, default=8080)
    parser.add_argument("--rounds",       type=int, default=3)
    parser.add_argument("--min-cameras",  type=int, default=3)
    parser.add_argument("--simulate",     action="store_true",
                        help="Run local simulation instead of real server")
    parser.add_argument("--sim-cameras",  type=int, default=5)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    if args.simulate:
        simulate_training(num_cameras=args.sim_cameras, num_rounds=args.rounds)
    else:
        start_server(
            host=args.host,
            port=args.port,
            num_rounds=args.rounds,
            min_cameras=args.min_cameras,
        )


if __name__ == "__main__":
    main()
