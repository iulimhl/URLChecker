from difflib import SequenceMatcher
from ipaddress import ip_address
import re
from urllib.parse import urlparse

from url_checker.config import BRAND_PROFILES, SUSPICIOUS_TLDS


LOOKALIKE_TRANSLATION = {
    "0": "o",
    "1": "l",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
}


def normalize_lookalikes(value):
    normalized = (value or "").lower()
    for source, target in LOOKALIKE_TRANSLATION.items():
        normalized = normalized.replace(source, target)
    return normalized


def hostname_from_url(url):
    return (urlparse(url).hostname or "").lower()


def registered_domain(hostname):
    if not hostname:
        return ""

    hostname = hostname.lower().strip(".")
    parts = hostname.split(".")

    if len(parts) <= 2:
        return hostname

    if len(parts) >= 3 and parts[-2] in ("co", "com", "org", "net"):
        return ".".join(parts[-3:])

    return ".".join(parts[-2:])


def domain_label(domain):
    registered = registered_domain(domain)
    return registered.split(".")[0] if registered else ""


def tld(domain):
    domain = registered_domain(domain)
    if "." not in domain:
        return ""
    return domain.rsplit(".", 1)[-1]


def is_ip_hostname(hostname):
    if not hostname:
        return False
    try:
        ip_address(hostname)
        return True
    except ValueError:
        return False


def count_subdomains(hostname):
    hostname = (hostname or "").lower().strip(".")
    registered = registered_domain(hostname)
    if not hostname or not registered or hostname == registered:
        return 0
    suffix = "." + registered
    if not hostname.endswith(suffix):
        return 0
    prefix = hostname[: -len(suffix)]
    return len([part for part in prefix.split(".") if part])


def similarity(a, b):
    return SequenceMatcher(None, a or "", b or "").ratio()


def closest_brand_domain(domain):
    current_registered = registered_domain(domain)
    current_label = normalize_lookalikes(domain_label(current_registered))

    best = None
    for profile in BRAND_PROFILES:
        for official_domain in profile["domains"]:
            official_registered = registered_domain(official_domain)
            official_label = domain_label(official_registered)

            label_similarity = similarity(current_label, official_label)
            domain_similarity = similarity(
                normalize_lookalikes(current_registered),
                normalize_lookalikes(official_registered),
            )
            score = max(label_similarity, domain_similarity)

            if best is None or score > best["similarity"]:
                best = {
                    "brand": profile["name"],
                    "official_domain": official_registered,
                    "similarity": score,
                    "is_exact": current_registered == official_registered,
                }

    return best


def looks_like_brand_but_is_not_official(domain):
    if not domain:
        return None

    if is_ip_hostname(domain):
        return None

    best = closest_brand_domain(domain)
    if not best or best["is_exact"]:
        return None

    current_label = normalize_lookalikes(domain_label(domain))
    official_label = domain_label(best["official_domain"])
    contains_brand = official_label in current_label or (
        len(current_label) >= 4 and current_label in official_label
    )

    if best["similarity"] >= 0.84 or contains_brand:
        return best

    return None


def has_noisy_domain_shape(hostname):
    hostname = hostname or ""
    registered = registered_domain(hostname)
    label = domain_label(registered)

    if len(label) >= 24:
        return True
    if label.count("-") >= 2:
        return True
    if len(re.findall(r"\d", label)) >= 3:
        return True
    if count_subdomains(hostname) >= 3:
        return True
    return False


def has_suspicious_tld(domain):
    return tld(domain) in SUSPICIOUS_TLDS
