/**
 * api.js - Shared Telemetry and State Management Client
 * Handles Server-Sent Events (SSE), API config synchronization,
 * probing control (/pause, /resume, /status), and instant data reset.
 */

window.NetTelemetry = (() => {
    let eventSource = null;
    let reconnectTimeout = null;
    let subscribers = [];
    let currentData = null;

    // Operational state from GET /status
    let state = {
        running: true,
        simulated_loss: 0,
        target: '8.8.8.8',
        n: 50,
        k: 3,
        alpha: 0.05
    };

    const subscribe = (callback) => {
        subscribers.push(callback);
        if (currentData) {
            callback(currentData);
        }
    };

    const notifySubscribers = (data) => {
        currentData = data;
        if (data.config) {
            state.running = data.config.is_running !== undefined ? data.config.is_running : state.running;
            state.simulated_loss = data.config.sim_loss_rate !== undefined ? data.config.sim_loss_rate : state.simulated_loss;
            state.target = data.config.target || state.target;
            state.n = data.config.n || state.n;
            state.k = data.config.k !== undefined ? data.config.k : state.k;
            state.alpha = data.config.alpha || state.alpha;
            updateSimulationBadge(state.simulated_loss);
        }
        subscribers.forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error("Subscriber update error:", err);
            }
        });
    };

    const updateSimulationBadge = (rate) => {
        const badge = document.getElementById('nav-sim-badge');
        const rateText = document.getElementById('nav-sim-rate');
        if (badge) {
            if (rate > 0) {
                badge.style.display = 'inline-flex';
                if (rateText) rateText.textContent = `${rate}%`;
            } else {
                badge.style.display = 'none';
            }
        }
    };

    const showToast = (message, isError = false) => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `glass-toast ${isError ? 'is--error' : ''}`;
        toast.innerHTML = `<span>${isError ? '⚠️' : '✓'}</span><span>${message}</span>`;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('is--visible');
        });

        setTimeout(() => {
            toast.classList.remove('is--visible');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 4000);
    };

    // Always fetch operational state from GET /status on page load (never local page state)
    const fetchStatus = async () => {
        try {
            const res = await fetch('/status');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            state.running = data.running;
            state.simulated_loss = data.simulated_loss;
            state.target = data.target;
            state.n = data.n;
            state.k = data.k;
            state.alpha = data.alpha;
            updateSimulationBadge(state.simulated_loss);
            return data;
        } catch (err) {
            console.error("Failed to fetch /status from backend:", err);
            showToast("Failed to connect to backend /status", true);
            throw err;
        }
    };

    const pause = async () => {
        try {
            const res = await fetch('/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            state.running = false;
            if (currentData && currentData.config) {
                currentData.config.is_running = false;
                notifySubscribers(currentData);
            }
            showToast("Probing paused");
            return data;
        } catch (err) {
            console.error("Failed to pause probing:", err);
            showToast("Failed to pause probing. Check connection.", true);
            throw err;
        }
    };

    const resume = async () => {
        try {
            const res = await fetch('/resume', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            state.running = true;
            if (currentData && currentData.config) {
                currentData.config.is_running = true;
                notifySubscribers(currentData);
            }
            showToast("Probing resumed");
            return data;
        } catch (err) {
            console.error("Failed to resume probing:", err);
            showToast("Failed to resume probing. Check connection.", true);
            throw err;
        }
    };

    const toggleProbing = async (currentlyRunning) => {
        if (currentlyRunning) {
            return await pause();
        } else {
            return await resume();
        }
    };

    const resetData = async () => {
        try {
            const res = await fetch('/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            // Fetch clean snapshot immediately
            const snapRes = await fetch('/api/status');
            const snapData = await snapRes.json();
            // Ensure running flag preserves current state
            if (snapData && snapData.config) {
                snapData.config.is_running = state.running;
            }
            notifySubscribers(snapData);
            showToast("All collected data cleared successfully");
            return data;
        } catch (err) {
            console.error("Failed to reset history:", err);
            showToast("Failed to reset data. Check connection.", true);
            throw err;
        }
    };

    const sendConfig = async (patch) => {
        try {
            const res = await fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.snapshot) {
                notifySubscribers(data.snapshot);
            }
            return data;
        } catch (err) {
            console.error("Failed to post configuration:", err);
            showToast("Failed to update configuration", true);
            throw err;
        }
    };

    const connectSSE = () => {
        if (eventSource) {
            eventSource.close();
        }

        const dot = document.getElementById('conn-dot');
        const label = document.getElementById('conn-label');
        if (dot) dot.className = 'nav__status-dot offline';
        if (label) label.textContent = 'CONNECTING';

        eventSource = new EventSource('/stream');

        eventSource.onopen = () => {
            if (dot) dot.className = 'nav__status-dot online';
            if (label) label.textContent = 'LIVE';
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                notifySubscribers(data);
            } catch (e) {
                console.error("Error parsing telemetry stream:", e);
            }
        };

        eventSource.onerror = () => {
            if (dot) dot.className = 'nav__status-dot offline';
            if (label) label.textContent = 'OFFLINE';
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(connectSSE, 3000);
        };
    };

    // Client-side exact binomial computation for client calculators
    const binomialCdf = (k, n, p) => {
        if (k < 0) return 0;
        if (k >= n) return 1;
        if (p <= 0) return 1;
        if (p >= 1) return 0;
        let sum = 0;
        const logFact = (x) => {
            let res = 0;
            for (let i = 2; i <= x; i++) res += Math.log(i);
            return res;
        };
        for (let x = 0; x <= k; x++) {
            const logComb = logFact(n) - logFact(x) - logFact(n - x);
            const prob = Math.exp(logComb + x * Math.log(p) + (n - x) * Math.log(1 - p));
            sum += prob;
        }
        return Math.min(1.0, Math.max(0.0, sum));
    };

    const computePgtK = (n, k, p) => {
        return Math.max(0, 1.0 - binomialCdf(k, n, p));
    };

    // Initial load: fetch /status, then full snapshot, then start SSE
    const init = async () => {
        try {
            await fetchStatus();
            const res = await fetch('/api/status');
            const data = await res.json();
            notifySubscribers(data);
        } catch (err) {
            console.warn("Initial initialization warning:", err);
        } finally {
            connectSSE();
        }
    };

    init();

    return {
        subscribe,
        fetchStatus,
        pause,
        resume,
        toggleProbing,
        resetData,
        sendConfig,
        showToast,
        getState: () => ({ ...state }),
        getCurrentData: () => currentData,
        computePgtK
    };
})();
