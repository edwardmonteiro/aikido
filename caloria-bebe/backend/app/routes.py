from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import nutrition, schemas
from .auth import create_token, current_user, hash_password, verify_password
from .db import get_db
from .models import Baby, Feeding, Food, User, Weight

router = APIRouter(prefix="/api")

DEFAULT_TZ = "America/Sao_Paulo"


# --- helpers ---------------------------------------------------------------

def _zone(tz: str) -> ZoneInfo:
    try:
        return ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Unknown timezone: {tz}")


def _utc_bounds(day: date, zone: ZoneInfo, days: int = 1) -> tuple[datetime, datetime]:
    """Naive-UTC [start, end) of `days` local days starting at `day`."""
    start = datetime.combine(day, time.min, tzinfo=zone)
    end = datetime.combine(day + timedelta(days=days), time.min, tzinfo=zone)
    to_utc = lambda d: d.astimezone(timezone.utc).replace(tzinfo=None)  # noqa: E731
    return to_utc(start), to_utc(end)


def _own_baby(baby_id: int, user: User, db: Session) -> Baby:
    baby = db.get(Baby, baby_id)
    if baby is None or baby.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Baby not found")
    return baby


def _weight_on(db: Session, baby: Baby, day: date) -> float | None:
    """Most recent weight on or before `day`; falls back to the earliest known."""
    w = db.scalar(select(Weight).where(Weight.baby_id == baby.id, Weight.measured_on <= day)
                  .order_by(Weight.measured_on.desc()).limit(1))
    if w is None:
        w = db.scalar(select(Weight).where(Weight.baby_id == baby.id).order_by(Weight.measured_on).limit(1))
    return w.weight_kg if w else None


def _summarize(day: date, feedings: list[Feeding], target: float | None) -> schemas.DaySummary:
    by_kind: dict[str, float] = defaultdict(float)
    total = ml = 0.0
    unknown = 0
    for f in feedings:
        if f.kcal is None:
            unknown += 1
        else:
            total += f.kcal
            by_kind[f.kind.value] += f.kcal
        ml += f.amount_ml or 0
    total = round(total, 1)
    return schemas.DaySummary(
        date=day,
        total_kcal=total,
        target_kcal=target,
        percent_of_target=round(100 * total / target, 1) if target else None,
        feedings=len(feedings),
        unknown_kcal_feedings=unknown,
        by_kind={k: round(v, 1) for k, v in by_kind.items()},
        total_ml=round(ml, 1),
    )


# --- health & auth ---------------------------------------------------------

@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.post("/auth/register", response_model=schemas.TokenOut, status_code=201)
def register(body: schemas.RegisterIn, db: Session = Depends(get_db)):
    user = User(email=body.email.lower(), name=body.name, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    return schemas.TokenOut(access_token=create_token(user.id))


@router.post("/auth/login", response_model=schemas.TokenOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return schemas.TokenOut(access_token=create_token(user.id))


@router.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(current_user)):
    return user


# --- babies ----------------------------------------------------------------

@router.get("/babies", response_model=list[schemas.BabyOut])
def list_babies(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Baby).where(Baby.user_id == user.id).order_by(Baby.created_at)).all()


