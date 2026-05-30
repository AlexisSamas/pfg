from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import get_password_hash
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models import ExamSession, User, WaitPeriod


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
    )
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        db.add(
            User(
                username="student",
                email="student@example.com",
                hashed_password=get_password_hash("secret123"),
                role="student",
            )
        )
        db.add(
            User(
                username="other",
                email="other@example.com",
                hashed_password=get_password_hash("secret123"),
                role="student",
            )
        )
        db.commit()
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        test_client.close()
        app.dependency_overrides.clear()


@pytest.fixture
def auth_headers(client):
    response = client.post(
        "/auth/token",
        json={"username": "student", "password": "secret123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_headers(client):
    response = client.post(
        "/auth/token",
        json={"username": "other", "password": "secret123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def cpt_events(good=True):
    if good:
        return [
            {
                "game_type": "cpt",
                "event_type": "trial",
                "timestamp_us": index,
                "reaction_time_ms": 300,
                "is_correct": True,
                "stimulus_type": "target",
            }
            for index in range(1, 10)
        ] + [
            {
                "game_type": "cpt",
                "event_type": "trial",
                "timestamp_us": 10,
                "reaction_time_ms": None,
                "is_correct": False,
                "stimulus_type": "target",
            },
            {
                "game_type": "cpt",
                "event_type": "trial",
                "timestamp_us": 11,
                "reaction_time_ms": 250,
                "is_correct": False,
                "stimulus_type": "non_target",
            },
        ] + [
            {
                "game_type": "cpt",
                "event_type": "trial",
                "timestamp_us": index,
                "reaction_time_ms": None,
                "is_correct": True,
                "stimulus_type": "non_target",
            }
            for index in range(12, 21)
        ]

    return [
        {
            "game_type": "cpt",
            "event_type": "trial",
            "timestamp_us": index,
            "reaction_time_ms": 300 if index <= 8 else None,
            "is_correct": index <= 8,
            "stimulus_type": "target",
        }
        for index in range(1, 11)
    ] + [
        {
            "game_type": "cpt",
            "event_type": "trial",
            "timestamp_us": index,
            "reaction_time_ms": 250 if index <= 12 else None,
            "is_correct": index > 12,
            "stimulus_type": "non_target",
        }
        for index in range(11, 21)
    ]


def access_events():
    return cpt_events(good=True) + [
        {
            "game_type": "stroop",
            "event_type": "trial",
            "timestamp_us": 21,
            "reaction_time_ms": 400,
            "is_correct": True,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "stroop",
            "event_type": "trial",
            "timestamp_us": 22,
            "reaction_time_ms": 420,
            "is_correct": True,
            "stimulus_type": "incongruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 23,
            "reaction_time_ms": 350,
            "is_correct": True,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 24,
            "reaction_time_ms": 370,
            "is_correct": True,
            "stimulus_type": "incongruent",
        },
    ]


def wait_events():
    return cpt_events(good=False) + [
        {
            "game_type": "stroop",
            "event_type": "trial",
            "timestamp_us": 21,
            "reaction_time_ms": 500,
            "is_correct": True,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "stroop",
            "event_type": "trial",
            "timestamp_us": 22,
            "reaction_time_ms": 600,
            "is_correct": True,
            "stimulus_type": "incongruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 23,
            "reaction_time_ms": 500,
            "is_correct": True,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 24,
            "reaction_time_ms": 575,
            "is_correct": True,
            "stimulus_type": "incongruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 25,
            "reaction_time_ms": 600,
            "is_correct": False,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 26,
            "reaction_time_ms": 650,
            "is_correct": False,
            "stimulus_type": "incongruent",
        },
    ]


def create_session(client, headers, context_id):
    response = client.post(
        "/sessions",
        json={"context_id": context_id},
        headers=headers,
    )
    assert response.status_code == 201
    return response.json()


def send_events(client, headers, session_id, events):
    response = client.post(
        f"/sessions/{session_id}/events",
        json={"events": events},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["received"] == len(events)


def test_login_returns_token(client):
    response = client.post(
        "/auth/token",
        json={"username": "student", "password": "secret123"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


def test_create_session_requires_token(client):
    response = client.post("/sessions", json={"context_id": "exam-no-token"})

    assert response.status_code == 401


def test_create_session_with_valid_token(client, auth_headers):
    session = create_session(client, auth_headers, "exam-create")

    assert session["id"]
    assert session["context_id"] == "exam-create"
    assert session["attempt_number"] == 1
    assert session["status"] == "active"


def test_events_result_decision_and_wait_flow(client, auth_headers, db_session):
    access_session = create_session(client, auth_headers, "exam-access")
    send_events(client, auth_headers, access_session["id"], access_events())

    result_response = client.get(
        f"/sessions/{access_session['id']}/result",
        headers=auth_headers,
    )
    assert result_response.status_code == 200
    access_result = result_response.json()
    assert access_result["decision"] == "ACCESO"
    assert 0 <= access_result["score"] <= 100

    decision_response = client.get(
        f"/sessions/{access_session['id']}/decision",
        headers=auth_headers,
    )
    assert decision_response.status_code == 200
    decision = decision_response.json()
    assert decision["session_id"] == access_session["id"]
    assert decision["context_id"] == "exam-access"
    assert decision["decision"] == "ACCESO"
    assert decision["score"] == access_result["score"]

    wait_session = create_session(client, auth_headers, "exam-wait")
    send_events(client, auth_headers, wait_session["id"], wait_events())

    wait_result_response = client.get(
        f"/sessions/{wait_session['id']}/result",
        headers=auth_headers,
    )
    assert wait_result_response.status_code == 200
    wait_result = wait_result_response.json()
    assert wait_result["decision"] == "ESPERA"

    wait_response = client.get(
        f"/sessions/{wait_session['id']}/wait",
        headers=auth_headers,
    )
    assert wait_response.status_code == 200
    wait_payload = wait_response.json()
    assert wait_payload["wait_until"]
    assert wait_payload["recommendation_key"] == wait_result["recommendation_key"]
    assert wait_payload["reason"] == "decision_espera"

    retry_response = client.post(
        "/sessions",
        json={"context_id": "exam-wait"},
        headers=auth_headers,
    )
    assert retry_response.status_code == 429

    wait_period = db_session.query(WaitPeriod).filter(
        WaitPeriod.context_id == "exam-wait"
    ).one()
    wait_period.wait_until = datetime.utcnow() - timedelta(minutes=1)
    db_session.commit()

    retry_after_expiry = client.post(
        "/sessions",
        json={"context_id": "exam-wait"},
        headers=auth_headers,
    )
    assert retry_after_expiry.status_code == 201
    assert retry_after_expiry.json()["attempt_number"] == 2


def test_session_access_control(client, auth_headers, other_headers):
    session = create_session(client, auth_headers, "exam-owned")

    missing_response = client.get("/sessions/999999/result", headers=auth_headers)
    assert missing_response.status_code == 404

    forbidden_events_response = client.post(
        f"/sessions/{session['id']}/events",
        json={"events": access_events()},
        headers=other_headers,
    )
    assert forbidden_events_response.status_code == 403

    forbidden_result_response = client.get(
        f"/sessions/{session['id']}/result",
        headers=other_headers,
    )
    assert forbidden_result_response.status_code == 403

    forbidden_decision_response = client.get(
        f"/sessions/{session['id']}/decision",
        headers=other_headers,
    )
    assert forbidden_decision_response.status_code == 403

    forbidden_wait_response = client.get(
        f"/sessions/{session['id']}/wait",
        headers=other_headers,
    )
    assert forbidden_wait_response.status_code == 403
