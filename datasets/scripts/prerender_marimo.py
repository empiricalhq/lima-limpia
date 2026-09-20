import os
import subprocess
import sys

from playwright.sync_api import sync_playwright


if len(sys.argv) != 3:
    sys.exit("Usage: python prerender_marimo.py <input_html_path> <output_html_path>")

input_path = os.path.abspath(sys.argv[1])
output_path = os.path.abspath(sys.argv[2])


try:
    subprocess.run(
        ["playwright", "install", "chromium"], check=True, capture_output=True
    )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(
            f"file:///{input_path}", wait_until="domcontentloaded", timeout=60_000
        )
        page.wait_for_selector("#root > *", state="attached", timeout=60_000)

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(page.content())

        browser.close()

except Exception as e:
    sys.exit(f"Error: {e}")
