from __future__ import annotations

import json
import logging
import re
import time

from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import urljoin, urlparse

import requests

from bs4 import BeautifulSoup, Tag


if TYPE_CHECKING:
    from collections.abc import Sequence

METADATA_FILE = "manifest.json"


def _load_metadata(data_dir: Path) -> dict[str, dict]:
    """Load the manifest, or return an empty one when it is missing or invalid."""
    metadata_path = data_dir / METADATA_FILE
    if metadata_path.exists():
        try:
            return json.loads(metadata_path.read_text())
        except (OSError, json.JSONDecodeError) as e:
            logging.warning(f"Ignoring invalid metadata: {e}")
    return {}


def _save_metadata(data_dir: Path, metadata: dict[str, dict]) -> None:
    """Replace the manifest atomically."""
    metadata_path = data_dir / METADATA_FILE
    try:
        temp_path = metadata_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(metadata, indent=2))
        temp_path.replace(metadata_path)
    except OSError as e:
        logging.error(f"Failed to save metadata: {e}")


def _record_download(data_dir: Path, url: str, title: str, filename: str) -> None:
    metadata = _load_metadata(data_dir)
    metadata[filename] = {
        "url": url,
        "title": title,
        "timestamp": datetime.now().isoformat(),
    }
    _save_metadata(data_dir, metadata)


def _find_cached_file(data_dir: Path, url: str) -> Path | None:
    """Return a cached file only when its manifest entry and file still exist."""
    metadata = _load_metadata(data_dir)
    for filename, record in metadata.items():
        if record.get("url") == url:
            filepath = data_dir / filename
            if filepath.is_file():
                logging.info(f"Cache hit: {filepath.name}")
                return filepath
    return None


def find_tag(
    parent: Tag,
    name: str | None = None,
    class_: str | None = None,
    id_: str | None = None,
) -> Tag | None:
    kwargs = {}
    if class_:
        kwargs["class_"] = class_
    if id_:
        kwargs["id"] = id_
    tag = parent.find(name=name, **kwargs)
    return tag if isinstance(tag, Tag) else None


def get_text(tag: Tag | None) -> str:
    """Return stripped text from a tag, or 'unknown' if missing."""
    return tag.get_text(strip=True) if tag else "unknown"


