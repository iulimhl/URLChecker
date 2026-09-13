def make_finding(rule_id, title, detail, category, score, severity="medium", evidence=None):
    return {
        "rule_id": rule_id,
        "title": title,
        "detail": detail,
        "category": category,
        "score": score,
        "severity": severity,
        "evidence": evidence or {},
    }
