from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, SessionLocal, engine
from .routes import router
from .seed import seed_foods


@asynccontextmanager
async def lifespan(_: FastAPI):
    # v1 schema management: create missing tables. Move to Alembic before the
    # first change to an existing table.
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_foods(db)
    yield


app = FastAPI(title="Caloria Bebê API", version="1.0.0", lifespan=lifespan,
              docs_url="/api/docs", openapi_url="/api/openapi.json")

if settings.cors_origins:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["*"], allow_headers=["*"])

app.include_router(router)