def fetch_file(url: str, filepath: Path, max_retries: int = 3) -> bool:
    """Download a file from a URL with retries and a 30-second timeout."""
    for attempt in range(max_retries):
        try:
            logging.info(f"Downloading {filepath.name} (attempt {attempt + 1})")
            with requests.get(url, timeout=30, stream=True) as r:
                r.raise_for_status()
                filepath.write_bytes(r.content)
            logging.info(f"Downloaded {filepath.name}")
            return True
        except requests.RequestException as e:
            logging.error(f"Attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 + attempt)
    return False


def fetch_response_with_fallbacks(
    url: str, *, stream: bool = False, timeout: int = 30
) -> requests.Response | None:
    """
    Fetch a URL and return a response.

    If the primary request fails, retry once via archive.org.
    Returns a "requests.Response" on success, or None if all attempts fail.
    """
    try:
        response = requests.get(url, timeout=timeout, stream=stream)
        response.raise_for_status()
        return response
    except requests.RequestException as e:
        logging.warning(f"Primary fetch failed for {url}: {e}")

    archive_url = f"https://web.archive.org/web/0/{url}"
    logging.info(f"Trying archive.org fallback: {archive_url}")
    try:
        response = requests.get(archive_url, timeout=timeout, stream=stream)
        response.raise_for_status()
        return response
    except requests.RequestException as e:
        logging.error(f"Archive.org fallback failed: {e}")
        return None


def _fetch_with_fallbacks(url: str, filepath: Path) -> bool:
    response = fetch_response_with_fallbacks(url, stream=True)
    if not response:
        return False
    try:
        filepath.write_bytes(response.content)
        logging.info(f"Downloaded {filepath.name}")
        return True
    except OSError as e:
        logging.error(f"Failed to save {filepath}: {e}")
        return False


def extract_csv_links(page_url: str) -> list[dict[str, str]]:
    """
    Extract CSV download links from a datosabiertos.gob.pe dataset page.

    Args:
        page_url: Dataset page URL.

    Returns:
        A list of dictionaries with 'title' and 'url' keys for each CSV found.
    """
    response = fetch_response_with_fallbacks(page_url)
    if not response:
        logging.error(f"Failed to fetch page: {page_url}")
        return []

    soup = BeautifulSoup(response.content, "html.parser")
    resources_div = find_tag(soup, "div", id_="data-and-resources")
    if not resources_div:
        logging.warning("No resource section found")
        return []

    items: Sequence[Tag] = [
        li for li in resources_div.find_all("li") if isinstance(li, Tag)
    ]
    links: list[dict[str, str]] = []

    for item in items:
        download_tag = find_tag(item, "a", class_="data-link")
        format_tag = find_tag(item, "span", class_="format-label")
        title_tag = find_tag(item, "a", class_="heading")

        if not download_tag or not format_tag:
            continue

        url = str(download_tag.get("href") or "")
        file_format = str(format_tag.get("data-original-title") or "").lower()
        title = get_text(title_tag)

        if "csv" in file_format or url.lower().endswith(".csv"):
            if url.startswith("/"):
                url = urljoin("https://datosabiertos.gob.pe", url)
            if "web.archive.org" in response.url and "web.archive.org" not in url:
                url = f"https://web.archive.org/web/0/{url}"
            links.append({"title": title, "url": url})

    logging.info(f"Found {len(links)} CSV links")
    return links


def sanitize_filename(title: str, url: str) -> str:
    """Generate a safe, lowercase .csv filename from a title or URL."""
    name = Path(urlparse(url).path).name
    if not name.endswith(".csv"):
        name = re.sub(r"[^\w\s-]", "", title.lower())
        name = re.sub(r"[-\s]+", "_", name) + ".csv"
    return re.sub(r"[^\w\-.]", "_", name)


def download_page_csvs(
    page_url: str, data_dir: Path, force: bool = False
) -> list[Path]:
    """
    Download all CSV files linked on a datosabiertos.gob.pe dataset page.

    Args:
        page_url: Dataset page URL.
        data_dir: Directory where files are saved.
        force: If True, re-download even if cached.

    Returns:
        A list of downloaded or cached file paths.
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    links = extract_csv_links(page_url)
    if not links:
        logging.warning(f"No CSV files found on {page_url}")
        return []

    downloaded: list[Path] = []
    for link in links:
        url = link["url"]
        title = link["title"]

        if not force:
            cached = _find_cached_file(data_dir, url)
            if cached:
                downloaded.append(cached)
                continue

        filename = sanitize_filename(title, url)
        filepath = data_dir / filename

        if _fetch_with_fallbacks(url, filepath):
            _record_download(data_dir, url, title, filename)
            downloaded.append(filepath)
        elif filepath.exists():
            logging.info(f"Using existing file: {filename}")
            downloaded.append(filepath)

    return downloaded


def download_csvs(urls: list[str], data_dir: Path, force: bool = False) -> list[Path]:
    """
    Download CSV files directly from URLs.

    Args:
        urls: List of direct CSV URLs.
        data_dir: Directory where files are saved.
        force: If True, re-download even if cached.

    Returns:
        A list of downloaded or cached file paths.
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    downloaded: list[Path] = []

    for url in urls:
        if not force:
            cached = _find_cached_file(data_dir, url)
            if cached:
                downloaded.append(cached)
                continue

        filename = Path(urlparse(url).path).name.replace("%20", "_").replace(" ", "_")
        if not filename.endswith(".csv"):
            filename = f"data_{hash(url) % 10000}.csv"
        filepath = data_dir / filename

        if _fetch_with_fallbacks(url, filepath):
            _record_download(data_dir, url, filename, filename)
            downloaded.append(filepath)
        elif filepath.exists():
            logging.info(f"Using existing file: {filename}")
            downloaded.append(filepath)

    return downloaded


def download(url: str | list[str], data_dir: Path, force: bool = False) -> list[Path]:
    """
    Download CSVs from one or more URLs.

    Supports both direct CSV links and datosabiertos.gob.pe dataset pages.
    Automatically falls back to archive.org if the primary source is unavailable,
    and uses cached files when possible.

    Args:
        url: Single URL string or list of URLs.
        data_dir: Directory where files and metadata are stored.
        force: If True, re-download even if cached.

    Returns:
        A list of downloaded or cached file paths.
    """
    url_list = [url] if isinstance(url, str) else url
    all_files: list[Path] = []

    for u in url_list:
        files = (
            download_csvs([u], data_dir, force)
            if u.lower().endswith(".csv")
            else download_page_csvs(u, data_dir, force)
        )
        all_files.extend(files)

    return list(set(all_files))
