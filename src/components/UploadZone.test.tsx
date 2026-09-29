// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadZone } from "./UploadZone";

afterEach(cleanup);

describe("UploadZone", () => {
  it("submits the first selected file exactly once", () => {
    const onSelect = vi.fn();
    render(<UploadZone onSelect={onSelect} error={null} loading={false} />);
    const file = new File(["image"], "photo.png", { type: "image/png" });

    fireEvent.change(screen.getByLabelText("Chọn ảnh từ thiết bị"), {
      target: { files: [file] },
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(file);
  });

  it("prevents duplicate selections while the first image is opening", () => {
    const onSelect = vi.fn();
    render(<UploadZone onSelect={onSelect} error={null} loading />);
    const file = new File(["image"], "photo.png", { type: "image/png" });

    expect(
      (screen.getByRole("button", {
        name: /đang mở ảnh/i,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Chọn ảnh từ thiết bị"), {
      target: { files: [file] },
    });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
