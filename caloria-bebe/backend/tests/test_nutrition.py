from datetime import date

from app.models import FeedingKind, Sex
from app.nutrition import age_in_months, daily_target_kcal, estimate_kcal, kcal_per_kg


def test_age_in_months_counts_completed_months():
    assert age_in_months(date(2026, 1, 31), date(2026, 2, 28)) == 0
    assert age_in_months(date(2026, 1, 15), date(2026, 2, 15)) == 1
    assert age_in_months(date(2025, 3, 10), date(2026, 3, 9)) == 11
    assert age_in_months(date(2026, 5, 1), date(2026, 4, 1)) == 0


def test_reference_values():
    assert kcal_per_kg(Sex.male, 0) == 113
    assert kcal_per_kg(Sex.female, 11) == 79
    assert kcal_per_kg(Sex.female, 18) == 80
    assert kcal_per_kg(Sex.male, 24) is None


def test_daily_target_needs_weight():
    assert daily_target_kcal(Sex.male, 3, 6.0) == 492
    assert daily_target_kcal(Sex.male, 3, None) is None


def test_estimate_kcal():
    assert estimate_kcal(FeedingKind.formula, 120, None, None) == 80.4
    assert estimate_kcal(FeedingKind.breast_milk, 100, None, None) == 67.0
    assert estimate_kcal(FeedingKind.breast, None, None, None) is None
    assert estimate_kcal(FeedingKind.solid, None, 50, 98) == 49.0
