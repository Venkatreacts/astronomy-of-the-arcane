"""AI Detective endpoint. Needs ANTHROPIC_API_KEY (env var or backend/.env); the rest of the app works without it."""

from __future__ import annotations

import pathlib

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from trendlab.agent import ask, load_env_file

load_env_file(pathlib.Path(__file__).resolve().parents[1] / ".env")
router = APIRouter(prefix="/api/agent", tags=["agent"])


class Question(BaseModel):
    question: str = Field(..., min_length=5, max_length=500)


@router.post("")
def detective(q: Question):
    import anthropic

    not_set_up = "AI Detective is not set up: add ANTHROPIC_API_KEY to backend/.env and restart the API."
    try:
        return ask(q.question)
    except TypeError as exc:  # the SDK raises TypeError when no credential is configured at all
        if "authentication" in str(exc).lower():
            raise HTTPException(503, not_set_up) from exc
        raise
    except anthropic.AuthenticationError as exc:
        raise HTTPException(503, not_set_up) from exc
    except anthropic.RateLimitError as exc:
        raise HTTPException(429, "Too many questions right now. Try again in a minute.") from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(502, "Could not reach the AI service.") from exc
    except anthropic.APIStatusError as exc:
        raise HTTPException(502, f"AI service error ({exc.status_code}).") from exc
