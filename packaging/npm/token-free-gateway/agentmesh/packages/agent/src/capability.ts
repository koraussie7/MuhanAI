export function supportsAll(capabilities: readonly string[], required: readonly string[]): boolean {
  return required.every((capability) => capabilities.includes(capability));
}
