import {
  Crop,
  Download,
  Eraser,
  Image,
  Maximize2,
  Paintbrush,
  SunMedium,
  WandSparkles,
} from "lucide-react";
import type { Tool } from "../types";

const tools: Array<{
  id: Tool;
  label: string;
  icon: typeof WandSparkles;
}> = [
  { id: "remove", label: "Xóa nền", icon: WandSparkles },
  { id: "restore", label: "Khôi phục vùng ảnh", icon: Paintbrush },
  { id: "erase", label: "Xóa thêm vùng nền", icon: Eraser },
  { id: "background", label: "Phông nền", icon: Image },
  { id: "crop", label: "Cắt ảnh", icon: Crop },
  { id: "resize", label: "Đổi kích thước", icon: Maximize2 },
  { id: "shadow", label: "Đổ bóng", icon: SunMedium },
  { id: "export", label: "Xuất ảnh", icon: Download },
];

interface Props {
  activeTool: Tool;
  onChange: (tool: Tool) => void;
}

export function EditorToolbar({ activeTool, onChange }: Props) {
  return (
    <nav className="editor-toolbar" aria-label="Công cụ chỉnh sửa">
      <div className="toolbar-tools">
        {tools.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={activeTool === id ? "active" : ""}
            onClick={() => onChange(id)}
            aria-label={label}
            aria-pressed={activeTool === id}
            data-tooltip={label}
          >
            <Icon size={21} strokeWidth={1.7} />
            <span className="visually-hidden">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
