"""Energy reference values and kcal estimation.

Targets are the FAO/WHO/UNU (2004) "Human energy requirements" values for
infants, in kcal per kg of body weight per day, by completed month of age.
They are population averages for healthy, growing infants — a guide for
parents, not a prescription. Individual needs vary; the paediatrician decides.
"""

from datetime import date

from .models import FeedingKind, Sex

# Index = completed months (0..11). FAO/WHO/UNU 2004, Table 3.4 (mixed feeding).
_KCAL_PER_KG_INFANT = {
    Sex.male: [113, 104, 95, 82, 81, 81, 79, 79, 79, 80, 80, 81],
    Sex.female: [107, 101, 94, 84, 82, 81, 78, 78, 78, 79, 79, 79],
}
# 12–23 months, same source (Table 4.2 rounded).
_KCAL_PER_KG_TODDLER = {Sex.male: 82, Sex.female: 80}

# Average energy density (kcal per ml).
BREAST_MILK_KCAL_PER_ML = 0.67  # mature human milk ~65–70 kcal/100 ml
FORMULA_KCAL_PER_ML = 0.67      # standard infant formula, regulated at 60–70 kcal/100 ml

MAX_AGE_MONTHS = 24


def age_in_months(birth: date, on: date) -> int:
    months = (on.year - birth.year) * 12 + (on.month - birth.month)
    if on.day < birth.day:
        months -= 1
    return max(months, 0)


def kcal_per_kg(sex: Sex, months: int) -> float | None:
    if months < 12:
        return _KCAL_PER_KG_INFANT[sex][months]
    if months < MAX_AGE_MONTHS:
        return _KCAL_PER_KG_TODDLER[sex]
    return None


def daily_target_kcal(sex: Sex, months: int, weight_kg: float | None) -> float | None:
    per_kg = kcal_per_kg(sex, months)
    if per_kg is None or not weight_kg:
        return None
    return round(per_kg * weight_kg)


def estimate_kcal(
    kind: FeedingKind,
    amount_ml: float | None,
    amount_g: float | None,
    food_kcal_per_100g: float | None,
) -> float | None:
    """Best-effort kcal for a feeding. Returns None when it can't be known."""
    if kind is FeedingKind.formula and amount_ml:
        return round(amount_ml * FORMULA_KCAL_PER_ML, 1)
    if kind in (FeedingKind.breast_milk, FeedingKind.breast) and amount_ml:
        return round(amount_ml * BREAST_MILK_KCAL_PER_ML, 1)
    if kind is FeedingKind.solid and amount_g and food_kcal_per_100g is not None:
        return round(amount_g * food_kcal_per_100g / 100, 1)
    return None
