import textwrap

import pandas as pd
import pytest

from app.data.ingest import IngestionError, ingest, normalise_zipcode


def write(tmp_path, name, text):
    path = tmp_path / name
    path.write_text(textwrap.dedent(text).strip() + "\n")
    return path


CLEAN = """
zpid,price,bedrooms,bathrooms,livingArea,lotAreaValue,yearBuilt,homeType,latitude,longitude,city,zipcode,zestimate,rentZestimate,daysOnZillow,has_zestimate,has_rent_zestimate
1,450000,4,3,1943,6769.2,2018,SINGLE_FAMILY,29.86,-95.19,houston,77044,439700,2099,18,1,1
2,300000,3,2,1500,0.30,2001.5,SINGLE_FAMILY,29.90,-95.20,Houston,7044,376400,2400,5,0,0
3,99000,0,0,0,1.5,2001.5,LOT,29.95,-95.30,Katy,77494.0,376400,2400,40,0,0
4,500000,3,2,1800,7000,1999,TOWNHOUSE,40.71,-74.00,New York,10001,1,1,1,1,1
1,450000,4,3,1943,6769.2,2018,SINGLE_FAMILY,29.86,-95.19,Houston,77044,439700,2099,18,1,1
"""


def test_ingest_normalises_and_cleans(tmp_path):
    df, report = ingest(write(tmp_path, "clean.csv", CLEAN))
    assert list(df["id"]) == ["1", "2", "3"]
    assert report.dropped_invalid_coordinates == 1  # New York row
    assert report.dropped_duplicate_ids == 1

    by_id = df.set_index("id")
    assert by_id.loc["1", "zipcode"] == "77044"
    assert by_id.loc["2", "zipcode"] == "07044"  # zero-padded, kept as text
    assert by_id.loc["3", "zipcode"] == "77494"
    assert by_id.loc["1", "city"] == "Houston"

    # Placeholder Zestimates (has_zestimate = 0) must not survive as real numbers.
    assert pd.isna(by_id.loc["2", "zestimate"]) and pd.isna(by_id.loc["2", "rent_zestimate"])
    assert by_id.loc["1", "zestimate"] == 439700
    # Imputed fractional year and zeroed land attributes become null.
    assert pd.isna(by_id.loc["2", "year_built"])
    assert pd.isna(by_id.loc["3", "bedrooms"]) and pd.isna(by_id.loc["3", "living_area_sqft"])
    # Without explicit units, small lot values are treated as acres and flagged as inferred.
    assert by_id.loc["3", "lot_area_sqft"] == pytest.approx(1.5 * 43560)
    assert by_id.loc["3", "lot_area_source"] == "inferred_acres"
    assert by_id.loc["1", "lot_area_source"] == "inferred_sqft"


def test_details_join_supplies_addresses_units_and_detects_imputation(tmp_path):
    details = write(
        tmp_path,
        "details.csv",
        """
        zpid,street_address,state,bedrooms,bathrooms,living_area_sqft,lot_area_value,lot_area_unit,tax_assessed_value
        1,13234 Vallentine Row Dr,TX,4,3,1943,6769.2,sqft,244880
        2,1 Example St,TX,,2,1500,0.30,acres,
        """,
    )
    df, report = ingest(write(tmp_path, "clean.csv", CLEAN), details)
    by_id = df.set_index("id")
    assert report.details_joined == 3  # ids 1, 2 and the duplicate of 1 (before dedupe)
    assert by_id.loc["1", "street_address"] == "13234 Vallentine Row Dr"
    assert by_id.loc["2", "lot_area_source"] == "converted_from_acres"
    assert by_id.loc["2", "lot_area_sqft"] == pytest.approx(0.30 * 43560)
    assert pd.isna(by_id.loc["2", "bedrooms"])  # missing in the original listing -> imputed in clean CSV
    assert by_id.loc["1", "tax_assessed_value"] == 244880


def test_missing_coordinates_column_is_rejected(tmp_path):
    with pytest.raises(IngestionError):
        ingest(write(tmp_path, "bad.csv", "price,bedrooms\n1,2"))


def test_zip_normalisation_variants():
    out = normalise_zipcode(pd.Series([77044, "77044-1234", 7044.0, None, "abc"]))
    assert out.tolist()[:3] == ["77044", "77044", "07044"]
    assert pd.isna(out.iloc[3]) and pd.isna(out.iloc[4])
