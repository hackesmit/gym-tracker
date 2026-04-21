"""Shared test fixtures — in-memory SQLite database, test client, seeded user."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user, hash_password
from app.database import Base, get_db
from app.main import app
from app.models import User


@pytest.fixture()
def db():
    """Yield a fresh in-memory SQLite session for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed a default user with username/password so auth flows work
    user = User(
        name="testuser",
        username="testuser",
        password_hash=hash_password("password"),
    )
    session.add(user)
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    """FastAPI TestClient with DB + auth dependency overrides."""
    def _override_get_db():
        try:
            yield db
        finally:
            pass

    def _override_get_current_user():
        # Return the first user (seeded above) — tests can override per-test if needed
        return db.query(User).first()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
