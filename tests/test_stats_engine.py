import pytest
import math
import numpy as np
from scipy import stats
import sys
import os

# Add parent directory to path so backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.stats_engine import (
    estimate_p_hat,
    wilson_score_interval,
    binomial_stats,
    chi_square_goodness_of_fit,
    generate_explanation
)

def test_binomial_stats_100_002():
    """
    User requirement:
    Verify that Binomial(100, 0.02) gives mean 2 and P(X > 5) of about 0.017.
    """
    res = binomial_stats(n=100, p_hat=0.02, k=5, alpha=0.05)
    
    # Mean must be 2.0
    assert pytest.approx(res["mean"], abs=1e-5) == 2.0
    
    # P(X > 5) must be about 0.017 (exact Binomial is ~0.0155, Poisson approx is ~0.0166)
    assert pytest.approx(res["p_gt_k"], abs=0.003) == 0.017
    assert 0.014 <= res["p_gt_k"] <= 0.018
    
    # Variance np(1-p) = 100 * 0.02 * 0.98 = 1.96
    assert pytest.approx(res["variance"], abs=1e-5) == 1.96
    
    # Since P(X > 5) ~ 0.017 < alpha (0.05), decision should be NORMAL
    assert res["decision"] == "NORMAL"

def test_binomial_alert_trigger():
    """
    When P(X > k) > alpha, decision should switch to ALERT.
    """
    # For n=100, p=0.08, k=5: mean=8, P(X > 5) will be high (> 0.05)
    res = binomial_stats(n=100, p_hat=0.08, k=5, alpha=0.05)
    assert res["p_gt_k"] > 0.05
    assert res["decision"] == "ALERT"

def test_wilson_score_interval():
    """
    Verify Wilson score interval against scipy stats norm ppf calculation.
    """
    total_lost = 20
    total_sent = 1000
    p = total_lost / total_sent # 0.02
    
    lower, upper = wilson_score_interval(total_lost, total_sent, confidence=0.95)
    
    z = stats.norm.ppf(0.975)
    denom = 1 + (z**2) / total_sent
    center = (p + (z**2) / (2 * total_sent)) / denom
    margin = (z / denom) * math.sqrt((p * (1 - p) / total_sent) + (z**2) / (4 * (total_sent**2)))
    
    expected_lower = max(0.0, center - margin)
    expected_upper = min(1.0, center + margin)
    
    assert pytest.approx(lower, abs=1e-5) == expected_lower
    assert pytest.approx(upper, abs=1e-5) == expected_upper
    assert 0.0 <= lower <= p <= upper <= 1.0

def test_estimate_p_hat():
    """
    Verify p_hat estimation over last W windows.
    """
    windows = [
        {"sent": 100, "lost": 2},
        {"sent": 100, "lost": 3},
        {"sent": 100, "lost": 5},
    ]
    p_hat, lost, sent = estimate_p_hat(windows, w=2)
    # Last 2 windows: sent 200, lost 8 -> 8 / 200 = 0.04
    assert sent == 200
    assert lost == 8
    assert pytest.approx(p_hat, abs=1e-5) == 0.04

def test_chi_square_collecting_data():
    """
    Chi-square test should report collecting data when < 30 windows.
    """
    losses = [1] * 20
    result = chi_square_goodness_of_fit(losses, n=100, p_hat=0.02, min_windows=30)
    assert result["status"] == "collecting_data"
    assert result["windows_count"] == 20
    assert "Collecting data" in result["conclusion"]

def test_chi_square_goodness_of_fit_scipy_match():
    """
    Verify that our chi-square calculation matches scipy.stats.chisquare on merged bins.
    """
    np.random.seed(42)
    n = 50
    p_true = 0.06
    # Generate 100 binomial samples
    sample_losses = list(np.random.binomial(n, p_true, 100))
    p_hat = sum(sample_losses) / (100 * n)
    
    res = chi_square_goodness_of_fit(sample_losses, n, p_hat, min_windows=30)
    assert res["status"] == "complete"
    assert res["df"] >= 1
    assert "fits" in res["conclusion"]
    
    # Extract merged bins and run scipy.stats.chisquare to verify statistic match
    obs = [b["observed"] for b in res["merged_bins"]]
    exp = [b["expected"] for b in res["merged_bins"]]
    scipy_stat, _ = stats.chisquare(f_obs=obs, f_exp=exp, ddof=1) # 1 estimated parameter
    assert pytest.approx(res["statistic"], abs=1e-2) == scipy_stat

def test_explanation_generation():
    """
    Verify that explanation string includes required metrics.
    """
    expl = generate_explanation(
        p_hat=0.02,
        ci=(0.012, 0.031),
        p_gt_k=0.0166,
        alpha=0.05,
        decision="NORMAL",
        n=100,
        k=5,
        total_lost=20,
        total_sent=1000,
        windows_count=10
    )
    assert "p̂ = 2.00%" in expl
    assert "P(X > 5)" in expl
    assert "NORMAL" in expl
    assert "α = 0.05" in expl
