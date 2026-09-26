import assert from "node:assert/strict";
import { test } from "node:test";
import { answerOffline, type BitterbotMessage } from "./offline-brain.js";

function userMessage(content: string): BitterbotMessage {
	return { id: `u-${content}`, role: "user", content, createdAt: 1 };
}

function assistantMessage(content: string): BitterbotMessage {
	return { id: `a-${content}`, role: "assistant", content, createdAt: 2 };
}

test("answerOffline answers a greeting", () => {
	const text = answerOffline([userMessage("안녕하세요")]);
	assert.match(text, /안녕/i);
	const korean = text.includes("안녕") || text.includes("반가");
	assert.ok(korean, "should stay in Korean for a Korean greeting");
});

test("answerOffline acknowledges thanks", () => {
	const text = answerOffline([userMessage("고마워")]);
	assert.match(text, /천만|도움|별말씀|기쁘|감사/i);
});

test("answerOffline says goodbye", () => {
	const text = answerOffline([userMessage("잘 가")]);
	assert.match(text, /안녕히|잘 가|다음에/);
});

test("answerOffline is honest about unknown questions", () => {
	const text = answerOffline([userMessage("양자 얽힘에 대해 설명해줘")]);
	assert.match(text, /외부 LLM|연결|모델|답변/i);
	assert.match(text, /아직|지금은|외부 LLM이 연결/i);
});

test("answerOffline handles empty input with guidance", () => {
	const text = answerOffline([userMessage("   ")]);
	assert.match(text, /묻|질문/i);
});

test("answerOffline uses earlier assistant messages for context", () => {
	const text = answerOffline([
		assistantMessage("안녕하세요! 무엇을 도와드릴까요?"),
		userMessage("고마워"),
	]);
	assert.match(text, /천만|도움|별말씀|기쁘|감사/i);
});
