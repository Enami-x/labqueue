"""
app/api/errors.py – Helpers for turning validation failures into readable 422s.

Every error body uses FastAPI's own shape, ``{"detail": [{"loc": [...], "msg": "..."}]}``,
so the frontend can show request-validation and domain-validation errors the same way.
"""

from __future__ import annotations

from typing import Any, List, Sequence

from fastapi import HTTPException
from pydantic import ValidationError


def error_item(loc: Sequence[Any], msg: str) -> dict:
    return {"loc": list(loc), "msg": msg}


def pydantic_errors(e: ValidationError, prefix: Sequence[Any] = ()) -> List[dict]:
    items = []
    for err in e.errors():
        msg = err.get("msg", "Invalid value")
        # Pydantic prefixes errors raised in validators with "Value error, ".
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        items.append(error_item([*prefix, *err.get("loc", ())], msg))
    return items


def raise_422(items: List[dict]) -> None:
    raise HTTPException(status_code=422, detail=items)
