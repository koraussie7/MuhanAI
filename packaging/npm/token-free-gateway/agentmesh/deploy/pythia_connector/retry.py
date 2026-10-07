"""Exponential backoff retry decorator for the Pythia Connector."""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from functools import wraps
from typing import Type, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


def with_retry(
    max_attempts: int = 5,
    base_delay: float = 0.5,
    max_delay: float = 60.0,
    backoff_factor: float = 2.0,
    jitter: bool = True,
    exceptions: tuple[Type[BaseException], ...] = (ConnectionError, TimeoutError, OSError),
):
    """Decorator that wraps a function with exponential backoff retry logic.

    Args:
        max_attempts: Maximum number of attempts (including the first try).
        base_delay: Initial delay in seconds before the first retry.
        max_delay: Maximum delay cap in seconds.
        backoff_factor: Multiplier applied to the delay after each attempt.
        jitter: If True, add random jitter to avoid thundering herd.
        exceptions: Exception types that trigger a retry.

    Returns:
        A decorator that retries the wrapped function on transient failures.
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args: object, **kwargs: object) -> T:
            delay = base_delay
            last_exc: Exception | None = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)  # type: ignore[return-value]
                except exceptions as exc:
                    last_exc = exc
                    if attempt == max_attempts:
                        logger.error(
                            "Max retries (%d) exceeded for %s: %s",
                            max_attempts,
                            func.__name__,
                            exc,
                        )
                        raise
                    actual_delay = delay
                    if jitter:
                        actual_delay = delay + random.uniform(0, delay * 0.1)
                    actual_delay = min(actual_delay, max_delay)
                    logger.warning(
                        "Attempt %d/%d failed for %s: %s. Retrying in %.2fs",
                        attempt,
                        max_attempts,
                        func.__name__,
                        exc,
                        actual_delay,
                    )
                    time.sleep(actual_delay)
                    delay = min(delay * backoff_factor, max_delay)

            raise last_exc  # pragma: no cover

        return wrapper

    return decorator
