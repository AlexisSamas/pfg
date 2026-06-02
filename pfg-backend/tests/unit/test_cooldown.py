"""Unit tests del servicio Redis/fallback de cooldown del backend."""

import json
from datetime import datetime, timedelta

from app.services import cooldown_cache


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}
        self.deleted = []

    def get(self, key):
        return self.values.get(key)

    def setex(self, key, ttl, value):
        self.values[key] = value
        self.ttls[key] = ttl

    def delete(self, key):
        self.deleted.append(key)
        self.values.pop(key, None)


def test_get_active_cooldown_returns_none_when_redis_unavailable(monkeypatch):
    monkeypatch.setattr(cooldown_cache, "get_redis_client", lambda: None)

    result = cooldown_cache.get_active_cooldown(
        user_id=1,
        context_id="exam-redis-missing",
    )

    assert result is None


def test_get_active_cooldown_reads_valid_redis_payload(monkeypatch):
    fake_redis = FakeRedis()
    wait_until = datetime.utcnow() + timedelta(minutes=5)
    fake_redis.values["cooldown:1:exam-redis"] = json.dumps(
        {
            "wait_until": wait_until.isoformat(),
            "recommendation_key": "low_dprime",
            "reason": "decision_espera",
        }
    )
    monkeypatch.setattr(cooldown_cache, "get_redis_client", lambda: fake_redis)

    result = cooldown_cache.get_active_cooldown(
        user_id=1,
        context_id="exam-redis",
    )

    assert result is not None
    assert result.wait_until == wait_until
    assert result.recommendation_key == "low_dprime"
    assert result.reason == "decision_espera"


def test_set_cooldown_writes_ttl_payload(monkeypatch):
    fake_redis = FakeRedis()
    wait_until = datetime.utcnow() + timedelta(minutes=10)
    monkeypatch.setattr(cooldown_cache, "get_redis_client", lambda: fake_redis)

    saved = cooldown_cache.set_cooldown(
        user_id=2,
        context_id="exam-save",
        wait_until=wait_until,
        recommendation_key="high_stroop_effect",
        reason="decision_espera",
    )

    assert saved is True
    key = "cooldown:2:exam-save"
    assert key in fake_redis.values
    assert fake_redis.ttls[key] > 0
    payload = json.loads(fake_redis.values[key])
    assert payload["recommendation_key"] == "high_stroop_effect"


def test_delete_cooldown_removes_key(monkeypatch):
    fake_redis = FakeRedis()
    fake_redis.values["cooldown:3:exam-delete"] = "{}"
    monkeypatch.setattr(cooldown_cache, "get_redis_client", lambda: fake_redis)

    deleted = cooldown_cache.delete_cooldown(
        user_id=3,
        context_id="exam-delete",
    )

    assert deleted is True
    assert "cooldown:3:exam-delete" in fake_redis.deleted
    assert "cooldown:3:exam-delete" not in fake_redis.values
