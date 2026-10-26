import math
from typing import List, Dict, Any, Tuple
import numpy as np
from scipy import stats

def estimate_p_hat(windows: List[Dict[str, Any]], w: int = 30) -> Tuple[float, int, int]:
    """
    Estimate p_hat = total lost / total sent over the last W windows.
    Returns (p_hat, total_lost, total_sent).
    """
    if not windows:
        return 0.0, 0, 0
    
    recent = windows[-w:] if w > 0 else windows
    total_sent = sum(item.get("sent", 0) for item in recent)
    total_lost = sum(item.get("lost", 0) for item in recent)
    
    if total_sent == 0:
        return 0.0, 0, 0
    
    p_hat = total_lost / total_sent
    # Clamp to [0.0, 1.0] for physical validity
    p_hat = max(0.0, min(1.0, p_hat))
    return p_hat, total_lost, total_sent

def wilson_score_interval(total_lost: int, total_sent: int, confidence: float = 0.95) -> Tuple[float, float]:
    """
    Calculates the Wilson score 95% confidence interval for binomial proportion p.
    """
    if total_sent <= 0:
        return 0.0, 0.0
    
    p = total_lost / total_sent
    n = total_sent
    z = float(stats.norm.ppf(1 - (1 - confidence) / 2))
    z2 = z * z
    
    denom = 1 + z2 / n
    center = (p + z2 / (2 * n)) / denom
    margin = (z / denom) * math.sqrt((p * (1 - p) / n) + (z2 / (4 * (n ** 2))))
    
    lower = max(0.0, center - margin)
    upper = min(1.0, center + margin)
    return float(lower), float(upper)

def binomial_stats(n: int, p_hat: float, k: int, alpha: float = 0.05) -> Dict[str, Any]:
    """
    Computes Binomial(n, p_hat) properties:
    - Theoretical mean: np
    - Theoretical variance: np(1-p)
    - P(X > k) and P(X >= k)
    - Decision: ALERT if P(X > k) > alpha else NORMAL
    - PMF distribution up to n
    """
    n = max(1, int(n))
    k = max(0, int(k))
    p_hat = max(0.0, min(1.0, float(p_hat)))
    alpha = float(alpha)
    
    mean = n * p_hat
    variance = n * p_hat * (1.0 - p_hat)
    std_dev = math.sqrt(variance)
    
    # P(X > k) = 1 - CDF(k) = SF(k)
    p_gt_k = float(stats.binom.sf(k, n, p_hat))
    
    # P(X >= k) = 1 - CDF(k-1)
    if k <= 0:
        p_gte_k = 1.0
    elif k > n:
        p_gte_k = 0.0
    else:
        p_gte_k = float(stats.binom.sf(k - 1, n, p_hat))
        
    decision = "ALERT" if p_gt_k > alpha else "NORMAL"
    
    # Generate PMF coordinates for chart visualization
    # We choose a range covering significant probability mass
    max_x = min(n, max(k + 5, int(mean + 4 * std_dev) + 4, 15))
    pmf_labels = list(range(max_x + 1))
    pmf_values = [float(stats.binom.pmf(x, n, p_hat)) for x in pmf_labels]
    
    return {
        "n": n,
        "k": k,
        "p_hat": p_hat,
        "alpha": alpha,
        "mean": float(mean),
        "variance": float(variance),
        "std_dev": float(std_dev),
        "p_gt_k": p_gt_k,
        "p_gte_k": p_gte_k,
        "decision": decision,
        "pmf_labels": pmf_labels,
        "pmf_values": pmf_values
    }

def generate_explanation(p_hat: float, ci: Tuple[float, float], p_gt_k: float, 
                         alpha: float, decision: str, n: int, k: int, 
                         total_lost: int, total_sent: int, windows_count: int) -> str:
    """
    Generates plain-English statistical explanation citing p_hat, CI, P(X > k), alpha, and decision.
    """
    p_pct = p_hat * 100
    ci_low_pct = ci[0] * 100
    ci_high_pct = ci[1] * 100
    p_gt_k_pct = p_gt_k * 100
    alpha_pct = alpha * 100
    
    condition_text = f"exceeds the significance threshold α = {alpha:.2f} ({alpha_pct:.1f}%)" if decision == "ALERT" else f"is within the acceptable threshold α = {alpha:.2f} ({alpha_pct:.1f}%)"
    action_text = (
        "Elevated packet drop risk detected. Real-time traffic throttling, rerouting, or buffer tuning recommended."
        if decision == "ALERT" else
        "Network transmission parameters are stable. Packet loss is within expected stochastic tolerances."
    )
    
    return (
        f"Over the last {windows_count} windows ({total_sent} probe packets sent, {total_lost} lost), "
        f"the estimated packet drop probability is p̂ = {p_pct:.2f}% with a 95% Wilson confidence interval "
        f"of [{ci_low_pct:.2f}%, {ci_high_pct:.2f}%]. For the next monitoring window of n = {n} packets, "
        f"the predicted probability of dropping more than k = {k} packets is P(X > {k}) = {p_gt_k_pct:.2f}%. "
        f"Because P(X > {k}) {condition_text}, the system classifies current line quality as {decision}. {action_text}"
    )

