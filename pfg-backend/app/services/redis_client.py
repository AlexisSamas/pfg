from functools import lru_cache
from typing import Optional

from app.core.config import settings

try:
    from redis import Redis
    from redis.exceptions import RedisError
except ImportError:  # pragma: no cover - requirements installs redis
    Redis = None
    RedisError = Exception


@lru_cache(maxsize=1)
def get_redis_client() -> Optional["Redis"]:
    if not settings.ENABLE_REDIS or Redis is None:
        return None

    return Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )


def redis_is_available() -> bool:
    client = get_redis_client()
    if client is None:
        return False

    try:
        return bool(client.ping())
    except (RedisError, OSError):
        return False
