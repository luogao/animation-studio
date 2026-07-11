// ============================================================
// uploadImage.ts — 客户端图片上传工具
//
// 流程：读文件为 data URL → 测自然尺寸 → POST /api/uploads → 返回同源 URL。
// 同源 /uploads/... 保证导出时 canvas 不被跨域污染。
// ============================================================

export interface UploadedImage {
  url: string; // 同源 "/uploads/<file>"
  width: number;
  height: number;
  mime: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

function measureImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/**
 * 上传一张图片到服务端，返回同源 URL + 自然尺寸。
 * 校验：必须是 image/*，体积上限 8MB。
 */
export async function uploadImageFile(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("仅支持图片文件");
  }
  const MAX_BYTES = 8 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error("图片过大（上限 8MB）");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const { width, height } = await measureImage(dataUrl);

  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl,
      mime: file.type,
      filename: file.name,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`上传失败 (${res.status}) ${text}`);
  }
  const data = (await res.json()) as { url: string; mime: string };
  return { url: data.url, width, height, mime: data.mime };
}
