import time
import os
import sys
import socket
import subprocess
import threading
import random
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional, Tuple

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.stats_engine import (
    estimate_p_hat,
    wilson_score_interval,
    binomial_stats,
    chi_square_goodness_of_fit,
    generate_explanation
)

DEFAULT_TARGETS = ["8.8.8.8", "1.1.1.1", "google.com"]

class NetworkMonitor:
    def __init__(self):
        self.lock = threading.Lock()
        
        # Configuration - Default target 8.8.8.8
        self.target = "8.8.8.8"
        self.all_targets = list(DEFAULT_TARGETS)
        self.n = 50                 # Packets per window
        self.k = 3                  # Alert threshold (loss > k)
        self.alpha = 0.05           # Significance level
        self.sim_loss_rate = 0.0    # 0.0 to 100.0%
        self.window_interval = 3.0  # Seconds between windows
        self.is_running = True
        
        # Probe method caching
        self.icmp_working = False
        self._check_icmp_capability()
        
        # Historical data
        self.history: List[Dict[str, Any]] = []
        self.target_histories: Dict[str, List[Dict[str, Any]]] = {
            t: [] for t in self.all_targets
        }
        self.alert_log: List[Dict[str, Any]] = []
        self.window_counter = 0
        
        # Thread control
        self._stop_event = threading.Event()
        self.worker_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.worker_thread.start()

    def _check_icmp_capability(self):
        """Checks if ICMP ping is permitted/functional on this system."""
        try:
            cmd = ["ping", "-n", "1", "-w", "800", "1.1.1.1"]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.5)
            self.icmp_working = (res.returncode == 0)
        except Exception:
            self.icmp_working = False

    def _probe_single(self, target: str, sim_rate: float) -> Tuple[bool, Optional[float]]:
        """
        Sends a single probe packet.
        1. Evaluates Bernoulli artificial loss if simulation is active.
        2. Tries ICMP ping. If blocked/failed, falls back to TCP connect on port 443.
        Returns: (success: bool, latency_ms: Optional[float])
        """
        # Bernoulli simulated loss
        if sim_rate > 0.0:
            if random.random() < (sim_rate / 100.0):
                return False, None
            # If not dropped by simulation, still measure real network or return synthetic low latency if offline
        
        # ICMP Probe
        if self.icmp_working:
            try:
                t0 = time.time()
                cmd = ["ping", "-n", "1", "-w", "800", target]
                res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.0)
                if res.returncode == 0:
                    dt = (time.time() - t0) * 1000
                    return True, dt
            except Exception:
                pass

        # TCP Connect Probe fallback (port 443 HTTPS / fallback port 80)
        ports = [443, 80]
        for port in ports:
            try:
                t0 = time.time()
                sock = socket.create_connection((target, port), timeout=1.0)
                sock.close()
                dt = (time.time() - t0) * 1000
                return True, dt
            except socket.timeout:
                continue
            except Exception:
                continue

        # If all probe attempts timed out or failed
        return False, None

    def _run_window_probes(self, target: str, n: int, sim_rate: float) -> Dict[str, Any]:
        """Runs n probes concurrently for a target and records aggregate results."""
        max_workers = min(25, max(5, n))
        latencies = []
        lost_count = 0

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(self._probe_single, target, sim_rate) for _ in range(n)]
            for future in futures:
                try:
                    success, latency = future.result()
                    if success:
                        if latency is not None:
                            latencies.append(latency)
                    else:
                        lost_count += 1
                except Exception:
                    lost_count += 1

        avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else None
        loss_pct = round((lost_count / n) * 100, 2) if n > 0 else 0.0
        
        return {
            "target": target,
            "sent": n,
            "lost": lost_count,
            "loss_pct": loss_pct,
            "latency_ms": avg_latency,
            "sim_rate": sim_rate
        }

    def _monitor_loop(self):
        """Continuous background loop executing probe windows."""
        while not self._stop_event.is_set():
            if not self.is_running:
                time.sleep(0.5)
                continue

            with self.lock:
                current_target = self.target
                n = self.n
                k = self.k
                alpha = self.alpha
                sim_rate = self.sim_loss_rate
                targets_to_compare = [t for t in self.all_targets if t != current_target]

            # 1. Probe primary active target
            window_res = self._run_window_probes(current_target, n, sim_rate)
            now_iso = datetime.now().strftime("%H:%M:%S")

            with self.lock:
                self.window_counter += 1
                record = {
                    "id": self.window_counter,
                    "timestamp": now_iso,
                    **window_res
                }
                self.history.append(record)
                if current_target not in self.target_histories:
                    self.target_histories[current_target] = []
                self.target_histories[current_target].append(record)
                
                # Check decision and alert logging
                p_hat, lost_total, sent_total = estimate_p_hat(self.history, w=30)
                stats = binomial_stats(n, p_hat, k, alpha)
                if stats["decision"] == "ALERT":
                    self.alert_log.append({
                        "id": len(self.alert_log) + 1,
                        "timestamp": now_iso,
                        "target": current_target,
                        "lost": window_res["lost"],
                        "sent": n,
                        "p_hat": round(p_hat, 4),
                        "p_gt_k": round(stats["p_gt_k"], 4),
                        "alpha": alpha
                    })
                    # Keep last 50 alerts
                    if len(self.alert_log) > 50:
                        self.alert_log.pop(0)

            # 2. Probe background targets for multi-target comparison table (lighter sample: 10 packets)
            for bg_target in targets_to_compare:
                if self._stop_event.is_set() or not self.is_running:
                    break
                bg_res = self._run_window_probes(bg_target, min(15, n), sim_rate=0.0) # real stats for bg targets
                with self.lock:
                    if bg_target not in self.target_histories:
                        self.target_histories[bg_target] = []
                    self.target_histories[bg_target].append({
                        "timestamp": now_iso,
                        **bg_res
                    })
                    if len(self.target_histories[bg_target]) > 50:
                        self.target_histories[bg_target].pop(0)

            time.sleep(self.window_interval)

    def get_current_snapshot(self) -> Dict[str, Any]:
        """Computes comprehensive statistical snapshot for dashboard."""
        with self.lock:
            target = self.target
            n = self.n
            k = self.k
            alpha = self.alpha
            sim_rate = self.sim_loss_rate
            is_running = self.is_running
            windows_count = len(self.history)
            recent_windows = self.history[-30:] if self.history else []
            latest_window = self.history[-1] if self.history else {
                "id": 0, "timestamp": "--:--:--", "target": target,
                "sent": n, "lost": 0, "loss_pct": 0.0, "latency_ms": None, "sim_rate": sim_rate
            }
            all_losses = [w["lost"] for w in self.history]
            alerts_copy = list(reversed(self.alert_log[-15:]))

        # Statistical Calculations
        p_hat, total_lost, total_sent = estimate_p_hat(recent_windows, w=30)
        ci_lower, ci_upper = wilson_score_interval(total_lost, total_sent, confidence=0.95)
        stats = binomial_stats(n, p_hat, k, alpha)
        
        explanation = generate_explanation(
            p_hat=p_hat,
            ci=(ci_lower, ci_upper),
            p_gt_k=stats["p_gt_k"],
            alpha=alpha,
            decision=stats["decision"],
            n=n,
            k=k,
            total_lost=total_lost,
            total_sent=total_sent,
            windows_count=len(recent_windows)
        )
        
        chi2 = chi_square_goodness_of_fit(all_losses, n, p_hat, min_windows=30)
        
        # Observed loss distribution for Model Chart overlay
        loss_counts: Dict[int, int] = {}
        for loss in all_losses:
            loss_counts[loss] = loss_counts.get(loss, 0) + 1
            
        observed_labels = stats["pmf_labels"]
        total_obs = max(1, len(all_losses))
        observed_frequencies = [
            round(loss_counts.get(x, 0) / total_obs, 4) for x in observed_labels
        ]

        # Multi-target comparison
        target_comparison = []
        with self.lock:
            for t in self.all_targets:
                t_history = self.target_histories.get(t, [])
                t_p_hat, t_lost, t_sent = estimate_p_hat(t_history, w=30)
                t_stats = binomial_stats(n, t_p_hat, k, alpha)
                target_comparison.append({
                    "target": t,
                    "is_active": (t == target),
                    "total_sent": t_sent,
                    "total_lost": t_lost,
                    "p_hat": round(t_p_hat * 100, 2),
                    "risk_pct": round(t_stats["p_gt_k"] * 100, 2),
                    "p_gt_k": t_stats["p_gt_k"],
                    "decision": t_stats["decision"],
                    "status": "Safe" if t_stats["decision"] == "NORMAL" else "High Risk"
                })

        # Identify safest target (lowest risk P(X > k) and lowest p_hat)
        if target_comparison:
            safest = min(target_comparison, key=lambda x: (x["risk_pct"], x["p_hat"]))
            for t_item in target_comparison:
                t_item["is_safest"] = (t_item["target"] == safest["target"])
        
        return {
            "config": {
                "target": target,
                "n": n,
                "k": k,
                "alpha": alpha,
                "sim_loss_rate": sim_rate,
                "is_running": is_running,
                "all_targets": self.all_targets
            },
            "latest_window": latest_window,
            "stats": {
                "p_hat": round(p_hat, 4),
                "p_hat_pct": round(p_hat * 100, 2),
                "ci_lower_pct": round(ci_lower * 100, 2),
                "ci_upper_pct": round(ci_upper * 100, 2),
                "mean": round(stats["mean"], 2),
                "variance": round(stats["variance"], 3),
                "std_dev": round(stats["std_dev"], 3),
                "p_gt_k": round(stats["p_gt_k"], 4),
                "p_gt_k_pct": round(stats["p_gt_k"] * 100, 2),
                "p_gte_k_pct": round(stats["p_gte_k"] * 100, 2),
                "decision": stats["decision"],
                "total_sent": total_sent,
                "total_lost": total_lost,
                "windows_count": windows_count
            },
            "charts": {
                "history_labels": [w["timestamp"] for w in self.history[-30:]],
                "history_losses": [w["lost"] for w in self.history[-30:]],
                "history_pcts": [w["loss_pct"] for w in self.history[-30:]],
                "pmf_labels": observed_labels,
                "pmf_theoretical": [round(p, 4) for p in stats["pmf_values"]],
                "pmf_observed": observed_frequencies
            },
            "explanation": explanation,
            "chi_square": chi2,
            "target_comparison": target_comparison,
            "alert_log": alerts_copy
        }

    def update_config(self, data: Dict[str, Any]):
        """Updates monitor configuration."""
        with self.lock:
            if "target" in data:
                new_target = str(data["target"]).strip()
                if new_target:
                    self.target = new_target
                    if new_target not in self.all_targets:
                        self.all_targets.append(new_target)
                    if new_target not in self.target_histories:
                        self.target_histories[new_target] = []
            if "n" in data:
                self.n = max(10, min(500, int(data["n"])))
            if "k" in data:
                self.k = max(0, min(self.n, int(data["k"])))
            if "alpha" in data:
                self.alpha = float(data["alpha"])
            if "sim_loss_rate" in data:
                self.sim_loss_rate = max(0.0, min(100.0, float(data["sim_loss_rate"])))
            if "is_running" in data:
                self.is_running = bool(data["is_running"])

    def pause(self):
        """Pauses the background probing loop without modifying history."""
        with self.lock:
            self.is_running = False

    def resume(self):
        """Resumes the background probing loop."""
        with self.lock:
            self.is_running = True

    def get_status(self) -> Dict[str, Any]:
        """Returns minimal operational status."""
        with self.lock:
            return {
                "running": self.is_running,
                "simulated_loss": self.sim_loss_rate,
                "target": self.target,
                "n": self.n,
                "k": self.k,
                "alpha": self.alpha
            }

    def reset(self):
        """Clears all historical records and alert logs while preserving running/paused state."""
        with self.lock:
            self.history.clear()
            for t in self.target_histories:
                self.target_histories[t].clear()
            self.alert_log.clear()
            self.window_counter = 0

    def export_csv(self) -> str:
        """Generates CSV string of all recorded windows."""
        with self.lock:
            records = list(self.history)
            
        lines = ["Window_ID,Timestamp,Target,Packets_Sent,Packets_Lost,Loss_Percentage,Latency_ms,Simulation_Rate_pct"]
        for r in records:
            lines.append(
                f"{r.get('id', '')},{r.get('timestamp', '')},{r.get('target', '')},"
                f"{r.get('sent', '')},{r.get('lost', '')},{r.get('loss_pct', '')},"
                f"{r.get('latency_ms', '')},{r.get('sim_rate', '')}"
            )
        return "\n".join(lines)

    def shutdown(self):
        self._stop_event.set()
        if self.worker_thread.is_alive():
            self.worker_thread.join(timeout=2.0)
