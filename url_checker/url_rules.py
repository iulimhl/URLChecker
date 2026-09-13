from urllib.parse import parse_qsl, urlparse

from url_checker.config import SUSPICIOUS_QUERY_KEYS, URL_SHORTENERS
from url_checker.domain_tools import (
    count_subdomains,
    has_noisy_domain_shape,
    has_suspicious_tld,
    hostname_from_url,
    is_ip_hostname,
    looks_like_brand_but_is_not_official,
    registered_domain,
)
from url_checker.models import make_finding
from url_checker.scoring import risk_level, total_score


def analyze_url(url):
    url = normalize_url(url)
    findings = []
    parsed = urlparse(url)
    hostname = hostname_from_url(url)
    domain = registered_domain(hostname)
    if is_ip_hostname(hostname):
        domain = hostname

    if parsed.scheme == "http":
        findings.append(make_finding("url_http", "Unencrypted HTTP URL", url, "url", 12, "medium"))

    if parsed.port and parsed.port not in (80, 443):
        findings.append(
            make_finding(
                "url_unusual_port",
                "Unusual URL port",
                "{} uses port {}.".format(url, parsed.port),
                "url",
                8,
                "low",
            )
        )

    query_keys = suspicious_query_keys(parsed.query)
    if query_keys:
        findings.append(
            make_finding(
                "url_suspicious_query",
                "Suspicious query parameter",
                "Found: {}".format(", ".join(query_keys[:3])),
                "url",
                20,
                "medium",
                {"keys": query_keys},
            )
        )

    if hostname in URL_SHORTENERS:
        findings.append(make_finding("url_shortener", "URL shortener detected", hostname, "url", 15, "medium"))

    if is_ip_hostname(hostname):
        findings.append(make_finding("url_ip_host", "Raw IP address in URL", hostname, "url", 20, "high"))
    else:
        if count_subdomains(hostname) >= 3:
            findings.append(
                make_finding(
                    "url_many_subdomains",
                    "Many subdomains",
                    "{} has {} subdomains.".format(hostname, count_subdomains(hostname)),
                    "url",
                    10,
                    "medium",
                )
            )

        if has_noisy_domain_shape(hostname):
            findings.append(make_finding("url_noisy_domain", "Noisy domain shape", hostname, "url", 8, "low"))

        if has_suspicious_tld(domain):
            findings.append(
                make_finding(
                    "url_suspicious_tld",
                    "Suspicious TLD",
                    "Domain uses .{}.".format(domain.rsplit(".", 1)[-1]),
                    "url",
                    8,
                    "low",
                )
            )

        lookalike = looks_like_brand_but_is_not_official(hostname)
        if lookalike:
            findings.append(
                make_finding(
                    "url_typosquatting",
                    "Possible typosquatting",
                    "{} is similar to {}.".format(domain, lookalike["official_domain"]),
                    "url",
                    20,
                    "high",
                    lookalike,
                )
            )

    score = total_score(findings)
    level = risk_level(score)
    return {
        "score": score,
        "level": level,
        "url": url,
        "hostname": hostname,
        "domain": domain,
        "findings": sorted(findings, key=lambda item: item["score"], reverse=True),
    }


def normalize_url(url):
    url = (url or "").strip()
    if "://" not in url:
        return "https://" + url
    return url


def suspicious_query_keys(query):
    keys = []
    for key, _ in parse_qsl(query, keep_blank_values=True):
        lowered = key.lower()
        if lowered in SUSPICIOUS_QUERY_KEYS:
            keys.append(lowered)
    return sorted(set(keys))
