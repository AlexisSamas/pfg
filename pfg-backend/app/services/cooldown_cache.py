import json
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.models.wait_period import WaitPeriod
from app.services.redis_client import RedisError, get_redis_client


@dataclass(frozen=True)
class CooldownInfo:
    user_id: int
    context_id: str
    wait_until: datetime
    recommendation_key: Optional[str]
    reason: Optional[str]


def cooldown_key(user_id: int, context_id: str) -> str:
    return f"cooldown:{user_id}:{context_id}"


def get_active_cooldown(user_id: int, context_id: str) -> Optional[CooldownInfo]:
    client = get_redis_client()
    if client is None:
        return None

    try:
        raw_value = client.get(cooldown_key(user_id, context_id))
    except (RedisError, OSError):
        return None

    if not raw_value:
        return None

    try:
        payload = json.loads(raw_value)
        wait_until = datetime.fromisoformat(payload["wait_until"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        delete_cooldown(user_id=user_id, context_id=context_id)
        return None

    if wait_until <= datetime.utcnow():
        delete_cooldown(user_id=user_id, context_id=context_id)
        return None

    return CooldownInfo(
        user_id=user_id,
        context_id=context_id,
        wait_until=wait_until,
        recommendation_key=payload.get("recommendation_key"),
        reason=payload.get("reason"),
    )


def set_cooldown(
    user_id: int,
    context_id: str,
    wait_until: datetime,
    recommendation_key: Optional[str],
    reason: Optional[str],
) -> bool:
    client = get_redis_client()
    if client is None:
        return False

    ttl_seconds = int((wait_until - datetime.utcnow()).total_seconds())
    if ttl_seconds <= 0:
        delete_cooldown(user_id=user_id, context_id=context_id)
        return False

    payload = {
        "wait_until": wait_until.isoformat(),
        "recommendation_key": recommendation_key,
        "reason": reason,
    }

    try:
        client.setex(
            cooldown_key(user_id, context_id),
            ttl_seconds,
            json.dumps(payload),
        )
        return True
    except (RedisError, OSError):
        return False


def set_cooldown_from_wait_period(wait_period: WaitPeriod) -> bool:
    return set_cooldown(
        user_id=wait_period.user_id,
        context_id=wait_period.context_id,
        wait_until=wait_period.wait_until,
        recommendation_key=wait_period.recommendation_key,
        reason=wait_period.reason,
    )


def delete_cooldown(user_id: int, context_id: str) -> bool:
    client = get_redis_client()
    if client is None:
        return False

    try:
        client.delete(cooldown_key(user_id, context_id))
        return True
    except (RedisError, OSError):
        return False
