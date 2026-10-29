"""Starter food catalog (kcal per 100 g, cooked/prepared, unsalted).

Values are rounded averages from the Brazilian TACO table (NEPA/UNICAMP, 4th
ed.) and USDA FoodData Central. Parents can always override kcal per feeding.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Food

FOODS = [
    ("Banana-prata amassada", 98),
    ("Maçã raspada", 56),
    ("Mamão papaia", 40),
    ("Pera", 53),
    ("Abacate", 96),
    ("Batata-doce cozida", 77),
    ("Batata inglesa cozida", 52),
    ("Mandioquinha cozida", 80),
    ("Abóbora cozida", 48),
    ("Cenoura cozida", 30),
    ("Chuchu cozido", 19),
    ("Brócolis cozido", 25),
    ("Arroz cozido", 128),
    ("Feijão cozido (caldo e grãos)", 76),
    ("Frango cozido desfiado", 163),
    ("Carne bovina moída cozida", 212),
    ("Ovo cozido", 146),
    ("Peixe branco cozido", 110),
    ("Iogurte natural integral", 51),
    ("Papinha salgada (média)", 70),
]


def seed_foods(db: Session) -> None:
    existing = set(db.scalars(select(Food.name)))
    db.add_all(Food(name=n, kcal_per_100g=k) for n, k in FOODS if n not in existing)
    db.commit()
