"""Download the Houston Housing 2024 data with KaggleHub and place it in data/raw/.

    python scripts/fetch_dataset.py              # clean CSV + listing-details extract
    python scripts/fetch_dataset.py --skip-details

Writes:
  data/raw/houston_housing_2024_clean.csv   (Kaggle: mohamedalmansop/houston-housing-market-2024-clean-dataset)
  data/raw/houston_listing_details.csv      (zpid-keyed extract from datadetective08/houston-housing-market-2024,
                                             light JSON: street address, lot units, tax value, original
                                             bed/bath/area values used to detect imputed fields)

Public datasets usually download anonymously. If Kaggle asks for credentials, create an API
token at https://www.kaggle.com/settings and save it as ~/.kaggle/kaggle.json.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = REPO_ROOT / "data" / "raw"
CLEAN_HANDLE = "mohamedalmansop/houston-housing-market-2024-clean-dataset"
RAW_HANDLE = "datadetective08/houston-housing-market-2024"
RAW_LIGHT_FILE = "houston_housing market 2024_light.json"


def fetch_clean() -> Path:
    import kagglehub

    folder = Path(kagglehub.dataset_download(CLEAN_HANDLE))
    csvs = sorted(folder.glob("*.csv"))
    if not csvs:
        sys.exit(f"No CSV found in {folder}")
    target = RAW_DIR / "houston_housing_2024_clean.csv"
    shutil.copyfile(csvs[0], target)
    print(f"Clean dataset: {csvs[0].name} -> {target.relative_to(REPO_ROOT)}")
    return target


def _load_light_records(path: Path) -> list[dict]:
    # KaggleHub may hand back the file still zipped; extract into a fresh temp dir if so.
    if zipfile.is_zipfile(path):
        with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(path) as zf:
            member = next(n for n in zf.namelist() if n.endswith(".json"))
            zf.extract(member, tmp)
            with open(Path(tmp) / member, encoding="utf-8") as fh:
                return json.load(fh)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def fetch_details() -> Path:
    import kagglehub

    path = Path(kagglehub.dataset_download(RAW_HANDLE, path=RAW_LIGHT_FILE))
    records = _load_light_records(path)
    rows = []
    for rec in records:
        info = (rec.get("hdpData") or {}).get("homeInfo") or {}
        if info.get("zpid") is None:
            continue
        rows.append(
            {
                "zpid": info.get("zpid"),
                "street_address": info.get("streetAddress"),
                "state": info.get("state"),
                "bedrooms": info.get("bedrooms"),
                "bathrooms": info.get("bathrooms"),
                "living_area_sqft": info.get("livingArea"),
                "lot_area_value": info.get("lotAreaValue"),
                "lot_area_unit": info.get("lotAreaUnit"),
                "tax_assessed_value": info.get("taxAssessedValue"),
            }
        )
    details = pd.DataFrame(rows)
    details["zpid"] = pd.to_numeric(details["zpid"], errors="coerce").astype("Int64")
    details = details.dropna(subset=["zpid"]).drop_duplicates("zpid")
    target = RAW_DIR / "houston_listing_details.csv"
    details.to_csv(target, index=False)
    print(f"Listing details: {len(details):,} rows -> {target.relative_to(REPO_ROOT)}")
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-details", action="store_true", help="only download the clean CSV")
    args = parser.parse_args()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    fetch_clean()
    if not args.skip_details:
        fetch_details()
    print("Done. Restart the API to load the new data.")


if __name__ == "__main__":
    main()
