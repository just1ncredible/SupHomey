"""Generate the SYNTHETIC development fixture used when the real dataset is not installed.

    python scripts/generate_fixture.py

Every record is fabricated: addresses use the fictional street name "Fixture", prices are
random draws, and the API reports the dataset source as "synthetic_fixture" so the UI can
label it. The file uses the same column layout as the Kaggle clean CSV so it goes through
the exact same ingestion path.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
TARGET = REPO_ROOT / "data" / "fixtures" / "synthetic_properties.csv"

# Approximate area anchors (lat, lon, city, zip, typical price) used only to scatter fake points.
ANCHORS = [
    (29.7604, -95.3698, "Houston", "77002", 420_000),
    (29.8027, -95.4010, "Houston", "77008", 650_000),
    (29.7445, -95.3901, "Houston", "77006", 700_000),
    (29.7180, -95.4290, "Houston", "77005", 1_100_000),
    (29.7814, -95.5427, "Houston", "77024", 1_200_000),
    (29.6855, -95.5260, "Houston", "77036", 260_000),
    (29.8700, -95.5600, "Houston", "77040", 330_000),
    (29.9400, -95.2600, "Houston", "77032", 240_000),
    (29.7858, -95.8244, "Katy", "77494", 520_000),
    (29.9691, -95.6972, "Cypress", "77433", 430_000),
    (30.0799, -95.4172, "Spring", "77379", 380_000),
    (30.1658, -95.4613, "The Woodlands", "77380", 610_000),
    (29.6197, -95.6349, "Sugar Land", "77479", 560_000),
    (29.5636, -95.2860, "Pearland", "77584", 400_000),
    (29.5075, -95.0949, "League City", "77573", 390_000),
    (29.9988, -95.2622, "Humble", "77338", 280_000),
    (30.3119, -95.4561, "Conroe", "77301", 300_000),
    (29.6911, -95.2091, "Pasadena", "77506", 230_000),
]
HOME_TYPES = ["SINGLE_FAMILY"] * 14 + ["TOWNHOUSE"] * 2 + ["CONDO"] * 2 + ["MULTI_FAMILY", "LOT"]


def main(n: int = 1500, seed: int = 2024) -> None:
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        lat0, lon0, city, zipcode, typical = ANCHORS[rng.integers(len(ANCHORS))]
        home_type = HOME_TYPES[rng.integers(len(HOME_TYPES))]
        is_lot = home_type == "LOT"
        beds = 0 if is_lot else int(rng.choice([1, 2, 3, 3, 4, 4, 5]))
        sqft = 0 if is_lot else float(round(rng.normal(600 + 520 * beds, 250)))
        price = int(round(typical * np.exp(rng.normal(0, 0.35)) * (0.35 if is_lot else 1), -3))
        rows.append(
            {
                "zpid": 900_000_000 + i,
                "streetAddress": f"{100 + i * 7} Fixture Ln (synthetic)",
                "price": price,
                "bedrooms": beds,
                "bathrooms": 0 if is_lot else max(1, beds - int(rng.integers(0, 2))),
                "livingArea": max(sqft, 0),
                "lotAreaValue": round(float(rng.uniform(0.2, 2.0)), 3) if is_lot else round(float(rng.uniform(2500, 11000))),
                "lotAreaUnits": "acres" if is_lot else "sqft",
                "yearBuilt": 2001.5 if is_lot else int(rng.integers(1950, 2025)),
                "homeType": home_type,
                "latitude": round(lat0 + rng.normal(0, 0.025), 6),
                "longitude": round(lon0 + rng.normal(0, 0.03), 6),
                "city": city,
                "state": "TX",
                "zipcode": zipcode,
                "daysOnZillow": int(rng.integers(0, 180)),
            }
        )
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(TARGET, index=False)
    print(f"Wrote {n} synthetic records -> {TARGET.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
