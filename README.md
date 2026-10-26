# Packet Loss Prediction in Data Networks Using Binomial Distribution

A full-stack, real-time network telemetry monitor and stochastic predictor. This project applies the **Binomial Distribution**, **Wilson Score Confidence Intervals**, **Predictive Tail Risk Probability**, and **Chi-Square Goodness-of-Fit Hypothesis Testing** to model, evaluate, and forecast packet loss across IP networks.

The user interface replicates the glassmorphism design language of `https://tricks-glassmorphism.webflow.io/` featuring animated floating mesh blobs, frosted glass containers (`backdrop-filter: blur`), custom steppers, and animated live telemetry streaming via Server-Sent Events (SSE).

---

## Course Outcome (CO) Mapping

| Tag | Course Outcome | Description | Dashboard Implementation |
|---|---|---|---|
| **CO1** | **Decision Engine & Alert Dispatcher** | Formulate stochastic decision boundaries under uncertainty | Evaluates $P(X > k) > \alpha$ in real time; renders glowing **NORMAL** (lime) or **ALERT** (crimson) badges with mathematical proofs and alert incident logs. |
| **CO2** | **Theoretical Model Overlay** | Compute discrete probability distributions and statistical moments | Plots theoretical $\text{Binomial}(n, \hat{p})$ Probability Mass Function (PMF) against empirical loss counts, displaying Mean $\mu = np$ and Variance $\sigma^2 = np(1-p)$. |
| **CO3** | **Live Telemetry & Risk Meter** | Continuous parameter estimation from streaming network data | Live line chart of window packet losses, real-time sample proportion $\hat{p}$, 95% Wilson confidence intervals, and conical risk meter for $P(X > k)$. |
| **CO4** | **Statistical Justification** | Synthesize empirical evidence into plain-English engineering decisions | Dynamically generated engineering report detailing $\hat{p}$, Wilson bounds, critical alpha $\alpha$, and routing action recommendations. |
| **CO5** | **Model Validation** | Validate theoretical distribution assumptions via hypothesis testing | Chi-Square Goodness-of-Fit test with dynamic Cochran bin merging ($E_i \ge 5$) at $\alpha=0.05$, explaining why bursty real-world network loss causes model rejection. |

---

## Mathematical Formulation

### 1. Empirical Loss Estimation ($\hat{p}$)
Over a sliding window of the last $W$ windows (default $W = 30$):
$$\hat{p} = \frac{\sum_{i=1}^W \text{Lost}_i}{\sum_{i=1}^W \text{Sent}_i}$$

### 2. Wilson 95% Score Confidence Interval
To avoid degenerate intervals when $\hat{p} \approx 0$ or $N$ is moderate:
$$\text{Center} = \frac{\hat{p} + \frac{z^2}{2N}}{1 + \frac{z^2}{N}}, \quad \text{Margin} = \frac{z}{1 + \frac{z^2}{N}} \sqrt{\frac{\hat{p}(1-\hat{p})}{N} + \frac{z^2}{4N^2}}$$
$$\text{CI}_{0.95} = \left[ \max\left(0, \text{Center} - \text{Margin}\right), \; \min\left(1, \text{Center} + \text{Margin}\right) \right]$$
where $z = \Phi^{-1}(0.975) \approx 1.95996$.

### 3. Predictive Next-Window Tail Risk
For a future window of $n$ packets:
$$P(X > k) = 1 - \sum_{x=0}^k \binom{n}{x} \hat{p}^x (1 - \hat{p})^{n - x} = \text{binom.sf}(k, n, \hat{p})$$
$$P(X \ge k) = \text{binom.sf}(k - 1, n, \hat{p})$$

### 4. Decision Rule
$$\text{State} = \begin{cases} \mathbf{ALERT}, & \text{if } P(X > k) > \alpha \\ \mathbf{NORMAL}, & \text{otherwise} \end{cases}$$

### 5. Chi-Square Goodness-of-Fit Validation
Tests the null hypothesis $H_0$: *Window loss counts follow $\text{Binomial}(n, \hat{p})$*:
- Minimum sample quorum: $M \ge 30$ windows.
- Bins are dynamically merged until expected frequency $E_i = M \cdot P(X \in \text{Bin}_i) \ge 5.0$.
- Degrees of freedom: $df = B - 1 - 1 = B - 2$ (subtracting 1 for sample size and 1 for estimated parameter $\hat{p}$).
- Test statistic:
  $$\chi^2 = \sum_{i=1}^B \frac{(O_i - E_i)^2}{E_i}$$
