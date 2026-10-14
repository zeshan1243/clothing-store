#!/bin/sh
# Container entrypoint: apply migrations, then serve.
set -e

alembic upgrade head

# --proxy-headers + --forwarded-allow-ips: trust X-Forwarded-For from the hosting platform's proxy so
# rate limiting sees real client IPs. Set FORWARDED_ALLOW_IPS to your proxy's address range if known.
# One worker keeps the in-process rate limiter accurate; scale out only with a shared limiter.
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-1}" \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}" \
  --no-access-log
