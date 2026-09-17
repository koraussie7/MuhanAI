export type BitterbotRole = "system" | "user" | "assistant";

export interface BitterbotMessage {
	id: string;
	role: BitterbotRole;
	content: string;
	createdAt: number;
}

const GREETING_RE = /(안녕|하이|헬로|hello|hi|hey|반가)/i;
const THANKS_RE = /(고마|감사|천만|thank|thanks|thx)/i;
const GOODBYE_RE = /(잘 가|안녕히|bye|goodbye|다음에)/i;

const GREETING_ANSWERS = [
	"안녕하세요! 저는 Bitterbot이에요. 지금은 외부 LLM이 연결되지 않아 제 기본 지식으로 답해드려요. 무엇이든 물어보세요.",
	"안녕하세요! 반가워요. 인터넷 모델 없이도 간단한 대화는 가능해요. 무엇을 도와드릴까요?",
];

const THANKS_ANSWERS = [
	"천만에요! 더 도와드릴 게 있으면 말씀해 주세요.",
	"별말씀을요. 도움이 되었다니 기쁘네요!",
];

const GOODBYE_ANSWERS = ["안녕히 가세요! 다음에 또 뵈어요.", "잘 가요! 언제든 다시 찾아와 주세요."];

function stripTags(text: string): string {
	return text.trim().replace(/\s+/g, " ");
}

export function answerOffline(messages: BitterbotMessage[]): string {
	const lastUser =
		[...messages].reverse().find((message) => message.role === "user")?.content ?? "";
	const text = stripTags(lastUser);

	if (!text) {
		return "무엇을 묻고 싶으신가요? 질문을 입력해 주시면 도와드릴게요.";
	}

	if (GREETING_RE.test(text)) {
		return pick(GREETING_ANSWERS);
	}

	if (THANKS_RE.test(text)) {
		return pick(THANKS_ANSWERS);
	}

	if (GOODBYE_RE.test(text)) {
		return pick(GOODBYE_ANSWERS);
	}

	return (
		"지금은 인터넷 LLM이 연결되지 않은 상태라 그 질문에 제대로 답하기 어려워요. " +
		"WebGPU 로컬 모델이나 로컬 추론 서버가 켜지면 더 정확한 답을 드릴 수 있어요. " +
		"간단한 질문(인사, 감사, 안부 등)이라면 계속 대화할 수 있으니 편하게 말씀해 주세요."
	);
}

function pick(options: string[]): string {
	return options[Math.floor(Math.random() * options.length)]!;
}
