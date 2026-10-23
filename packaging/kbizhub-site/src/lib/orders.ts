/**
 * Starter-plan orders.
 *
 * Migrated from `submitStarterOrder()` in the original index.html. The storage
 * key and the record shape are kept byte-compatible with that page: orders
 * already placed on the live site live under `kbizhub_orders`, and renaming
 * either would orphan them.
 *
 * There is no backend yet. When one arrives, replace the body of
 * `submitStarterOrder` — the UI contract above it does not change.
 */

export interface StarterOrder {
	/** 사업체 / 브랜드 이름 (required) */
	bizName: string;
	/** 업종 */
	industry: string;
	/** 연락 이메일 (required) */
	email: string;
	/** 기존 웹사이트 (optional) */
	website: string;
	/** ISO timestamp */
	date: string;
	/** KRW, fixed starter price */
	amount: 29000;
}

const STORAGE_KEY = "kbizhub_orders";
const STARTER_PRICE = 29000 as const;

export function readOrders(): StarterOrder[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		return Array.isArray(parsed) ? (parsed as StarterOrder[]) : [];
	} catch {
		// Corrupted storage must not break the page; the order flow still works.
		return [];
	}
}

/**
 * Validate and persist one order.
 *
 * Throws with a user-facing message rather than returning a result object: the
 * caller is a form handler that only needs "did it work", and the message goes
 * straight into the error slot.
 */
export async function submitStarterOrder(form: FormData): Promise<StarterOrder> {
	const field = (name: string): string => String(form.get(name) ?? "").trim();

	const order: StarterOrder = {
		bizName: field("bizName"),
		industry: field("industry"),
		email: field("email"),
		website: field("website"),
		date: new Date().toISOString(),
		amount: STARTER_PRICE,
	};

	// The original page required both before writing. Same rule, but it now
	// reports why instead of silently doing nothing.
	if (!order.bizName) throw new Error("사업체 / 브랜드 이름을 입력해주세요");
	if (!order.email) throw new Error("이메일을 입력해주세요");
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(order.email)) {
		throw new Error("이메일 형식이 올바르지 않습니다");
	}

	const next = [...readOrders(), order];
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Private mode / quota. The caller shows success only when this returns.
		throw new Error("주문을 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요");
	}

	return order;
}

export const STARTER_PRICE_KRW = STARTER_PRICE;
