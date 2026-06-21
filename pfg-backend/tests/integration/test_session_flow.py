"""Integration tests del flujo API principal segun la memoria del TFG."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.password import get_password_hash
from app.auth.jwt_service import decode_access_token
from app.core.config import settings
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models import AccessDecision, ExamSession, ScoringResult, User, WaitPeriod
from app.services.cooldown_cache import CooldownInfo


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
        db.add(
            User(
                username="instructor",
                email="instructor@example.com",
                hashed_password=get_password_hash("secret123"),
                role="instructor",
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


@pytest.fixture
def instructor_headers(client):
    response = client.post(
        "/auth/token",
        json={"username": "instructor", "password": "secret123"},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def login_payload(client, username="student", password="secret123"):
    response = client.post(
        "/auth/token",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return decode_access_token(response.json()["access_token"])


def get_user(db_session, username="student"):
    return db_session.query(User).filter(User.username == username).first()


def add_scored_session(
    db_session,
    user,
    context_id="exam-jwt",
    score=75.0,
    decision="ACCESO",
):
    session = ExamSession(
        user_id=user.id,
        context_id=context_id,
        attempt_number=1,
        status="completed",
        completed_at=datetime.utcnow(),
    )
    db_session.add(session)
    db_session.commit()
    scoring_result = ScoringResult(
        session_id=session.id,
        score=score,
        decision=decision,
        weakest_metric="d_prime",
        recommendation_key="low_dprime" if decision != "ACCESO" else "none",
        computed_at=datetime.utcnow(),
    )
    db_session.add(scoring_result)
    db_session.commit()
    db_session.refresh(session)
    return session, scoring_result


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


def block_events():
    return [
        {
            "game_type": "cpt",
            "event_type": "trial",
            "timestamp_us": index,
            "reaction_time_ms": None,
            "is_correct": False,
            "stimulus_type": "target",
        }
        for index in range(1, 11)
    ] + [
        {
            "game_type": "cpt",
            "event_type": "trial",
            "timestamp_us": index,
            "reaction_time_ms": 250,
            "is_correct": False,
            "stimulus_type": "non_target",
        }
        for index in range(11, 21)
    ] + [
        {
            "game_type": "stroop",
            "event_type": "trial",
            "timestamp_us": 21,
            "reaction_time_ms": 700,
            "is_correct": False,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "stroop",
            "event_type": "trial",
            "timestamp_us": 22,
            "reaction_time_ms": 850,
            "is_correct": False,
            "stimulus_type": "incongruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 23,
            "reaction_time_ms": 700,
            "is_correct": False,
            "stimulus_type": "congruent",
        },
        {
            "game_type": "flanker",
            "event_type": "trial",
            "timestamp_us": 24,
            "reaction_time_ms": 850,
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


def create_max_sessions(client, headers, context_id):
    sessions = []
    for _ in range(settings.MAX_ATTEMPTS):
        sessions.append(create_session(client, headers, context_id))
    return sessions


def send_events(client, headers, session_id, events):
    response = client.post(
        f"/sessions/{session_id}/events",
        json={"events": events},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["received"] == len(events)


def create_blocked_result(client, headers, context_id):
    session = create_session(client, headers, context_id)
    send_events(client, headers, session["id"], block_events())
    result_response = client.get(
        f"/sessions/{session['id']}/result",
        headers=headers,
    )
    assert result_response.status_code == 200
    result = result_response.json()
    assert result["decision"] == "BLOQUEO"
    assert result["score"] < 40
    return session, result


def test_login_returns_token(client):
    response = client.post(
        "/auth/token",
        json={"username": "student", "password": "secret123"},
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]


def test_login_without_evaluation_has_null_last_evaluation(client):
    payload = login_payload(client)

    assert payload["role"] == "student"
    assert payload["last_evaluation"] is None


def test_login_with_previous_evaluation_includes_last_evaluation(
    client,
    db_session,
):
    user = get_user(db_session)
    session, scoring_result = add_scored_session(
        db_session=db_session,
        user=user,
        context_id="exam-login-claim",
        score=75.0,
        decision="ACCESO",
    )

    payload = login_payload(client)

    assert payload["last_evaluation"]["session_id"] == session.id
    assert payload["last_evaluation"]["context_id"] == "exam-login-claim"
    assert payload["last_evaluation"]["score"] == scoring_result.score
    assert payload["last_evaluation"]["decision"] == "ACCESO"


def test_login_with_wait_result_includes_wait_until(client, db_session):
    user = get_user(db_session)
    session, _ = add_scored_session(
        db_session=db_session,
        user=user,
        context_id="exam-login-wait",
        score=55.0,
        decision="ESPERA",
    )
    wait_until = datetime.utcnow() + timedelta(minutes=10)
    db_session.add(
        WaitPeriod(
            user_id=user.id,
            context_id=session.context_id,
            attempt_number=session.attempt_number,
            wait_until=wait_until,
            reason="decision_espera",
            recommendation_key="low_dprime",
        )
    )
    db_session.commit()

    payload = login_payload(client)

    assert payload["last_evaluation"]["decision"] == "ESPERA"
    assert payload["last_evaluation"]["wait_until"] is not None
    assert datetime.fromisoformat(
        payload["last_evaluation"]["wait_until"].replace("Z", "+00:00")
    )


def test_login_with_expired_wait_result_keeps_wait_until(client, db_session):
    user = get_user(db_session)
    session, _ = add_scored_session(
        db_session=db_session,
        user=user,
        context_id="exam-login-expired-wait",
        score=55.0,
        decision="ESPERA",
    )
    wait_until = datetime.utcnow() - timedelta(minutes=1)
    db_session.add(
        WaitPeriod(
            user_id=user.id,
            context_id=session.context_id,
            attempt_number=session.attempt_number,
            wait_until=wait_until,
            reason="decision_espera",
            recommendation_key="low_dprime",
        )
    )
    db_session.commit()

    payload = login_payload(client)

    assert payload["last_evaluation"]["decision"] == "ESPERA"
    assert payload["last_evaluation"]["wait_until"] is not None
    assert datetime.fromisoformat(
        payload["last_evaluation"]["wait_until"].replace("Z", "+00:00")
    )


def test_login_with_wait_result_falls_back_to_context_wait_period(
    client,
    db_session,
):
    user = get_user(db_session)
    session, _ = add_scored_session(
        db_session=db_session,
        user=user,
        context_id="exam_demo_05",
        score=57.0,
        decision="ESPERA",
    )
    wait_until = datetime.utcnow() - timedelta(minutes=1)
    db_session.add(
        WaitPeriod(
            user_id=user.id,
            context_id=session.context_id,
            attempt_number=session.attempt_number + 1,
            wait_until=wait_until,
            reason="decision_espera",
            recommendation_key="high_stroop_error_rate",
        )
    )
    db_session.commit()

    payload = login_payload(client)

    assert payload["last_evaluation"]["session_id"] == session.id
    assert payload["last_evaluation"]["context_id"] == "exam_demo_05"
    assert payload["last_evaluation"]["decision"] == "ESPERA"
    assert payload["last_evaluation"]["wait_until"] is not None
    assert datetime.fromisoformat(
        payload["last_evaluation"]["wait_until"].replace("Z", "+00:00")
    )


def test_login_with_block_result_requires_manual_grant(client, db_session):
    user = get_user(db_session)
    add_scored_session(
        db_session=db_session,
        user=user,
        context_id="exam-login-block",
        score=20.0,
        decision="BLOQUEO",
    )

    payload = login_payload(client)

    assert payload["last_evaluation"]["decision"] == "BLOQUEO"
    assert payload["last_evaluation"]["requires_manual_grant"] is True


def test_login_after_manual_grant_reflects_access(client, db_session):
    user = get_user(db_session)
    session, scoring_result = add_scored_session(
        db_session=db_session,
        user=user,
        context_id="exam-login-manual",
        score=20.0,
        decision="BLOQUEO",
    )
    db_session.add(
        AccessDecision(
            session_id=session.id,
            user_id=user.id,
            context_id=session.context_id,
            decision="ACCESO",
            score=scoring_result.score,
            consumed_by="manual_grant",
            consumed_at=datetime.utcnow() + timedelta(seconds=1),
        )
    )
    db_session.commit()

    payload = login_payload(client)

    assert payload["last_evaluation"]["decision"] == "ACCESO"
    assert payload["last_evaluation"]["manual_grant"] is True
    assert payload["last_evaluation"]["requires_manual_grant"] is False


def test_create_session_requires_token(client):
    response = client.post("/sessions", json={"context_id": "exam-no-token"})

    assert response.status_code == 401


def test_create_session_with_valid_token(client, auth_headers):
    session = create_session(client, auth_headers, "exam-create")

    assert session["id"]
    assert session["context_id"] == "exam-create"
    assert session["attempt_number"] == 1
    assert session["status"] == "active"


def test_events_result_decision_and_wait_flow(
    client,
    auth_headers,
    db_session,
    monkeypatch,
):
    cached_wait_periods = []
    monkeypatch.setattr(
        "app.services.scoring.cooldown_cache.set_cooldown_from_wait_period",
        lambda wait_period: cached_wait_periods.append(wait_period) or True,
    )

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
    assert cached_wait_periods
    assert cached_wait_periods[-1].context_id == "exam-wait"

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


def test_result_returns_updated_access_token(client, auth_headers):
    session = create_session(client, auth_headers, "exam-result-token")
    send_events(client, auth_headers, session["id"], access_events())

    response = client.get(
        f"/sessions/{session['id']}/result",
        headers=auth_headers,
    )

    assert response.status_code == 200
    result = response.json()
    new_access_token = result["new_access_token"]
    assert new_access_token
    payload = decode_access_token(new_access_token)
    assert payload["last_evaluation"]["session_id"] == session["id"]
    assert payload["last_evaluation"]["context_id"] == "exam-result-token"
    assert payload["last_evaluation"]["decision"] == result["decision"]


def test_wait_result_returns_updated_access_token_with_wait_until(
    client,
    auth_headers,
    monkeypatch,
):
    monkeypatch.setattr(
        "app.services.scoring.cooldown_cache.set_cooldown_from_wait_period",
        lambda wait_period: True,
    )
    session = create_session(client, auth_headers, "exam-result-token-wait")
    send_events(client, auth_headers, session["id"], wait_events())

    response = client.get(
        f"/sessions/{session['id']}/result",
        headers=auth_headers,
    )

    assert response.status_code == 200
    result = response.json()
    assert result["decision"] == "ESPERA"
    new_access_token = result["new_access_token"]
    assert new_access_token
    payload = decode_access_token(new_access_token)
    assert payload["last_evaluation"]["session_id"] == session["id"]
    assert payload["last_evaluation"]["decision"] == "ESPERA"
    assert payload["last_evaluation"]["wait_until"] is not None
    assert datetime.fromisoformat(
        payload["last_evaluation"]["wait_until"].replace("Z", "+00:00")
    )


def test_result_does_not_fail_when_wait_result_has_no_wait_period(
    client,
    auth_headers,
    db_session,
):
    session_payload = create_session(client, auth_headers, "exam-wait-no-period")
    session = db_session.get(ExamSession, session_payload["id"])
    assert session is not None
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    db_session.add(
        ScoringResult(
            session_id=session.id,
            score=55.0,
            decision="ESPERA",
            weakest_metric="stroop_error_rate",
            recommendation_key="high_stroop_error_rate",
            computed_at=datetime.utcnow(),
        )
    )
    db_session.commit()

    response = client.get(
        f"/sessions/{session_payload['id']}/result",
        headers=auth_headers,
    )

    assert response.status_code == 200
    result = response.json()
    assert result["decision"] == "ESPERA"
    assert result["new_access_token"]
    payload = decode_access_token(result["new_access_token"])
    assert payload["last_evaluation"]["session_id"] == session_payload["id"]
    assert payload["last_evaluation"]["decision"] == "ESPERA"
    assert payload["last_evaluation"]["wait_until"] is None


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


def test_student_cannot_access_dashboard(client, auth_headers):
    dashboard_response = client.get(
        "/dashboard/context/exam-dashboard",
        headers=auth_headers,
    )
    assert dashboard_response.status_code == 403

    grant_response = client.post(
        "/dashboard/grant-manual",
        json={
            "user_id": 1,
            "context_id": "exam-dashboard",
            "reason": "manual grant",
        },
        headers=auth_headers,
    )
    assert grant_response.status_code == 403


def test_instructor_can_query_empty_dashboard(client, instructor_headers):
    response = client.get(
        "/dashboard/context/empty-context",
        headers=instructor_headers,
    )

    assert response.status_code == 200
    assert response.json() == []


def test_dashboard_returns_session_with_scoring(
    client,
    auth_headers,
    instructor_headers,
    db_session,
):
    session = create_session(client, auth_headers, "exam-dashboard")
    db_session.add(
        ScoringResult(
            session_id=session["id"],
            trm_ms=300,
            d_prime=2.5,
            stroop_effect_ms=35,
            flanker_effect_ms=25,
            stroop_error_rate=0.05,
            flanker_accuracy=0.95,
            score=88.0,
            decision="ACCESO",
            weakest_metric="stroop_error_rate",
            recommendation_key="none",
        )
    )
    db_session.commit()

    response = client.get(
        "/dashboard/context/exam-dashboard",
        headers=instructor_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    status_payload = payload[0]
    assert status_payload["user_id"] == 1
    assert status_payload["latest_session_id"] == session["id"]
    assert status_payload["latest_score"] == 88.0
    assert status_payload["latest_decision"] == "ACCESO"


def test_instructor_can_grant_manual_access(
    client,
    auth_headers,
    instructor_headers,
    db_session,
    monkeypatch,
):
    deleted_cooldowns = []
    monkeypatch.setattr(
        "app.services.dashboard.cooldown_cache.delete_cooldown",
        lambda user_id, context_id: deleted_cooldowns.append((user_id, context_id))
        or True,
    )

    session = create_session(client, auth_headers, "exam-manual")
    db_session.add(
        WaitPeriod(
            user_id=1,
            context_id="exam-manual",
            attempt_number=session["attempt_number"],
            wait_until=datetime.utcnow() + timedelta(minutes=10),
            reason="decision_espera",
            recommendation_key="low_dprime",
        )
    )
    db_session.commit()

    response = client.post(
        "/dashboard/grant-manual",
        json={
            "user_id": 1,
            "context_id": "exam-manual",
            "reason": "Acceso concedido manualmente por el docente",
        },
        headers=instructor_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["granted"] is True
    assert payload["user_id"] == 1
    assert payload["context_id"] == "exam-manual"
    assert payload["decision"] == "ACCESO"

    access_decision = db_session.query(AccessDecision).filter(
        AccessDecision.session_id == session["id"]
    ).one()
    assert access_decision.decision == "ACCESO"
    assert access_decision.consumed_by == "manual_grant"
    assert access_decision.consumed_at is not None

    active_wait = db_session.query(WaitPeriod).filter(
        WaitPeriod.user_id == 1,
        WaitPeriod.context_id == "exam-manual",
        WaitPeriod.wait_until > datetime.utcnow(),
    ).first()
    assert active_wait is None
    assert deleted_cooldowns == [(1, "exam-manual")]


def test_manual_grant_unknown_user_returns_404(client, instructor_headers):
    response = client.post(
        "/dashboard/grant-manual",
        json={
            "user_id": 999,
            "context_id": "exam-missing-user",
            "reason": "manual grant",
        },
        headers=instructor_headers,
    )

    assert response.status_code == 404


def test_manual_grant_without_session_returns_404(client, instructor_headers):
    response = client.post(
        "/dashboard/grant-manual",
        json={
            "user_id": 1,
            "context_id": "exam-without-session",
            "reason": "manual grant",
        },
        headers=instructor_headers,
    )

    assert response.status_code == 404


def test_create_session_rejects_when_max_attempts_exceeded(client, auth_headers):
    create_max_sessions(client, auth_headers, "exam-max-attempts")

    response = client.post(
        "/sessions",
        json={"context_id": "exam-max-attempts"},
        headers=auth_headers,
    )

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["message"] == "Maximum attempts exceeded"
    assert detail["max_attempts"] == settings.MAX_ATTEMPTS
    assert detail["context_id"] == "exam-max-attempts"
    assert detail["requires_manual_grant"] is True


def test_create_session_below_max_attempts_still_works(client, auth_headers):
    sessions = []
    for _ in range(max(1, settings.MAX_ATTEMPTS - 1)):
        sessions.append(create_session(client, auth_headers, "exam-below-max"))

    assert sessions[0]["attempt_number"] == 1
    assert sessions[-1]["attempt_number"] == len(sessions)
    assert sessions[-1]["attempt_number"] <= settings.MAX_ATTEMPTS


def test_max_attempts_are_scoped_by_context_id(client, auth_headers):
    create_max_sessions(client, auth_headers, "context-a")

    response = client.post(
        "/sessions",
        json={"context_id": "context-b"},
        headers=auth_headers,
    )

    assert response.status_code == 201
    assert response.json()["context_id"] == "context-b"
    assert response.json()["attempt_number"] == 1


def test_cooldown_has_priority_over_max_attempts(
    client,
    auth_headers,
    db_session,
):
    sessions = create_max_sessions(client, auth_headers, "exam-wait-priority")
    db_session.add(
        WaitPeriod(
            user_id=1,
            context_id="exam-wait-priority",
            attempt_number=sessions[-1]["attempt_number"],
            wait_until=datetime.utcnow() + timedelta(minutes=10),
            reason="decision_espera",
            recommendation_key="low_dprime",
        )
    )
    db_session.commit()

    response = client.post(
        "/sessions",
        json={"context_id": "exam-wait-priority"},
        headers=auth_headers,
    )

    assert response.status_code == 429
    assert "espera" in response.json()["detail"]


def test_create_session_uses_redis_cooldown_before_postgres(
    client,
    auth_headers,
    monkeypatch,
):
    wait_until = datetime.utcnow() + timedelta(minutes=5)
    monkeypatch.setattr(
        "app.services.session.cooldown_cache.get_active_cooldown",
        lambda user_id, context_id: CooldownInfo(
            user_id=user_id,
            context_id=context_id,
            wait_until=wait_until,
            recommendation_key="low_dprime",
            reason="decision_espera",
        ),
    )

    response = client.post(
        "/sessions",
        json={"context_id": "exam-redis-cooldown"},
        headers=auth_headers,
    )

    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["message"] == "Active cooldown"
    assert detail["recommendation_key"] == "low_dprime"
    assert detail["reason"] == "decision_espera"
    assert detail["wait_until"]


def test_block_decision_rejects_new_session_for_same_context(
    client,
    auth_headers,
):
    create_blocked_result(client, auth_headers, "exam-blocked")

    response = client.post(
        "/sessions",
        json={"context_id": "exam-blocked"},
        headers=auth_headers,
    )

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["message"] == "User is blocked for this context"
    assert detail["context_id"] == "exam-blocked"
    assert detail["requires_manual_grant"] is True
    assert detail["reason"] == "BLOCK decision"


def test_block_decision_is_scoped_by_context_id(client, auth_headers):
    create_blocked_result(client, auth_headers, "context-blocked-a")

    response = client.post(
        "/sessions",
        json={"context_id": "context-blocked-b"},
        headers=auth_headers,
    )

    assert response.status_code == 201
    assert response.json()["context_id"] == "context-blocked-b"
    assert response.json()["attempt_number"] == 1


def test_manual_grant_after_block_is_reflected_in_dashboard(
    client,
    auth_headers,
    instructor_headers,
):
    create_blocked_result(client, auth_headers, "exam-block-manual")

    grant_response = client.post(
        "/dashboard/grant-manual",
        json={
            "user_id": 1,
            "context_id": "exam-block-manual",
            "reason": "Acceso concedido tras bloqueo severo",
        },
        headers=instructor_headers,
    )
    assert grant_response.status_code == 200

    dashboard_response = client.get(
        "/dashboard/context/exam-block-manual",
        headers=instructor_headers,
    )

    assert dashboard_response.status_code == 200
    payload = dashboard_response.json()
    assert len(payload) == 1
    assert payload[0]["latest_decision"] == "ACCESO"
    assert payload[0]["manual_grant"] is True


def test_dashboard_shows_block_without_manual_grant(
    client,
    auth_headers,
    instructor_headers,
):
    create_blocked_result(client, auth_headers, "exam-block-dashboard")

    dashboard_response = client.get(
        "/dashboard/context/exam-block-dashboard",
        headers=instructor_headers,
    )

    assert dashboard_response.status_code == 200
    payload = dashboard_response.json()
    assert len(payload) == 1
    assert payload[0]["latest_decision"] == "BLOQUEO"
    assert payload[0]["manual_grant"] is False


def test_cooldown_has_priority_over_block_decision(
    client,
    auth_headers,
    db_session,
):
    session, _ = create_blocked_result(
        client,
        auth_headers,
        "exam-cooldown-before-block",
    )
    db_session.add(
        WaitPeriod(
            user_id=1,
            context_id="exam-cooldown-before-block",
            attempt_number=session["attempt_number"],
            wait_until=datetime.utcnow() + timedelta(minutes=10),
            reason="decision_espera",
            recommendation_key="low_dprime",
        )
    )
    db_session.commit()

    response = client.post(
        "/sessions",
        json={"context_id": "exam-cooldown-before-block"},
        headers=auth_headers,
    )

    assert response.status_code == 429
    assert "espera" in response.json()["detail"]


def test_manual_grant_after_max_attempts_is_reflected_in_dashboard(
    client,
    auth_headers,
    instructor_headers,
    db_session,
):
    create_max_sessions(client, auth_headers, "exam-max-manual")

    grant_response = client.post(
        "/dashboard/grant-manual",
        json={
            "user_id": 1,
            "context_id": "exam-max-manual",
            "reason": "Acceso concedido tras maximo de intentos",
        },
        headers=instructor_headers,
    )

    assert grant_response.status_code == 200
    access_decision = db_session.query(AccessDecision).filter(
        AccessDecision.user_id == 1,
        AccessDecision.context_id == "exam-max-manual",
    ).one()
    assert access_decision.decision == "ACCESO"
    assert access_decision.consumed_by == "manual_grant"

    dashboard_response = client.get(
        "/dashboard/context/exam-max-manual",
        headers=instructor_headers,
    )

    assert dashboard_response.status_code == 200
    payload = dashboard_response.json()
    assert len(payload) == 1
    assert payload[0]["latest_attempt_number"] == settings.MAX_ATTEMPTS
    assert payload[0]["manual_grant"] is True
    assert payload[0]["latest_decision"] == "ACCESO"
