import { WELCOME_BONUS_CODE, WELCOME_CREDITS } from "./index.js";

if (WELCOME_CREDITS !== 1_000_000) {
  throw new Error("Welcome credit amount must be 1,000,000");
}
if (WELCOME_BONUS_CODE !== "welcome_signup_v1") {
  throw new Error("Unexpected welcome campaign code");
}
