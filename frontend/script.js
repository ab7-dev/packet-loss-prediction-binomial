/**
 * Packet Loss Prediction in Data Networks Using Binomial Distribution
 * Live Frontend Controller and Visualization Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    // State Store
    const state = {
        target: '1.1.1.1',
        n: 50,
        k: 3,
        alpha: 0.05,
        simLossRate: 0,
        isRunning: true,
        currentPhat: 0.0,
        eventSource: null,
        reconnectTimer: null
    };

    // DOM Element References
    const elements = {
        connDot: document.getElementById('conn-dot'),
        connText: document.getElementById('conn-text'),
        simBanner: document.getElementById('sim-banner'),
        simBannerRate: document.getElementById('sim-banner-rate'),
        
        // Hero
        heroPhat: document.getElementById('hero-p-hat'),
        heroCiText: document.getElementById('hero-ci-text'),
        heroTargetPill: document.getElementById('hero-target-pill'),
        heroWindowN: document.getElementById('hero-window-n'),
        heroWindowsCount: document.getElementById('hero-windows-count'),
        heroDecisionBadge: document.getElementById('hero-decision-badge'),
        heroDecisionText: document.getElementById('hero-decision-text'),
        heroRiskStat: document.getElementById('hero-risk-stat'),
        heroAlphaStat: document.getElementById('hero-alpha-stat'),
        heroLatencyStat: document.getElementById('hero-latency-stat'),

        // Controls
        btnToggleEngine: document.getElementById('btn-toggle-engine'),
        btnToggleIcon: document.getElementById('btn-toggle-icon'),
        btnToggleText: document.getElementById('btn-toggle-text'),
        btnResetData: document.getElementById('btn-reset-data'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        targetSelector: document.getElementById('target-selector'),
        customTargetText: document.getElementById('custom-target-text'),
        btnApplyCustomTarget: document.getElementById('btn-apply-custom-target'),
        stepperNVal: document.getElementById('stepper-n-val'),
        btnNMinus: document.getElementById('btn-n-minus'),
        btnNPlus: document.getElementById('btn-n-plus'),
        stepperKVal: document.getElementById('stepper-k-val'),
        btnKMinus: document.getElementById('btn-k-minus'),
        btnKPlus: document.getElementById('btn-k-plus'),
        alphaPills: document.querySelectorAll('.alpha-pill'),
        simSlider: document.getElementById('sim-loss-slider'),
        simSliderVal: document.getElementById('sim-slider-val'),
        simQuickBtns: document.querySelectorAll('.sim-quick-btn'),

        // Live Monitor
        riskGaugeCircle: document.getElementById('risk-gauge-circle'),
        riskGaugeNumber: document.getElementById('risk-gauge-number'),
        statWindowLostSent: document.getElementById('stat-window-lost-sent'),
        statWindowLossPct: document.getElementById('stat-window-loss-pct'),
        statPhatRaw: document.getElementById('stat-p-hat-raw'),
        statWilsonCi: document.getElementById('stat-wilson-ci'),
        statLatencyVal: document.getElementById('stat-latency-val'),

        // Decision Engine
        mainDecisionBanner: document.getElementById('main-decision-banner'),
        decisionIconSymbol: document.getElementById('decision-icon-symbol'),
        decisionBannerStatus: document.getElementById('decision-banner-status'),
        decisionFormulaText: document.getElementById('decision-formula-text'),
        proofPGtK: document.getElementById('proof-p-gt-k'),
        proofAlpha: document.getElementById('proof-alpha'),
        proofCondition: document.getElementById('proof-condition'),
        proofAction: document.getElementById('proof-action'),
        alertsTableBody: document.getElementById('alerts-table-body'),
        alertCounterBadge: document.getElementById('alert-counter-badge'),

        // Model
        modelMeanVal: document.getElementById('model-mean-val'),
        modelVarianceVal: document.getElementById('model-variance-val'),
        modelStdVal: document.getElementById('model-std-val'),
        modelPGteK: document.getElementById('model-p-gte-k'),

        // Justification
        justificationText: document.getElementById('justification-text'),

        // Validation (Chi-Square)
        chiStatusBadge: document.getElementById('chi-status-badge'),
        chiProgressText: document.getElementById('chi-progress-text'),
        chiProgressFill: document.getElementById('chi-progress-fill'),
        chiStatVal: document.getElementById('chi-stat-val'),
        chiDfVal: document.getElementById('chi-df-val'),
        chiPvalVal: document.getElementById('chi-pval-val'),
        chiConclusionVal: document.getElementById('chi-conclusion-val'),
        chiExplanationText: document.getElementById('chi-explanation-text'),
        mergedBinsWrap: document.getElementById('merged-bins-wrap'),
        mergedBinsTbody: document.getElementById('merged-bins-tbody'),

        // Comparison Table
        comparisonTbody: document.getElementById('comparison-tbody')
    };

    // --- 1. Background Canvas Noise (Replicating Webflow Reference) ---
    const initNoise = () => {
        const canvas = document.getElementById('noise-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let wWidth = window.innerWidth;
        let wHeight = window.innerHeight;
        canvas.width = wWidth;
        canvas.height = wHeight;
        
        const noiseData = [];
        let frame = 0;
        
        for (let i = 0; i < 6; i++) {
            const idata = ctx.createImageData(wWidth, wHeight);
            const buffer32 = new Uint32Array(idata.data.buffer);
            const len = buffer32.length;
            for (let j = 0; j < len; j++) {
                if (Math.random() < 0.08) {
                    buffer32[j] = 0xffffffff;
                }
            }
            noiseData.push(idata);
        }
        
        const renderLoop = () => {
            frame = (frame + 1) % 6;
            ctx.putImageData(noiseData[frame], 0, 0);
            setTimeout(() => {
                requestAnimationFrame(renderLoop);
            }, 60);
        };
        
        renderLoop();
        
        window.addEventListener('resize', () => {
            wWidth = window.innerWidth;
            wHeight = window.innerHeight;
            canvas.width = wWidth;
            canvas.height = wHeight;
        });
    };
    initNoise();

    // --- 2. Initialize Chart.js Instances ---
    let lossHistoryChart = null;
    let pmfOverlayChart = null;

    const initCharts = () => {
        // Global Chart.js defaults for sleek dark aesthetics
        Chart.defaults.color = '#eeedf2';
        Chart.defaults.font.family = "'DM Sans', sans-serif";

        // Chart 1: Loss History Chart
        const ctxHistory = document.getElementById('lossHistoryChart')?.getContext('2d');
        if (ctxHistory) {
            const grad = ctxHistory.createLinearGradient(0, 0, 0, 300);
            grad.addColorStop(0, 'rgba(92, 49, 255, 0.45)');
            grad.addColorStop(1, 'rgba(92, 49, 255, 0.0)');

            lossHistoryChart = new Chart(ctxHistory, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Losses (Packets)',
                            data: [],
                            borderColor: '#def141',
                            borderWidth: 2.5,
                            backgroundColor: grad,
                            fill: true,
                            tension: 0.35,
                            pointBackgroundColor: '#def141',
                            pointBorderColor: '#1c1c1c',
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Loss %',
                            data: [],
                            borderColor: '#f88cd4',
                            borderWidth: 1.8,
                            borderDash: [5, 4],
                            backgroundColor: 'transparent',
                            fill: false,
                            tension: 0.3,
                            pointRadius: 0,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 400 },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                boxWidth: 12,
                                usePointStyle: true,
                                font: { size: 11, weight: 'bold' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(28, 19, 65, 0.9)',
                            titleFont: { family: "'Fahkwang', sans-serif" },
                            padding: 10,
                            borderColor: 'rgba(238, 237, 242, 0.2)',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.06)' },
                            ticks: { maxTicksLimit: 8, font: { size: 10 } }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            beginAtZero: true,
                            grid: { color: 'rgba(255, 255, 255, 0.06)' },
                            title: { display: true, text: 'Lost Packets', color: '#def141', font: { size: 10 } }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            beginAtZero: true,
                            max: 100,
                            grid: { drawOnChartArea: false },
                            title: { display: true, text: 'Loss %', color: '#f88cd4', font: { size: 10 } }
                        }
                    }
                }
            });
        }

        // Chart 2: Model PMF Overlay Chart (Dual Type: Bar + Line)
        const ctxPmf = document.getElementById('pmfOverlayChart')?.getContext('2d');
        if (ctxPmf) {
            pmfOverlayChart = new Chart(ctxPmf, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [
                        {
                            type: 'bar',
                            label: 'Empirical Observed Freq',
                            data: [],
                            backgroundColor: 'rgba(248, 140, 212, 0.55)',
                            borderColor: '#f88cd4',
                            borderWidth: 1.5,
                            borderRadius: 6,
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Theoretical Binomial PMF',
                            data: [],
                            borderColor: '#def141',
                            backgroundColor: 'rgba(222, 241, 65, 0.15)',
                            borderWidth: 2.5,
                            pointBackgroundColor: '#def141',
                            pointRadius: 4,
                            fill: true,
                            tension: 0.35,
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 400 },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                boxWidth: 12,
                                usePointStyle: true,
                                font: { size: 11, weight: 'bold' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(28, 19, 65, 0.9)',
                            padding: 10,
                            borderColor: 'rgba(238, 237, 242, 0.2)',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Dropped Packets (x)', color: '#eeedf2', font: { size: 11 } },
                            grid: { color: 'rgba(255, 255, 255, 0.06)' }
                        },
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Probability P(X = x)', color: '#eeedf2', font: { size: 11 } },
                            grid: { color: 'rgba(255, 255, 255, 0.06)' }
                        }
                    }
                }
            });
        }
    };
    initCharts();

    // --- 3. Animated Number Counter Helper ---
    const animateNumber = (element, start, end, duration = 500, decimals = 2) => {
        if (!element) return;
        const startTime = performance.now();
        const diff = end - start;
        
        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1.0);
            const currentVal = start + diff * (1 - Math.pow(1 - progress, 3)); // easeOutCubic
            element.textContent = currentVal.toFixed(decimals);
            if (progress < 1.0) {
                requestAnimationFrame(step);
            } else {
                element.textContent = end.toFixed(decimals);
            }
        };
        requestAnimationFrame(step);
    };

    // --- 4. Render Telemetry Updates ---
    const updateDashboard = (data) => {
        if (!data) return;

        // Update Configuration in State
        const cfg = data.config || {};
        state.target = cfg.target || state.target;
        state.n = cfg.n || state.n;
        state.k = cfg.k !== undefined ? cfg.k : state.k;
        state.alpha = cfg.alpha || state.alpha;
        state.simLossRate = cfg.sim_loss_rate || 0;
        state.isRunning = cfg.is_running !== undefined ? cfg.is_running : true;

        // 1. Navbar & Simulation Indicators
        if (state.simLossRate > 0) {
            elements.simBanner.classList.remove('hidden');
            elements.simBannerRate.textContent = `${state.simLossRate}%`;
        } else {
            elements.simBanner.classList.add('hidden');
        }

        // Engine Toggle Button State
        if (state.isRunning) {
            elements.btnToggleText.textContent = 'PAUSE PROBING';
            elements.btnToggleIcon.textContent = '⏸';
            elements.btnToggleEngine.classList.remove('lime-accent');
            elements.btnToggleEngine.classList.add('primary-glow');
        } else {
            elements.btnToggleText.textContent = 'RESUME PROBING';
            elements.btnToggleIcon.textContent = '▶';
            elements.btnToggleEngine.classList.remove('primary-glow');
            elements.btnToggleEngine.classList.add('lime-accent');
        }

        // Stepper Displays
        elements.stepperNVal.textContent = state.n;
        elements.stepperKVal.textContent = state.k;
        elements.simSlider.value = state.simLossRate;
        elements.simSliderVal.textContent = state.simLossRate;

        // Target Selector sync
        if (elements.targetSelector) {
            let found = false;
            for (let opt of elements.targetSelector.options) {
                if (opt.value === state.target) {
                    elements.targetSelector.value = state.target;
                    found = true;
                    break;
                }
            }
            if (!found) {
                elements.customTargetText.value = state.target;
            }
        }

        // Alpha Pills Sync
        elements.alphaPills.forEach(pill => {
            const pillVal = parseFloat(pill.getAttribute('data-alpha'));
            if (Math.abs(pillVal - state.alpha) < 0.001) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });

        // 2. Hero Section
        const stats = data.stats || {};
        const pLossPct = stats.p_hat_pct || 0.0;
        animateNumber(elements.heroPhat, state.currentPhat, pLossPct, 400, 2);
        state.currentPhat = pLossPct;

        elements.heroCiText.textContent = `[${(stats.ci_lower_pct || 0).toFixed(2)}% — ${(stats.ci_upper_pct || 0).toFixed(2)}%]`;
        elements.heroTargetPill.textContent = state.target;
        elements.heroWindowN.textContent = `n = ${state.n}`;
        elements.heroWindowsCount.textContent = stats.windows_count || 0;

        const isAlert = stats.decision === 'ALERT';
        elements.heroDecisionBadge.classList.toggle('is-alert', isAlert);
        elements.heroDecisionText.textContent = stats.decision || 'NORMAL';
        elements.heroRiskStat.textContent = `${(stats.p_gt_k_pct || 0).toFixed(2)}%`;
        elements.heroAlphaStat.textContent = state.alpha.toFixed(2);
        
        const latestWin = data.latest_window || {};
        elements.heroLatencyStat.textContent = latestWin.latency_ms !== null && latestWin.latency_ms !== undefined ? `${latestWin.latency_ms} ms` : '-- ms';

        // 3. Live Monitor Telemetry
        elements.statWindowLostSent.textContent = `${latestWin.lost || 0} / ${latestWin.sent || state.n}`;
        elements.statWindowLossPct.textContent = `${(latestWin.loss_pct || 0).toFixed(2)}%`;
        elements.statPhatRaw.textContent = (stats.p_hat || 0).toFixed(4);
        elements.statWilsonCi.textContent = `[${(stats.ci_lower_pct || 0).toFixed(2)}%, ${(stats.ci_upper_pct || 0).toFixed(2)}%]`;
        elements.statLatencyVal.textContent = latestWin.latency_ms !== null && latestWin.latency_ms !== undefined ? `${latestWin.latency_ms} ms` : '-- ms';

        // Risk Meter (Conic Gradient Gauge)
        const riskPct = Math.min(100, Math.max(0, stats.p_gt_k_pct || 0));
        elements.riskGaugeNumber.textContent = `${riskPct.toFixed(1)}%`;
        const gaugeColor = isAlert ? 'var(--alert-red)' : 'var(--safe-green)';
        elements.riskGaugeCircle.style.background = `conic-gradient(${gaugeColor} ${riskPct * 3.6}deg, rgba(255, 255, 255, 0.08) ${riskPct * 3.6}deg)`;

        // 4. Decision Engine Banner & Proof
        elements.mainDecisionBanner.className = `decision-banner ${isAlert ? 'banner-alert' : 'banner-normal'}`;
        elements.decisionBannerStatus.textContent = stats.decision || 'NORMAL';
        elements.decisionIconSymbol.textContent = isAlert ? '⚠' : '✓';
        elements.decisionFormulaText.textContent = `P(X > ${state.k}) = ${(stats.p_gt_k_pct || 0).toFixed(2)}% ${isAlert ? '>' : '≤'} α (${state.alpha.toFixed(2)})`;
        
        elements.proofPGtK.textContent = (stats.p_gt_k || 0).toFixed(4);
        elements.proofAlpha.textContent = state.alpha.toFixed(4);
        elements.proofCondition.textContent = `P(X > ${state.k}) ${isAlert ? '>' : '≤'} α`;
        elements.proofCondition.className = `cell-val ${isAlert ? 'action-alert' : 'action-normal'}`;
        elements.proofAction.textContent = isAlert ? 'Throttle / Reroute Traffic' : 'Maintain Optimal Routing';
        elements.proofAction.className = `cell-val ${isAlert ? 'action-alert' : 'action-normal'}`;

        // Alert Log Table
        const alerts = data.alert_log || [];
        elements.alertCounterBadge.textContent = `${alerts.length} Incidents`;
        if (alerts.length > 0) {
            elements.alertsTableBody.innerHTML = alerts.map(a => `
                <tr>
                    <td><code>${a.timestamp}</code></td>
                    <td><strong>${a.target}</strong></td>
                    <td>${a.lost} / ${a.sent}</td>
                    <td>${(a.p_hat * 100).toFixed(2)}%</td>
                    <td><span class="action-alert">${(a.p_gt_k * 100).toFixed(2)}%</span></td>
                    <td><span class="active-host-badge" style="background: rgba(234, 56, 76, 0.25); color: #ea384c;">ALERT</span></td>
                </tr>
            `).join('');
        } else {
            elements.alertsTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="6">No alerts recorded yet. Network operating within nominal thresholds.</td>
                </tr>
            `;
        }

        // 5. Theoretical Model Overlay (CO2)
        elements.modelMeanVal.textContent = (stats.mean || 0).toFixed(2);
        elements.modelVarianceVal.textContent = (stats.variance || 0).toFixed(3);
        elements.modelStdVal.textContent = (stats.std_dev || 0).toFixed(3);
        elements.modelPGteK.textContent = `${(stats.p_gte_k_pct || 0).toFixed(2)}%`;

        // 6. Justification Text (CO4)
        if (data.explanation) {
            elements.justificationText.textContent = data.explanation;
        }

        // 7. Validation / Chi-Square (CO5)
        const chi = data.chi_square || {};
        const count = chi.windows_count || 0;
        const required = chi.min_required || 30;
        const progPct = Math.min(100, (count / required) * 100);
        elements.chiProgressText.textContent = `${count} / ${required} Windows`;
        elements.chiProgressFill.style.width = `${progPct}%`;

        if (chi.status === 'complete') {
            elements.chiStatusBadge.textContent = 'Hypothesis Test Complete';
            elements.chiStatVal.textContent = chi.statistic !== null ? chi.statistic.toFixed(4) : '--';
            elements.chiDfVal.textContent = chi.df !== null ? chi.df : '--';
            elements.chiPvalVal.textContent = chi.p_value !== null ? chi.p_value.toFixed(4) : '--';
            
            const fits = chi.conclusion === 'fits binomial model';
            elements.chiConclusionVal.textContent = chi.conclusion.toUpperCase();
            elements.chiConclusionVal.className = `chi-metric-val ${fits ? 'conclusion-fit' : 'conclusion-reject'}`;
            elements.chiExplanationText.textContent = chi.explanation || '';

            // Render Merged Bins Contingency Table
            if (chi.merged_bins && chi.merged_bins.length > 0) {
                elements.mergedBinsWrap.style.display = 'block';
                elements.mergedBinsTbody.innerHTML = chi.merged_bins.map(b => {
                    const residual = (b.observed - b.expected).toFixed(2);
                    const cellChi = (((b.observed - b.expected) ** 2) / b.expected).toFixed(3);
                    return `
                        <tr>
                            <td><strong>Bin [${b.label}]</strong></td>
                            <td>${b.expected.toFixed(2)}</td>
                            <td>${b.observed}</td>
                            <td>${residual}</td>
                            <td><code>${cellChi}</code></td>
                        </tr>
                    `;
                }).join('');
            }
        } else {
            elements.chiStatusBadge.textContent = `Collecting Data (${count}/${required})`;
            elements.chiStatVal.textContent = '--';
            elements.chiDfVal.textContent = '--';
            elements.chiPvalVal.textContent = '--';
            elements.chiConclusionVal.textContent = chi.conclusion || 'Collecting Data';
            elements.chiConclusionVal.className = 'chi-metric-val conclusion-pending';
            elements.mergedBinsWrap.style.display = 'none';
        }

        // 8. Multi-target Comparison Table
        const targets = data.target_comparison || [];
        if (targets.length > 0) {
            elements.comparisonTbody.innerHTML = targets.map(t => {
                const isSafest = t.is_safest;
                const isActive = t.is_active;
                return `
                    <tr class="${isActive ? 'row-active-target' : ''}">
                        <td><strong>${t.target}</strong></td>
                        <td>${isActive ? '<span class="active-host-badge">CURRENT ACTIVE</span>' : '<button class="btn-mini-apply btn-switch-target" data-target="' + t.target + '">SWITCH</button>'}</td>
                        <td>${t.total_sent}</td>
                        <td>${t.total_lost}</td>
                        <td>${t.p_hat.toFixed(2)}%</td>
                        <td><strong class="${t.risk_pct > state.alpha * 100 ? 'action-alert' : 'action-normal'}">${t.risk_pct.toFixed(2)}%</strong></td>
                        <td><span class="${t.decision === 'ALERT' ? 'action-alert' : 'action-normal'}">${t.status}</span></td>
                        <td>${isSafest ? '<span class="safest-badge">★ SAFEST ROUTE</span>' : '<span style="color:var(--text-muted)">Alternate</span>'}</td>
                    </tr>
                `;
            }).join('');

            // Attach click listeners to Switch Target buttons
            document.querySelectorAll('.btn-switch-target').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const chosen = e.target.getAttribute('data-target');
                    if (chosen) sendConfig({ target: chosen });
                });
            });
        }

        // 9. Update Charts
        const charts = data.charts || {};
        if (lossHistoryChart && charts.history_labels) {
            lossHistoryChart.data.labels = charts.history_labels;
            lossHistoryChart.data.datasets[0].data = charts.history_losses;
            lossHistoryChart.data.datasets[1].data = charts.history_pcts;
            lossHistoryChart.update('none');
        }

        if (pmfOverlayChart && charts.pmf_labels) {
            pmfOverlayChart.data.labels = charts.pmf_labels;
            pmfOverlayChart.data.datasets[0].data = charts.pmf_observed;
            pmfOverlayChart.data.datasets[1].data = charts.pmf_theoretical;
            pmfOverlayChart.update('none');
        }
    };

    // --- 5. Backend API Interaction ---
    const sendConfig = async (patch) => {
        try {
            const res = await fetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch)
            });
            const data = await res.json();
            if (data.snapshot) {
                updateDashboard(data.snapshot);
            }
        } catch (err) {
            console.error('Failed to update config:', err);
        }
    };

    // --- 6. Server-Sent Events (SSE) Telemetry Stream ---
    const connectSSE = () => {
        if (state.eventSource) {
            state.eventSource.close();
        }

        elements.connDot.className = 'status-dot offline';
        elements.connText.textContent = 'CONNECTING...';

        state.eventSource = new EventSource('/stream');

        state.eventSource.onopen = () => {
            elements.connDot.className = 'status-dot online';
            elements.connText.textContent = 'SSE LIVE';
        };

        state.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                updateDashboard(data);
            } catch (err) {
                console.error('Error parsing SSE event data:', err);
            }
        };

        state.eventSource.onerror = (err) => {
            console.warn('SSE stream disconnected, reconnecting in 3s...', err);
            elements.connDot.className = 'status-dot offline';
            elements.connText.textContent = 'RECONNECTING';
            state.eventSource.close();
            state.eventSource = null;
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = setTimeout(connectSSE, 3000);
        };
    };

    // Initial fallback fetch and connect
    fetch('/api/status')
        .then(res => res.json())
        .then(data => updateDashboard(data))
        .catch(err => console.warn('Initial fetch error:', err))
        .finally(() => connectSSE());

    // --- 7. Event Listeners ---

    // Engine Toggle (Start / Pause)
    elements.btnToggleEngine.addEventListener('click', () => {
        sendConfig({ is_running: !state.isRunning });
    });

    // Reset Data
    elements.btnResetData.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all collected windows and alerts?')) {
            try {
                await fetch('/reset', { method: 'POST' });
                const res = await fetch('/api/status');
                const data = await res.json();
                updateDashboard(data);
            } catch (err) {
                console.error('Reset failed:', err);
            }
        }
    });

    // Export CSV Trigger
    elements.btnExportCsv.addEventListener('click', () => {
        window.location.href = '/export';
    });

    // Target Selection Dropdown
    elements.targetSelector.addEventListener('change', (e) => {
        sendConfig({ target: e.target.value });
    });

    // Apply Custom Target
    elements.btnApplyCustomTarget.addEventListener('click', () => {
        const val = elements.customTargetText.value.trim();
        if (val) {
            sendConfig({ target: val });
        }
    });

    elements.customTargetText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = elements.customTargetText.value.trim();
            if (val) sendConfig({ target: val });
        }
    });

    // N Stepper (+/-)
    elements.btnNMinus.addEventListener('click', () => {
        const nextN = Math.max(10, state.n - 10);
        sendConfig({ n: nextN });
    });

    elements.btnNPlus.addEventListener('click', () => {
        const nextN = Math.min(200, state.n + 10);
        sendConfig({ n: nextN });
    });

    // K Stepper (+/-)
    elements.btnKMinus.addEventListener('click', () => {
        const nextK = Math.max(0, state.k - 1);
        sendConfig({ k: nextK });
    });

    elements.btnKPlus.addEventListener('click', () => {
        const nextK = Math.min(state.n, state.k + 1);
        sendConfig({ k: nextK });
    });

    // Alpha Pill Toggles
    elements.alphaPills.forEach(pill => {
        pill.addEventListener('click', () => {
            const val = parseFloat(pill.getAttribute('data-alpha'));
            if (!isNaN(val)) {
                sendConfig({ alpha: val });
            }
        });
    });

    // Simulated Loss Slider
    elements.simSlider.addEventListener('input', (e) => {
        elements.simSliderVal.textContent = e.target.value;
    });

    elements.simSlider.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        sendConfig({ sim_loss_rate: val });
    });

    // Quick Simulation Buttons
    elements.simQuickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const rate = parseFloat(btn.getAttribute('data-sim'));
            if (!isNaN(rate)) {
                elements.simSlider.value = rate;
                elements.simSliderVal.textContent = rate;
                sendConfig({ sim_loss_rate: rate });
            }
        });
    });
});
