import hashlib
import json
import time
from functools import wraps
from typing import Any, Dict, Optional, List
import os
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gpt-4o"  # Latest GPT-4 Turbo model
FALLBACK_MODEL = "gpt-4o"  # Fallback model


class OpenAICache:

    def __init__(self, cache_dir: str = ".cache/openai", ttl: int = 3600):
        """Initialize the cache manager."""
        self.cache_dir = Path(cache_dir)
        self.ttl = ttl
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._thread_pool = ThreadPoolExecutor()

    def _generate_cache_key(self, prompt: str, **kwargs) -> str:
        """Generate a unique cache key based on the request parameters."""
        try:
            # Create a dictionary of all parameters that affect the response
            cache_dict = {
                "prompt": prompt,
                "model": kwargs.get("model", DEFAULT_MODEL),
                "functions": kwargs.get("functions"),
                **{
                    k: v
                    for k, v in kwargs.items() if k not in [
                        "cache", "client", "model", "functions"
                    ]
                }
            }
            # Convert to a stable string representation and hash it
            cache_str = json.dumps(cache_dict, sort_keys=True)
            return hashlib.sha256(cache_str.encode()).hexdigest()
        except Exception as e:
            logger.error(f"Error generating cache key: {str(e)}")
            # Fallback to a simple hash of the prompt and model
            fallback_str = f"{prompt}:{kwargs.get('model', DEFAULT_MODEL)}"
            return hashlib.sha256(fallback_str.encode()).hexdigest()

    def _get_cache_path(self, cache_key: str) -> Path:
        """Get the file path for a cache key."""
        return self.cache_dir / f"{cache_key}.json"

    async def get(self, prompt: str, **kwargs) -> Optional[Dict[str, Any]]:
        """Retrieve a cached response if it exists and is valid."""
        try:
            async with self._lock:
                cache_key = self._generate_cache_key(prompt, **kwargs)
                cache_path = self._get_cache_path(cache_key)

                if not cache_path.exists():
                    return None

                try:
                    loop = asyncio.get_event_loop()
                    cache_data = await loop.run_in_executor(
                        self._thread_pool,
                        lambda: json.loads(cache_path.read_text()))

                    # Check if cache has expired
                    if time.time() - cache_data["timestamp"] > self.ttl:
                        await loop.run_in_executor(
                            self._thread_pool,
                            lambda: cache_path.unlink(missing_ok=True))
                        return None

                    logger.info(f"Cache hit for prompt: {prompt[:50]}...")
                    return cache_data["response"]
                except (json.JSONDecodeError, KeyError, OSError) as e:
                    logger.error(f"Error reading cache: {str(e)}")
                    # Try to clean up corrupted cache file
                    try:
                        await loop.run_in_executor(
                            self._thread_pool,
                            lambda: cache_path.unlink(missing_ok=True))
                    except:
                        pass
                    return None
        except Exception as e:
            logger.error(f"Error in cache get: {str(e)}")
            return None

    async def set(self, prompt: str, response: Dict[str, Any],
                  **kwargs) -> None:
        """Store a response in the cache."""
        try:
            async with self._lock:
                cache_key = self._generate_cache_key(prompt, **kwargs)
                cache_path = self._get_cache_path(cache_key)

                cache_data = {"timestamp": time.time(), "response": response}

                try:
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        self._thread_pool,
                        lambda: cache_path.write_text(json.dumps(cache_data)))
                    logger.info(
                        f"Cached response for prompt: {prompt[:50]}...")
                except OSError as e:
                    logger.error(f"Error writing cache: {str(e)}")
        except Exception as e:
            logger.error(f"Error in cache set: {str(e)}")

    async def clear(self) -> None:
        """Clear all cached responses."""
        try:
            async with self._lock:
                loop = asyncio.get_event_loop()
                cache_files = list(self.cache_dir.glob("*.json"))

                async def delete_file(file_path: Path):
                    try:
                        await loop.run_in_executor(
                            self._thread_pool,
                            lambda: file_path.unlink(missing_ok=True))
                    except OSError as e:
                        logger.error(
                            f"Error deleting cache file {file_path}: {str(e)}")

                await asyncio.gather(*[delete_file(f) for f in cache_files])
                logger.info(f"Cleared {len(cache_files)} cache files")
        except Exception as e:
            logger.error(f"Error clearing cache: {str(e)}")


def cache_openai_request(cache: OpenAICache):
    """Decorator to cache OpenAI API requests."""

    def decorator(func):

        @wraps(func)
        async def wrapper(prompt: str, *args, **kwargs):
            try:
                # Try to get from cache first
                cached_response = await cache.get(prompt, **kwargs)

                if cached_response is not None:
                    return cached_response

                # If not in cache, make the actual API call
                response = await func(prompt, *args, **kwargs)

                # Only cache successful responses
                if response and not isinstance(response.get(
                        "content"), str) or not "error" in response.get(
                            "content", "").lower():
                    await cache.set(prompt, response, **kwargs)

                return response
            except Exception as e:
                logger.error(f"Error in cache decorator: {str(e)}")
                # If caching fails, still try to get a response
                return await func(prompt, *args, **kwargs)

        return wrapper

    return decorator
