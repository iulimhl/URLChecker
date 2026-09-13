import json


def print_json(results):
    print(json.dumps(results, indent=2, sort_keys=True))


def print_summary(results):
    print("Results:")
    for result in results:
        print("- {}: {} ({}/100)".format(result["url"], result["level"], result["score"]))
    print("")


def print_report(result):
    print("URL: {}".format(result["url"]))
    print("Domain: {}".format(result.get("domain") or "(missing)"))
    print("Risk: {} ({}/100)".format(result["level"], result["score"]))

    if result["findings"]:
        print("Reasons:")
        for finding in result["findings"][:2]:
            print("- {}".format(short_reason(finding["title"])))
    else:
        print("Reasons: none")

    print("")


def short_reason(title):
    names = {
        "Unencrypted HTTP URL": "uses HTTP",
        "Raw IP address in URL": "uses an IP address",
        "Unusual URL port": "uses an unusual port",
        "URL shortener detected": "shortened URL",
        "Suspicious TLD": "unusual domain ending",
        "Many subdomains": "many subdomains",
        "Noisy domain shape": "many digits or dashes",
        "Possible typosquatting": "looks like another domain",
        "Suspicious query parameter": "suspicious query parameter",
    }
    return names.get(title, title)
