/**
 * @agentmesh/agent-router — public surface.
 *
 * The routing pipeline lives in `pipeline.ts`; the prepaid-credit gate in
 * `credits.ts`. This file only re-exports so downstream imports stay stable
 * and no circular module graph forms (credits imports pipeline directly).
 */

export {
	BASE_ROUTE_COST,
	COST_PER_KNOWLEDGE_NODE,
	type CreditGateOptions,
	computeRouteCost,
	type RoutedWithCredits,
	routeChargeIdempotencyKey,
	routeQuestionWithCredits,
} from "./credits.js";
export {
	type RouteResult,
	routeQuestion,
} from "./pipeline.js";
