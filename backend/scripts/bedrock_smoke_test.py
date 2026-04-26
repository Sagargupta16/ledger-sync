"""Real-token smoke test for the Bedrock chat path.

Runs the full stack against a live Bedrock model. Kept out of the pytest
suite because CI doesn't have AWS access.

Usage:
    AWS_BEARER_TOKEN_BEDROCK=<token> uv run python scripts/bedrock_smoke_test.py

Passes when Bedrock returns any non-empty text for "Reply with just OK.".
"""

from __future__ import annotations

import os
import sys

import boto3


def main() -> int:
    if not os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
        print("ERROR: AWS_BEARER_TOKEN_BEDROCK is not set.")
        print("       This script requires a real bearer token to verify the live path.")
        return 2

    model_id = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-opus-4-7")
    region = os.environ.get("AWS_REGION", "us-east-1")
    print(f"Calling Bedrock: model={model_id} region={region}")

    try:
        client = boto3.client("bedrock-runtime", region_name=region)
        resp = client.converse(
            modelId=model_id,
            messages=[{"role": "user", "content": [{"text": "Reply with just OK."}]}],
            inferenceConfig={"maxTokens": 10},
        )
    except Exception as exc:  # noqa: BLE001
        print(f"FAILED: {type(exc).__name__}: {exc}")
        return 1

    text = resp["output"]["message"]["content"][0]["text"].strip()
    if not text:
        print("FAILED: empty response body")
        return 1
    print(f"OK: reply={text!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