- Conclusion at 5% significance level ($\alpha=0.05$):
  - If $p\text{-value} \ge 0.05$: **"fits binomial model"** (independent Bernoulli loss).
  - If $p\text{-value} < 0.05$: **"does not fit binomial model"** (correlated / bursty loss from bufferbloat, router queues, or wireless channel fading).

---

## System Architecture

```
.
├── backend/
│   ├── app.py             # Flask application & SSE live telemetry streamer
│   ├── monitor.py         # Concurrent ICMP/TCP probe worker & simulation engine
│   └── stats_engine.py    # NumPy & SciPy statistical computation engine
├── frontend/
│   ├── index.html         # Frosted glass dashboard with 8 dedicated sections
│   ├── style.css          # Glassmorphism styling inspired by Webflow reference
│   └── script.js          # Chart.js visualizer & SSE event receiver
├── tests/
│   └── test_stats_engine.py # Automated pytest suite verifying mathematical precision
├── requirements.txt       # Dependencies
└── README.md              # Project documentation
```

---

## Setup & Running Instructions

### 1. Prerequisites
- Python 3.9+ (Python 3.10 to 3.14 recommended)
- Standard web browser (Chrome, Edge, Firefox, Safari)

### 2. Installation
Clone the repository and install required Python packages:
```bash
pip install -r requirements.txt
```

### 3. Run Automated Unit Tests
Verify mathematical consistency and SciPy alignment:
```bash
python -m pytest tests/test_stats_engine.py -v
```

### 4. Start the Application
Run the backend server:
```bash
python backend/app.py
```

### 5. Open Dashboard
Open your web browser and navigate to:
```
http://127.0.0.1:5000
```

---

## Features & Dashboard Walkthrough

1. **Live Header & Hero Card**:
   - Connection status dot (pulsing emerald green when connected to the live SSE stream).
   - Real-time estimated loss probability ($\hat{p}$) with smooth animated counter.
   - Wilson 95% score confidence interval $[p_{\text{lower}}, p_{\text{upper}}]$.

2. **Interactive Control Panel**:
   - **Target Selector**: Select from presets (`1.1.1.1`, `8.8.8.8`, `google.com`) or enter custom hosts.
   - **$n$ Stepper**: Adjust packets sampled per window ($10$ to $200$).
   - **$k$ Stepper**: Configure loss alert threshold.
   - **Significance Pills**: Toggle critical $\alpha \in \{0.01, 0.05, 0.10\}$.
   - **Simulation Slider**: Inject $0\%$ to $100\%$ artificial Bernoulli packet loss to test degraded lines.
   - **Action Buttons**: Pause/Resume engine, Reset historical data, Export CSV.

3. **Live Monitor (CO3)**:
   - Chart.js gradient line chart tracking losses per window over time.
   - Radial conical risk meter showing $P(X > k)$.

4. **Decision Engine (CO1)**:
   - High-visibility glowing alert card that switches between `NORMAL` and pulsing `ALERT`.
   - Numerical criteria proof showing the exact comparison against $\alpha$.
   - Chronological alert incident table.

5. **Theoretical Model (CO2)**:
   - Dual-type Chart.js visualizer showing empirical loss bars overlaid with theoretical binomial curve.
   - Moment metric cards: Mean $\mu = np$, Variance $\sigma^2 = np(1-p)$, and Std Dev $\sigma$.

6. **Statistical Justification (CO4)**:
   - Plain-English narrative explaining how current network conditions led to the state classification.

7. **Validation: Chi-Square Goodness-of-Fit (CO5)**:
   - Automated sample collector requiring $\ge 30$ windows.
   - Chi-square statistic ($\chi^2$), degrees of freedom ($df$), and $p$-value.
   - Merged Cochran contingency table showing bins with $E \ge 5$.
   - Analysis of bursty vs memoryless packet loss phenomena.

8. **Route Comparison & Export**:
   - Live telemetry comparison table ranking targets and highlighting the **SAFEST ROUTE**.
   - Direct CSV download of full historical window data.
