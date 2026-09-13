from url_checker.config import RISK_LEVELS


def total_score(findings):
    return min(100, sum(item["score"] for item in findings))


def risk_level(score):
    for minimum, label in RISK_LEVELS:
        if score >= minimum:
            return label
    return "low"
