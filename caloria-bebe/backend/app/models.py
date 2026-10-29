from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Sex(str, Enum):
    male = "male"
    female = "female"


class FeedingKind(str, Enum):
    breast = "breast"            # direct breastfeeding; volume usually unknown
    breast_milk = "breast_milk"  # expressed breast milk in a bottle
    formula = "formula"
    solid = "solid"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    babies: Mapped[list["Baby"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Baby(Base):
    __tablename__ = "babies"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    birth_date: Mapped[date] = mapped_column(Date)
    sex: Mapped[Sex] = mapped_column(SAEnum(Sex, native_enum=False, length=10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="babies")
    weights: Mapped[list["Weight"]] = relationship(cascade="all, delete-orphan", order_by="Weight.measured_on")
    feedings: Mapped[list["Feeding"]] = relationship(cascade="all, delete-orphan")


class Weight(Base):
    __tablename__ = "weights"
    __table_args__ = (UniqueConstraint("baby_id", "measured_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    baby_id: Mapped[int] = mapped_column(ForeignKey("babies.id", ondelete="CASCADE"), index=True)
    measured_on: Mapped[date] = mapped_column(Date)
    weight_kg: Mapped[float] = mapped_column(Float)


class Food(Base):
    __tablename__ = "foods"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    kcal_per_100g: Mapped[float] = mapped_column(Float)


class Feeding(Base):
    __tablename__ = "feedings"

    id: Mapped[int] = mapped_column(primary_key=True)
    baby_id: Mapped[int] = mapped_column(ForeignKey("babies.id", ondelete="CASCADE"), index=True)
    fed_at: Mapped[datetime] = mapped_column(DateTime, index=True)  # naive UTC
    kind: Mapped[FeedingKind] = mapped_column(SAEnum(FeedingKind, native_enum=False, length=20))
    amount_ml: Mapped[float | None] = mapped_column(Float)
    amount_g: Mapped[float | None] = mapped_column(Float)
    duration_min: Mapped[int | None] = mapped_column(Integer)
    food_id: Mapped[int | None] = mapped_column(ForeignKey("foods.id", ondelete="SET NULL"))
    kcal: Mapped[float | None] = mapped_column(Float)  # None = unknown (e.g. breastfeeding without volume)
    notes: Mapped[str | None] = mapped_column(Text)

    food: Mapped[Food | None] = relationship()
