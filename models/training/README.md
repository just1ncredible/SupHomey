# LSTM training reference

[housing_price_prediction_model.py](housing_price_prediction_model.py) is the original training
script supplied by the ML team, preserved unchanged. It documents the workflow used for the
LSTM predictions served from [`../predictions/predictions.csv`](../predictions/predictions.csv).
It runs separately from the web app; adding this source does not train or load a live model.

## Training workflow

- Load `properties_clean_v2.csv`, normalize city names and exclude vacant lots (`LOT`).
- Label-encode home type, city, year built and ZIP code. Exclude property ID, price,
  Zestimates, Zestimate availability flags and days on Zillow from the input features.
- Split 80% training / 20% test with seed 42, then standardize features and target.
- Treat each feature as one LSTM timestep. Train LSTM layers with 64 and 32 units,
  dropout, a 32-unit dense layer and a single price output.
- Use Adam, early stopping and learning-rate reduction, with up to 150 epochs and a
  validation split of 20% of the training portion.
- Print test MAE, RMSE, MAPE and R², plot diagnostics and export predictions in dollars.

## Running the original script

Use a separate Python environment with `tensorflow`, `scikit-learn`, `pandas`, `numpy`,
`matplotlib`, `seaborn` and `Pillow`. Exact versions from the training environment were
not included with the script.

Place the original **`properties_clean_v2.csv`** in your working directory, then run the
script using its path. For example, from this directory with the CSV alongside the script:

```bash
python housing_price_prediction_model.py
```

The training CSV is not included here. The script expects its original column names and
preprocessing; the app's downloaded dataset is not documented as a drop-in replacement.
Plots are displayed interactively, and output CSVs are written to the working directory:

- `housing_test_predictions_lstm.csv`: predictions for the held-out test split.
- `housing_price_predictions_lstm.csv`: predictions for all remaining homes, including
  training homes. The original script refits the input scaler for this final export, so
  these error columns should not be interpreted as held-out test performance.

The app uses the full-dataset prediction export as batch valuations. This script documents
the property-price model; the separate **Ask SupHomey** assistant is described in the
[project README](../../README.md#7-ask-suphomey-ai-search).
