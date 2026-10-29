from datetime import date, datetime, timezone

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import FeedingKind, Sex


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(ORM):
    id: int
    email: str
    name: str


class BabyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    birth_date: date
    sex: Sex

    @field_validator("birth_date")
    @classmethod
    def not_in_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("birth_date cannot be in the future")
        return v


class BabyPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    birth_date: date | None = None
    sex: Sex | None = None


class BabyOut(ORM):
    id: int
    name: str
    birth_date: date
    sex: Sex


class WeightIn(BaseModel):
    measured_on: date
    weight_kg: float = Field(gt=0.3, lt=40)


class WeightOut(ORM):
    id: int
    measured_on: date
    weight_kg: float


class FoodOut(ORM):
    id: int
    name: str
    kcal_per_100g: float


class FeedingIn(BaseModel):
    fed_at: datetime
    kind: FeedingKind
    amount_ml: float | None = Field(default=None, gt=0, le=1000)
    amount_g: float | None = Field(default=None, gt=0, le=1000)
    duration_min: int | None = Field(default=None, gt=0, le=180)
    food_id: int | None = None
    kcal: float | None = Field(default=None, ge=0, le=2000)  # manual override
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator("fed_at")
    @classmethod
    def to_naive_utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("fed_at must include a timezone offset")
        return v.astimezone(timezone.utc).replace(tzinfo=None)

    @model_validator(mode="after")
    def check_kind_fields(self) -> "FeedingIn":
        if self.kind in (FeedingKind.formula, FeedingKind.breast_milk) and not (self.amount_ml or self.kcal):
            raise ValueError("amount_ml is required for bottle feedings")
        if self.kind is FeedingKind.solid and not (self.amount_g or self.kcal):
            raise ValueError("amount_g is required for solid feedings")
        return self


class FeedingOut(ORM):
    id: int
    fed_at: datetime
    kind: FeedingKind
    amount_ml: float | None
    amount_g: float | None
    duration_min: int | None
    food_id: int | None
    kcal: float | None
    notes: str | None

    @field_validator("fed_at")
    @classmethod
    def mark_utc(cls, v: datetime) -> datetime:
        return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v


class DaySummary(BaseModel):
    date: date
    total_kcal: float
    target_kcal: float | None
    percent_of_target: float | None
    feedings: int
    unknown_kcal_feedings: int  # e.g. breastfeeding with no volume estimate
    by_kind: dict[str, float]
    total_ml: float


class SummaryOut(DaySummary):
    age_months: int
    weight_kg: float | None
    kcal_per_kg_reference: float | None
