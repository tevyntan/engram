import os
from fastapi import Request, HTTPException
from upstash_redis import Redis

redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"],
)

RATE_LIMIT = 10
WINDOW_SECONDS = 3600


async def rate_limit(request: Request):
    ip = request.client.host
    key = f"rate:{ip}"

    count = redis.incr(key)

    if count == 1:
        redis.expire(key, WINDOW_SECONDS)

    if count > RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {RATE_LIMIT} requests per hour.",
        )
