import { describe, expect, it } from "vitest";
import { MaskHistory } from "./maskHistory";

describe("MaskHistory", () => {
  it("undoes and redoes a sparse mask stroke", () => {
    const mask = new Uint8ClampedArray([0, 0, 0, 0]);
    const history = new MaskHistory();
    history.begin();
    history.record(1, mask[1]);
    history.record(2, mask[2]);
    mask[1] = 120;
    mask[2] = 255;
    expect(history.commit(mask)).toBe(true);
    expect(history.undo(mask)).toBe(true);
    expect(Array.from(mask)).toEqual([0, 0, 0, 0]);
    expect(history.redo(mask)).toBe(true);
    expect(Array.from(mask)).toEqual([0, 120, 255, 0]);
  });

  it("keeps history memory bounded", () => {
    const mask = new Uint8ClampedArray(100);
    const history = new MaskHistory(12);
    for (let step = 0; step < 4; step += 1) {
      history.begin();
      history.record(step, mask[step]);
      mask[step] = 255;
      history.commit(mask);
    }
    expect(history.memoryBytes).toBeLessThanOrEqual(12);
  });
});
