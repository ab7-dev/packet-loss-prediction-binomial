import os
import sys
import json
import time

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from flask import Flask, Response, request, jsonify, send_from_directory
from backend.monitor import NetworkMonitor

# Determine frontend path
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
monitor = NetworkMonitor()

@app.route("/")
def index():
    """Serves the main dashboard HTML."""
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/<path:filename>")
def serve_static(filename):
    """Serves static assets and HTML pages with or without .html extension."""
    target_path = os.path.join(FRONTEND_DIR, filename)
    if os.path.isfile(target_path):
        return send_from_directory(FRONTEND_DIR, filename)
    if os.path.isfile(target_path + ".html"):
        return send_from_directory(FRONTEND_DIR, filename + ".html")
    return send_from_directory(FRONTEND_DIR, filename)

@app.route("/status", methods=["GET"])
def get_probing_status():
    """Returns operational status {running, simulated_loss, target, n, k, alpha}."""
    return jsonify(monitor.get_status())

@app.route("/pause", methods=["POST"])
def pause_probing():
    """Stops the background probe loop without clearing history."""
    monitor.pause()
    return jsonify({"status": "success", "running": False})

@app.route("/resume", methods=["POST"])
def resume_probing():
    """Starts the background probe loop."""
    monitor.resume()
    return jsonify({"status": "success", "running": True})

@app.route("/probing", methods=["POST"])
def set_probing():
    """Sets probing running state {running: true/false}."""
    data = request.get_json(silent=True) or {}
    running = bool(data.get("running", True))
    if running:
        monitor.resume()
    else:
        monitor.pause()
    return jsonify({"status": "success", "running": monitor.is_running})

@app.route("/api/status", methods=["GET"])
def get_status():
    """Returns current statistical snapshot."""
    return jsonify(monitor.get_current_snapshot())

@app.route("/config", methods=["POST"])
def update_config():
    """Updates monitoring parameters."""
    data = request.get_json(silent=True) or {}
    monitor.update_config(data)
    return jsonify({
        "status": "success",
        "message": "Configuration updated",
        "snapshot": monitor.get_current_snapshot()
    })

@app.route("/stream")
def sse_stream():
    """Server-Sent Events endpoint broadcasting live telemetry updates."""
    def generate():
        while True:
            try:
                snapshot = monitor.get_current_snapshot()
                payload = json.dumps(snapshot)
                yield f"data: {payload}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {{\"error\": \"{str(e)}\"}}\n\n"
            time.sleep(1.0)

    response = Response(
        generate(),
        mimetype="text/event-stream"
    )
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    response.headers["Connection"] = "keep-alive"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

@app.route("/history", methods=["GET"])
def get_history():
    """Returns all recorded window items."""
    with monitor.lock:
        return jsonify({
            "target": monitor.target,
            "total_windows": len(monitor.history),
            "history": list(monitor.history)
        })

@app.route("/reset", methods=["POST"])
def reset():
    """Clears history and alerts."""
    monitor.reset()
    return jsonify({"status": "success", "message": "History and alerts reset."})

@app.route("/export", methods=["GET"])
def export():
    """Exports CSV of all windows."""
    csv_data = monitor.export_csv()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=packet_loss_binomial_data.csv",
            "Cache-Control": "no-cache"
        }
    )

if __name__ == "__main__":
    print("=" * 60)
    print("Packet Loss Prediction in Data Networks Using Binomial Distribution")
    print("Live Server running at http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