@router.post("/babies", response_model=schemas.BabyOut, status_code=201)
def create_baby(body: schemas.BabyIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    baby = Baby(user_id=user.id, **body.model_dump())
    db.add(baby)
    db.commit()
    return baby


@router.get("/babies/{baby_id}", response_model=schemas.BabyOut)
def get_baby(baby_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _own_baby(baby_id, user, db)


@router.patch("/babies/{baby_id}", response_model=schemas.BabyOut)
def update_baby(baby_id: int, body: schemas.BabyPatch, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    baby = _own_baby(baby_id, user, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(baby, k, v)
    db.commit()
    return baby


@router.delete("/babies/{baby_id}", status_code=204)
def delete_baby(baby_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_own_baby(baby_id, user, db))
    db.commit()
    return Response(status_code=204)


# --- weights ---------------------------------------------------------------

@router.get("/babies/{baby_id}/weights", response_model=list[schemas.WeightOut])
def list_weights(baby_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _own_baby(baby_id, user, db).weights


@router.post("/babies/{baby_id}/weights", response_model=schemas.WeightOut, status_code=201)
def upsert_weight(baby_id: int, body: schemas.WeightIn, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    baby = _own_baby(baby_id, user, db)
    w = db.scalar(select(Weight).where(Weight.baby_id == baby.id, Weight.measured_on == body.measured_on))
    if w is None:
        w = Weight(baby_id=baby.id, measured_on=body.measured_on, weight_kg=body.weight_kg)
        db.add(w)
    else:
        w.weight_kg = body.weight_kg
    db.commit()
    return w


@router.delete("/weights/{weight_id}", status_code=204)
def delete_weight(weight_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    w = db.get(Weight, weight_id)
    if w is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Weight not found")
    _own_baby(w.baby_id, user, db)
    db.delete(w)
    db.commit()
    return Response(status_code=204)


# --- foods & feedings ------------------------------------------------------

@router.get("/foods", response_model=list[schemas.FoodOut])
def list_foods(db: Session = Depends(get_db)):
    return db.scalars(select(Food).order_by(Food.name)).all()


@router.get("/babies/{baby_id}/feedings", response_model=list[schemas.FeedingOut])
def list_feedings(baby_id: int, day: date | None = Query(None, alias="date"), tz: str = DEFAULT_TZ,
                  user: User = Depends(current_user), db: Session = Depends(get_db)):
    baby = _own_baby(baby_id, user, db)
    zone = _zone(tz)
    start, end = _utc_bounds(day or datetime.now(zone).date(), zone)
    return db.scalars(select(Feeding).where(Feeding.baby_id == baby.id, Feeding.fed_at >= start,
                                            Feeding.fed_at < end).order_by(Feeding.fed_at)).all()


@router.post("/babies/{baby_id}/feedings", response_model=schemas.FeedingOut, status_code=201)
def create_feeding(baby_id: int, body: schemas.FeedingIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    baby = _own_baby(baby_id, user, db)
    food = None
    if body.food_id is not None:
        food = db.get(Food, body.food_id)
        if food is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown food_id")
    kcal = body.kcal
    if kcal is None:
        kcal = nutrition.estimate_kcal(body.kind, body.amount_ml, body.amount_g,
                                       food.kcal_per_100g if food else None)
    feeding = Feeding(baby_id=baby.id, **body.model_dump(exclude={"kcal"}), kcal=kcal)
    db.add(feeding)
    db.commit()
    return feeding


@router.delete("/feedings/{feeding_id}", status_code=204)
def delete_feeding(feeding_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = db.get(Feeding, feeding_id)
    if f is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feeding not found")
    _own_baby(f.baby_id, user, db)
    db.delete(f)
    db.commit()
    return Response(status_code=204)


# --- summaries -------------------------------------------------------------

@router.get("/babies/{baby_id}/summary", response_model=schemas.SummaryOut)
def summary(baby_id: int, day: date | None = Query(None, alias="date"), tz: str = DEFAULT_TZ,
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    baby = _own_baby(baby_id, user, db)
    zone = _zone(tz)
    day = day or datetime.now(zone).date()
    start, end = _utc_bounds(day, zone)
    feedings = db.scalars(select(Feeding).where(Feeding.baby_id == baby.id, Feeding.fed_at >= start,
                                                Feeding.fed_at < end)).all()
    months = nutrition.age_in_months(baby.birth_date, day)
    weight = _weight_on(db, baby, day)
    target = nutrition.daily_target_kcal(baby.sex, months, weight)
    base = _summarize(day, list(feedings), target)
    return schemas.SummaryOut(**base.model_dump(), age_months=months, weight_kg=weight,
                              kcal_per_kg_reference=nutrition.kcal_per_kg(baby.sex, months))


@router.get("/babies/{baby_id}/history", response_model=list[schemas.DaySummary])
def history(baby_id: int, days: int = Query(14, ge=1, le=90), tz: str = DEFAULT_TZ,
            user: User = Depends(current_user), db: Session = Depends(get_db)):
    baby = _own_baby(baby_id, user, db)
    zone = _zone(tz)
    first = datetime.now(zone).date() - timedelta(days=days - 1)
    start, end = _utc_bounds(first, zone, days)
    rows = db.scalars(select(Feeding).where(Feeding.baby_id == baby.id, Feeding.fed_at >= start,
                                            Feeding.fed_at < end)).all()
    per_day: dict[date, list[Feeding]] = defaultdict(list)
    for f in rows:
        local = f.fed_at.replace(tzinfo=timezone.utc).astimezone(zone).date()
        per_day[local].append(f)
    out = []
    for i in range(days):
        d = first + timedelta(days=i)
        target = nutrition.daily_target_kcal(baby.sex, nutrition.age_in_months(baby.birth_date, d),
                                             _weight_on(db, baby, d))
        out.append(_summarize(d, per_day[d], target))
    return out
