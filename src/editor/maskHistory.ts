export interface MaskPatch {
  indices: Uint32Array;
  before: Uint8Array;
  after: Uint8Array;
  bytes: number;
}

export class MaskHistory {
  private undoStack: MaskPatch[] = [];
  private redoStack: MaskPatch[] = [];
  private pending = new Map<number, number>();
  private usedBytes = 0;

  constructor(private readonly maxBytes = 64 * 1024 * 1024) {}

  begin() {
    this.pending.clear();
  }

  record(index: number, before: number) {
    if (!this.pending.has(index)) this.pending.set(index, before);
  }

  commit(mask: Uint8ClampedArray) {
    if (this.pending.size === 0) return false;
    const entries = [...this.pending.entries()].filter(
      ([index, before]) => mask[index] !== before,
    );
    this.pending.clear();
    if (entries.length === 0) return false;
    const estimatedBytes = entries.length * 6;
    if (estimatedBytes > this.maxBytes) {
      this.clear();
      return false;
    }
    const indices = new Uint32Array(entries.length);
    const before = new Uint8Array(entries.length);
    const after = new Uint8Array(entries.length);
    for (let i = 0; i < entries.length; i += 1) {
      const [index, value] = entries[i];
      indices[i] = index;
      before[i] = value;
      after[i] = mask[index];
    }
    this.push({ indices, before, after, bytes: estimatedBytes });
    return true;
  }

  captureDifference(
    beforeMask: Uint8ClampedArray,
    afterMask: Uint8ClampedArray,
  ) {
    this.begin();
    const length = Math.min(beforeMask.length, afterMask.length);
    for (let index = 0; index < length; index += 1) {
      if (beforeMask[index] !== afterMask[index])
        this.record(index, beforeMask[index]);
    }
    return this.commit(afterMask);
  }

  undo(mask: Uint8ClampedArray) {
    const patch = this.undoStack.pop();
    if (!patch) return false;
    for (let i = 0; i < patch.indices.length; i += 1)
      mask[patch.indices[i]] = patch.before[i];
    this.redoStack.push(patch);
    this.usedBytes -= patch.bytes;
    return true;
  }

  redo(mask: Uint8ClampedArray) {
    const patch = this.redoStack.pop();
    if (!patch) return false;
    for (let i = 0; i < patch.indices.length; i += 1)
      mask[patch.indices[i]] = patch.after[i];
    this.undoStack.push(patch);
    this.usedBytes += patch.bytes;
    this.trim();
    return true;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.pending.clear();
    this.usedBytes = 0;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get memoryBytes() {
    return this.usedBytes;
  }

  private push(patch: MaskPatch) {
    this.undoStack.push(patch);
    this.redoStack = [];
    this.usedBytes += patch.bytes;
    this.trim();
  }

  private trim() {
    while (this.usedBytes > this.maxBytes && this.undoStack.length > 1) {
      const removed = this.undoStack.shift();
      if (removed) this.usedBytes -= removed.bytes;
    }
  }
}
