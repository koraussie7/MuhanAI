"""Laya Router integration for fast typed decisions."""

from laya import Router

# preload=True keeps all checkpoints in GPU/CPU memory for sub-35ms routing.
# Router auto-detects language/script and dispatches to the optimal checkpoint.
router = Router(preload=True)


async def decide(question: dict, state: dict) -> dict:
	"""
	Evaluate a typed question over the given state in a single forward pass.

	- question: {"type": "choice"/"score"/"noul", "instructions": ..., "criteria": {...}, "threshold": ...}
	- state: {"text": "..."}
	- returns: {question_name: {label: prob, ...}, ...}
	"""
	return router.predict(state=state, questions=question)