"""
Hermes Model Fallback Client (Python)
--------------------------------------
Automatically retries and switches AI models on HTTP 429, 503, or Timeout errors.

Usage:
    from fallback_client import FallbackClient

    client = FallbackClient("config.json")
    response = client.chat("Your prompt here")
    print(response)
"""

import json
import os
import time
import requests
from typing import Optional


# ── Errors that trigger a retry / fallback ─────────────────────────────────────
RETRYABLE_STATUS = {429, 503}


class AllModelsFailedError(Exception):
    """Raised when every model in the list has been exhausted."""
    pass


# ── Provider adapters ──────────────────────────────────────────────────────────

def _resolve_key(raw_key: str) -> str:
    """Supports 'ENV:VAR_NAME' syntax to read from environment variables."""
    if raw_key.startswith("ENV:"):
        env_var = raw_key[4:]
        value = os.environ.get(env_var, "")
        if not value:
            raise EnvironmentError(f"Environment variable '{env_var}' is not set.")
        return value
    return raw_key


def _call_gemini(model: str, api_key: str, prompt: str, timeout: int) -> str:
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    body = {"contents": [{"parts": [{"text": prompt}]}]}
    resp = requests.post(url, json=body, timeout=timeout)
    resp.raise_for_status()
    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]


def _call_openai(model: str, api_key: str, prompt: str, timeout: int) -> str:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_claude(model: str, api_key: str, prompt: str, timeout: int) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    resp.raise_for_status()
    return resp.json()["content"][0]["text"]


def _call_mistral(model: str, api_key: str, prompt: str, timeout: int) -> str:
    url = "https://api.mistral.ai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_groq(model: str, api_key: str, prompt: str, timeout: int) -> str:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {"model": model, "messages": [{"role": "user", "content": prompt}]}
    resp = requests.post(url, headers=headers, json=body, timeout=timeout)
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _call_ollama(model: str, api_key: str, prompt: str, timeout: int) -> str:
    """Local Ollama — no API key needed."""
    url = "http://localhost:11434/api/generate"
    body = {"model": model, "prompt": prompt, "stream": False}
    resp = requests.post(url, json=body, timeout=timeout)
    resp.raise_for_status()
    return resp.json()["response"]


PROVIDERS = {
    "gemini": _call_gemini,
    "openai": _call_openai,
    "claude": _call_claude,
    "mistral": _call_mistral,
    "groq": _call_groq,
    "ollama": _call_ollama,
}


# ── Main Client ────────────────────────────────────────────────────────────────

class FallbackClient:
    """
    Resilient AI client that automatically falls back to the next model
    on HTTP 429, 503, or Timeout errors.

    Parameters
    ----------
    config_path : str
        Path to your config.json file.
    verbose : bool
        Print which model is being used / when a fallback happens.
    """

    def __init__(self, config_path: str = "config.json", verbose: bool = True):
        with open(config_path, "r") as f:
            cfg = json.load(f)

        self.models = cfg["models"]
        self.retry_limit = cfg.get("retry_limit", 2)
        self.timeout = cfg.get("timeout_seconds", 30)
        self.verbose = verbose

    def _log(self, msg: str):
        if self.verbose:
            print(f"[HermesFallback] {msg}")

    def _try_model(self, model_cfg: dict, prompt: str) -> Optional[str]:
        """
        Attempt a single model up to (retry_limit + 1) times.
        Returns the response string, or None if all attempts failed.
        """
        provider = model_cfg["provider"]
        model = model_cfg["model"]
        api_key = _resolve_key(model_cfg.get("api_key", ""))
        caller = PROVIDERS.get(provider)

        if caller is None:
            self._log(f"Unknown provider '{provider}', skipping.")
            return None

        for attempt in range(1, self.retry_limit + 2):  # e.g. 1, 2, 3
            try:
                self._log(f"Trying {provider}/{model} (attempt {attempt})...")
                result = caller(model, api_key, prompt, self.timeout)
                self._log(f"✅ Success with {provider}/{model}")
                return result

            except requests.exceptions.Timeout:
                self._log(f"⏱ Timeout on {provider}/{model} (attempt {attempt})")

            except requests.exceptions.HTTPError as e:
                status = e.response.status_code if e.response is not None else 0
                if status in RETRYABLE_STATUS:
                    self._log(f"⚠️  HTTP {status} on {provider}/{model} (attempt {attempt})")
                    # Brief back-off before retry
                    if attempt <= self.retry_limit:
                        time.sleep(2 ** (attempt - 1))  # 1s, 2s
                else:
                    # Non-retryable error (e.g. 401, 400) — skip this model immediately
                    self._log(f"❌ Non-retryable HTTP {status} on {provider}/{model}: {e}")
                    return None

            except requests.exceptions.ConnectionError as e:
                self._log(f"🔌 Connection error on {provider}/{model}: {e}")

        self._log(f"❌ All attempts exhausted for {provider}/{model}, switching...")
        return None

    def chat(self, prompt: str) -> str:
        """
        Send a prompt. Automatically falls back through all configured models.

        Returns
        -------
        str
            The first successful response text.

        Raises
        ------
        AllModelsFailedError
            If every model fails after all retries.
        """
        for model_cfg in self.models:
            result = self._try_model(model_cfg, prompt)
            if result is not None:
                return result

        raise AllModelsFailedError(
            "All models failed (429 / 503 / Timeout). "
            "Check your API keys and quotas, or add more fallback models in config.json."
        )


# ── Quick test ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    client = FallbackClient("config.json")
    answer = client.chat("Say hello in one sentence.")
    print("Response:", answer)
