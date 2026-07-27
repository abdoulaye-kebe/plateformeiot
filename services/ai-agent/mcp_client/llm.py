"""Factory LLM — Ollama (CPU local) ou OpenAI."""

from __future__ import annotations

import os

from openai import OpenAI


def create_llm_client() -> tuple[OpenAI, str]:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()
    model = os.getenv("LLM_MODEL", "mistral:latest")
    timeout = float(os.getenv("LLM_TIMEOUT", "180"))

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY requis quand LLM_PROVIDER=openai")
        return OpenAI(api_key=api_key, timeout=timeout), model

    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    return OpenAI(base_url=base_url, api_key=os.getenv("OLLAMA_API_KEY", "ollama"), timeout=timeout), model
