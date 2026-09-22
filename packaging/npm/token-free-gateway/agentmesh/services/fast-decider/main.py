"""Laya Fast Decider - FastAPI sidecar for System 1 typed decisions."""

from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import os

from decider import decide

app = FastAPI(title="Laya Fast Decider", version="0.1.0")


class DecisionRequest(BaseModel):
	question: dict
	state: dict


class DecisionResponse(BaseModel):
	result: dict


@app.get("/health")
async def health():
	"""Health check - confirms laya router is loaded."""
	return {"status": "ok", "engine": "laya"}


@app.post("/decide")
async def decide_endpoint(req: DecisionRequest) -> DecisionResponse:
	"""Evaluate a typed question over the given state."""
	result = await decide(req.question, req.state)
	return DecisionResponse(result=result)