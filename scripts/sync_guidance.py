#!/usr/bin/env python3
"""Project the canonical core policy into checked-in contributor guidance."""
import argparse
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    import json
    policy = json.loads((ROOT / "src/contracts.json").read_text())["policy"]
    targets = {ROOT / "plugins/whyve/rules/context-policy.md": policy + "\n"}
    agents = ROOT / "AGENTS.md"
    targets[agents] = re.sub(r'<!-- BEGIN context-core-policy .*?<!-- END context-core-policy \(managed by context-core\) -->',
                             lambda _: policy, agents.read_text(), flags=re.S)
    for path, value in targets.items():
        if args.check:
            if path.read_text() != value:
                raise SystemExit(f"Managed policy drift: {path.relative_to(ROOT)}")
        else:
            path.write_text(value)


if __name__ == "__main__":
    main()
