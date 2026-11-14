"""AI Detective endpoint.

Runs on Gemini when GEMINI_API_KEY is set, else on Claude when ANTHROPIC_API_KEY is set (env var or backend/.env).
Live questions need the header X-Demo-Passcode to equal DETECTIVE_PASSCODE, so a public link cannot use up the key.
The rest of the app works without any of this.
"""

from __future__ import annotations

import hmac
import os
import pathlib

import requests
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from trendlab.agent import ask, ask_gemini, load_env_file

load_env_file(pathlib.Path(__file__).resolve().parents[1] / ".env")
router = APIRouter(prefix="/api/agent", tags=["agent"])

NOT_SET_UP = "The live AI Detective is not set up on this server. The saved answers still work."


class Turn(BaseModel):
    question: str = Field(..., max_length=500)
    answer: str = Field(..., max_length=6000)


class Question(BaseModel):
    question: str = Field(..., min_length=5, max_length=500)
    history: list[Turn] = Field(default_factory=list, max_length=4)  # earlier turns, for follow-up questions


@router.post("")
def detective(q: Question, x_demo_passcode: str = Header("")):
    passcode = os.environ.get("DETECTIVE_PASSCODE", "")
    if not passcode:
        raise HTTPException(503, NOT_SET_UP)
    if not hmac.compare_digest(x_demo_passcode.encode(), passcode.encode()):
        raise HTTPException(401, "Wrong passcode. Live questions are for the team's demo; the saved answers are open.")

    if os.environ.get("GEMINI_API_KEY"):
        try:
            return ask_gemini(q.question, history=[t.model_dump() for t in q.history])
        except requests.HTTPError as exc:
            code = exc.response.status_code
            if code == 429:
                raise HTTPException(429, "Too many questions right now. Try again in a minute.") from exc
            if code in (401, 403):
                raise HTTPException(503, NOT_SET_UP) from exc
            raise HTTPException(502, f"AI service error ({code}).") from exc
        except requests.RequestException as exc:
            raise HTTPException(502, "Could not reach the AI service.") from exc

    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(503, NOT_SET_UP)
    import anthropic

    try:
        return ask(q.question, history=[t.model_dump() for t in q.history])
    except TypeError as exc:  # the SDK raises TypeError when no credential is configured at all
        if "authentication" in str(exc).lower():
            raise HTTPException(503, NOT_SET_UP) from exc
        raise
    except anthropic.AuthenticationError as exc:
        raise HTTPException(503, NOT_SET_UP) from exc
    except anthropic.RateLimitError as exc:
        raise HTTPException(429, "Too many questions right now. Try again in a minute.") from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(502, "Could not reach the AI service.") from exc
    except anthropic.APIStatusError as exc:
        raise HTTPException(502, f"AI service error ({exc.status_code}).") from exc
