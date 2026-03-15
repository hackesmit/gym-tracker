"""FastAPI application entry point for Gym Tracker API."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, SessionLocal, engine
from .routers import analytics, logging, programs, tracker
from .seed_catalog import seed_exercise_catalog


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all database tables on startup and seed exercise catalog."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_exercise_catalog(db)
    finally:
        db.close()
    yield


app = FastAPI(title="Gym Tracker API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(programs.router)
app.include_router(logging.router)
app.include_router(tracker.router)
app.include_router(tracker.workout_router)
app.include_router(analytics.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "Gym Tracker API"}