def chi_square_goodness_of_fit(window_losses: List[int], n: int, p_hat: float, min_windows: int = 30) -> Dict[str, Any]:
    """
    Performs Chi-square goodness-of-fit of observed window loss counts against Binomial(n, p_hat).
    - Merges bins with expected count below 5.
    - Degrees of freedom = bins - 1 - 1 (1 estimated parameter p_hat).
    - Requires at least min_windows (default 30) before running.
    - Significance level = 0.05.
    """
    total_obs = len(window_losses)
    if total_obs < min_windows:
        return {
            "status": "collecting_data",
            "windows_count": total_obs,
            "min_required": min_windows,
            "statistic": None,
            "df": None,
            "p_value": None,
            "conclusion": f"Collecting data ({total_obs}/{min_windows} windows required)",
            "explanation": "Chi-square test requires sufficient sample size (≥ 30 windows) to ensure reliable asymptotic properties."
        }
    
    # Count observed frequencies for each loss value 0..n
    obs_dict: Dict[int, int] = {}
    for loss in window_losses:
        loss_clamped = min(n, max(0, loss))
        obs_dict[loss_clamped] = obs_dict.get(loss_clamped, 0) + 1
        
    # Find active range of values
    max_observed = max(window_losses) if window_losses else 0
    eval_max = min(n, max(max_observed + 3, int(n * p_hat + 4 * math.sqrt(max(1e-4, n * p_hat * (1 - p_hat)))) + 3, 10))
    
    raw_bins = []
    # Values from 0 to eval_max - 1
    for x in range(eval_max):
        prob = float(stats.binom.pmf(x, n, p_hat))
        raw_bins.append({
            "name": str(x),
            "expected": total_obs * prob,
            "observed": obs_dict.get(x, 0)
        })
    # Tail bin for >= eval_max
    tail_prob = float(stats.binom.sf(eval_max - 1, n, p_hat))
    raw_bins.append({
        "name": f">={eval_max}",
        "expected": total_obs * tail_prob,
        "observed": sum(obs_dict.get(x, 0) for x in range(eval_max, n + 1))
    })
    
    # Merge bins with expected count below 5
    merged_bins = []
    accum_expected = 0.0
    accum_observed = 0
    accum_names = []
    
    for b in raw_bins:
        accum_expected += b["expected"]
        accum_observed += b["observed"]
        accum_names.append(b["name"])
        if accum_expected >= 5.0:
            name_label = accum_names[0] if len(accum_names) == 1 else f"{accum_names[0]}-{accum_names[-1]}"
            merged_bins.append({
                "label": name_label,
                "expected": accum_expected,
                "observed": accum_observed
            })
            accum_expected = 0.0
            accum_observed = 0
            accum_names = []
            
    # If remaining accum_expected < 5, merge into last bin if exists
    if accum_expected > 0.0 or accum_observed > 0:
        if merged_bins:
            last = merged_bins[-1]
            last["expected"] += accum_expected
            last["observed"] += accum_observed
            if accum_names:
                last["label"] = f"{last['label'].split('-')[0]}-{accum_names[-1]}"
        else:
            name_label = accum_names[0] if len(accum_names) == 1 else f"{accum_names[0]}-{accum_names[-1]}"
            merged_bins.append({
                "label": name_label,
                "expected": accum_expected,
                "observed": accum_observed
            })
            
    num_bins = len(merged_bins)
    # Degrees of freedom: bins - 1 - 1 (1 estimated parameter p_hat)
    df = num_bins - 1 - 1
    
    if df < 1:
        return {
            "status": "insufficient_bins",
            "windows_count": total_obs,
            "min_required": min_windows,
            "statistic": None,
            "df": df,
            "p_value": None,
            "conclusion": "Insufficient merged bins for Chi-square test (df < 1)",
            "explanation": "Expected frequencies are concentrated in fewer than 3 merged bins (df = bins - 2 < 1). Additional window variance or wider range needed.",
            "merged_bins": merged_bins
        }
        
    # Calculate Chi-Square statistic
    chi2_stat = 0.0
    for b in merged_bins:
        e = b["expected"]
        o = b["observed"]
        chi2_stat += ((o - e) ** 2) / e
        
    p_val = float(stats.chi2.sf(chi2_stat, df))
    fits = p_val >= 0.05
    conclusion = "fits binomial model" if fits else "does not fit binomial model"
    
    explanation_note = (
        "Observed loss counts follow an independent Bernoulli trial process." if fits else
        "Hypothesis of independent Bernoulli losses rejected at α = 0.05. "
        "Real-world network packet loss commonly exhibits burstiness (correlated losses from router queue overflows or Gilbert-Elliott channel dynamics), which causes systematic deviation from memoryless Binomial assumptions."
    )
    
    return {
        "status": "complete",
        "windows_count": total_obs,
        "min_required": min_windows,
        "statistic": round(chi2_stat, 4),
        "df": df,
        "p_value": round(p_val, 4),
        "conclusion": conclusion,
        "explanation": explanation_note,
        "merged_bins": [
            {
                "label": b["label"],
                "expected": round(b["expected"], 2),
                "observed": b["observed"]
            } for b in merged_bins
        ]
    }
