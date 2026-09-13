BRAND_PROFILES = [
    {"name": "google", "domains": ["google.com", "gmail.com"]},
    {"name": "github", "domains": ["github.com"]},
    {"name": "paypal", "domains": ["paypal.com"]},
    {"name": "microsoft", "domains": ["microsoft.com"]},
]

URL_SHORTENERS = {
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "rebrand.ly",
    "cutt.ly",
    "is.gd",
}

SUSPICIOUS_TLDS = {
    "zip",
    "top",
    "xyz",
    "click",
    "link",
}

SUSPICIOUS_QUERY_KEYS = {
    "redirect",
    "return",
    "return_url",
    "next",
    "url",
    "token",
    "session",
    "password",
    "login",
}

RISK_LEVELS = [
    (70, "critical"),
    (45, "high"),
    (20, "medium"),
    (0, "low"),
]
