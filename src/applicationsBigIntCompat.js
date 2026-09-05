// Eris represents Discord permission bitfields as BigInt values.
// JSON.stringify() cannot serialize BigInt values by default, but Discord's API
// accepts permission bitfields as decimal strings. Define a JSON representation
// once so application permission snapshots and REST payloads can safely serialize.
if (typeof BigInt.prototype.toJSON !== "function") {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value() {
      return this.toString();
    },
    configurable: true,
  });
}
