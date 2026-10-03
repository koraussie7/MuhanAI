"""Exponential backoff retry wrapper.

Usage:

    @retry(attempts=3, base_delay=0.5, backoff=2.0, jitter=True)
    def fetch_from_pythia(url: str) -> dict:
        ...

Raises the last exception after all attempts are exhausted.
Logs each retry attempt at WARNING level.
"""

from __future__ import annotations

import logging
import random
import time
from functools import wraps
from typing import Any, Callable, Type, TypeVar

logger = logging.getLogger("pythia_connector.retry")

T = TypeVar("T")
RetryableError = (TimeoutError, ConnectionError, OSError)


def retry(
    attempts: int = 3,
    base_delay: float = 1.0,
    backoff: float = 2.0,
    jitter: bool = True,
    exceptions: tuple[Type[BaseException], ...] = RetryableError,
    on_retry: Callable[[int, BaseException], None] | None = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Decorator for retrying a function with exponential backoff.

    Args:
        attempts: Total number of attempts (including the first call).
        base_delay: Delay before first retry, in seconds.
        backoff: Multiplier for successive delays.
        jitter: If True, add ±25% random jitter to each delay.
        exceptions: Exception types that trigger a retry.
        on_retry: Optional callback invoked before each retry.
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            last_exc: BaseException | None = None
            for attempt in range(1, attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as exc:
                    last_exc = exc
                    if attempt < attempts:
                        delay = base_delay * (backoff ** (attempt - 1))
                        if jitter:
                            delay = delay * (0.75 + random.random() * 0.5)
                        if on_retry:
                            on_retry(attempt, exc)
                        logger.warning(
                            "%s attempt %d/%d failed: %s — retrying in %.2fs",
                            func.__name__,
                            attempt,
                            attempts,
                            exc,
                            delay,
                        )
                        time.sleep(delay)
                    else:
                        logger.error(
                            "%s exhausted all %d attempts — raising: %s",
                            func.__name__,
                            attempts,
                            exc,
                        )
                except Exception:
                    raise
            raise last_exc  # type: ignore[misc]

        return wrapper

    return decorator


# Async variant for use in async contexts (e.g., webhook handlers)
async def async_retry_call(
    coro_factory: Callable[..., Any],
    attempts: int = 3,
    base_delay: float = 1.0,
    backoff: float = 2.0,
    jitter: bool = True,
    exceptions: tuple[Type[BaseException], ...] = RetryableError,
) -> Any:
    """Retry an async coroutine factory with exponential backoff.

    Args:
        coro_factory: Zero-arg callable that returns a new coroutine each call.
        attempts, base_delay, backoff, jitter, exceptions: Same as `retry()`.
    """
    import asyncio

    last_exc: BaseException | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await coro_factory()
        except exceptions as exc:
            last_exc = exc
            if attempt < attempts:
                delay = base_delay * (backoff ** (attempt - 1))
                if jitter:
                    delay = delay * (0.75 + random.random() * 0.5)
                await asyncio.sleep(delay)
    raise last_exc  # type: ignore[misc]
