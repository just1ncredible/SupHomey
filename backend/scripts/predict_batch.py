"""Validate a model bundle and (optionally) write batch predictions for every property.

    python scripts/predict_batch.py                       # check models/current, print a summary
    python scripts/predict_batch.py --write               # also write models/predictions/predictions.csv
    python scripts/predict_batch.py --model-dir path/to/bundle --out path/to/predictions.csv --write

The batch file uses the same feature pipeline as real-time serving, so the map, filters and
statistics can show model values for all properties without per-request inference.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.data.loader import load_dataset  # noqa: E402
from app.ml.predictor import ModelBundle  # noqa: E402


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model-dir", type=Path, default=settings.resolve(settings.model_dir))
    parser.add_argument("--out", type=Path, default=settings.resolve(settings.predictions_path))
    parser.add_argument("--write", action="store_true", help="write the predictions CSV")
    args = parser.parse_args()

    bundle = ModelBundle.load(args.model_dir)
    card = bundle.card
    print(f"Model: {card.name} v{card.version} ({card.framework}), {len(card.features)} features")

    dataset = load_dataset(settings)
    if dataset.is_synthetic:
        print("WARNING: dataset is the SYNTHETIC fixture — predictions will not be meaningful.")
    frame = dataset.frame
    results = bundle.predict_frame(frame)
    values = np.array([r.value if r.value is not None else np.nan for r in results])
    ok = ~np.isnan(values)
    missing = pd.Series([f for r in results for f in (r.missing_required or [])]).value_counts()

    print(f"Predicted {ok.sum():,} of {len(frame):,} properties")
    if not missing.empty:
        print("Skipped for missing required features:", missing.to_dict())
    if ok.any():
        print(f"Prediction median ${np.nanmedian(values):,.0f}  (range ${np.nanmin(values):,.0f} – ${np.nanmax(values):,.0f})")
        listed = frame["list_price"].to_numpy(dtype=float)
        both = ok & ~np.isnan(listed)
        mae = np.mean(np.abs(values[both] - listed[both]))
        print(f"Mean |prediction - listing price| over the full dataset: ${mae:,.0f} (in-sample sanity check, NOT a validation metric)")

    if args.write:
        out = pd.DataFrame(
            {
                "property_id": frame["id"].astype(str),
                "predicted_price": np.round(values, 0),
                "predicted_low": [round(r.low) if r.low else None for r in results],
                "predicted_high": [round(r.high) if r.high else None for r in results],
                "interval_coverage": card.interval.coverage if card.interval else None,
                "model_name": card.name,
                "model_version": card.version,
                "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }
        )[ok]
        args.out.parent.mkdir(parents=True, exist_ok=True)
        out.to_csv(args.out, index=False)
        print(f"Wrote {len(out):,} rows -> {args.out}")
        print("Reload in the app (model chip -> Reload) or POST /api/model/reload.")


if __name__ == "__main__":
    main()
