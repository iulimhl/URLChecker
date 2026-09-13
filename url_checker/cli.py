import argparse
import sys

from url_checker.reporting import print_json, print_report, print_summary
from url_checker.url_rules import analyze_url


DEFAULT_URL = "http://192.168.10.22:8080/login"


def build_parser():
    parser = argparse.ArgumentParser(
        description="Check URLs for simple suspicious patterns."
    )
    parser.add_argument("--url", help="Analyze one URL.")
    parser.add_argument("--file", help="Analyze a text file with one URL per line.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    return parser


def load_results(args):
    selected_inputs = len([value for value in (args.url, args.file) if value])
    if selected_inputs > 1:
        raise ValueError("Use only one input option.")

    if args.url:
        return [analyze_url(args.url)]

    if args.file:
        return analyze_url_file(args.file)

    return [analyze_url(DEFAULT_URL)]


def main(argv):
    args = build_parser().parse_args(argv)

    try:
        results = load_results(args)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2

    if not results:
        print("No URLs found.")
        return 1

    if args.json:
        print_json(results)
    elif len(results) > 1:
        print_summary(results)
    else:
        for result in results:
            print_report(result)

    return 0


def analyze_url_file(path):
    results = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            url = line.strip()
            if url and not url.startswith("#"):
                results.append(analyze_url(url))
    return results
