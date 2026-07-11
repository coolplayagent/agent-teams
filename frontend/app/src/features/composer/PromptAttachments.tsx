import { Button, Image, Typography } from "antd";
import { X } from "lucide-react";
import type { ClipboardEvent } from "react";

import type { RunInputPart } from "../../api/contracts";

export interface PromptAttachment {
  base64Data: string;
  height: number | null;
  id: string;
  mimeType: string;
  name: string;
  previewUrl: string;
  sizeBytes: number | null;
  width: number | null;
}

interface PromptAttachmentsProps {
  attachments: PromptAttachment[];
  hasError: boolean;
  onRemove: (attachmentId: string) => void;
}

let attachmentSequence = 0;

export function PromptAttachments({
  attachments,
  hasError,
  onRemove,
}: PromptAttachmentsProps) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div
      aria-label="Prompt attachments"
      className={`at-prompt-attachments${hasError ? " is-error" : ""}`}
    >
      {attachments.map((attachment) => (
        <div className="at-prompt-attachment" key={attachment.id}>
          <Image
            alt={attachment.name}
            className="at-prompt-attachment-thumb"
            height={44}
            preview={{
              mask: "Preview",
            }}
            src={attachment.previewUrl}
            width={44}
          />
          <div className="at-prompt-attachment-copy">
            <Typography.Text className="at-prompt-attachment-name" ellipsis>
              {attachment.name}
            </Typography.Text>
            <Typography.Text
              className="at-prompt-attachment-meta"
              type="secondary"
            >
              {formatAttachmentSize(attachment.sizeBytes)}
            </Typography.Text>
          </div>
          <Button
            aria-label={`Remove ${attachment.name}`}
            icon={<X size={14} />}
            onClick={() => onRemove(attachment.id)}
            size="small"
            type="text"
          />
        </div>
      ))}
    </div>
  );
}

export async function readPastedImageAttachments(
  event: ClipboardEvent<HTMLElement>,
): Promise<PromptAttachment[]> {
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => String(item.type || "").startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  if (files.length === 0) {
    return [];
  }
  event.preventDefault();
  const attachments = await Promise.all(
    files.map((file, index) => normalizeImageAttachment(file, index)),
  );
  return attachments.filter((attachment): attachment is PromptAttachment => attachment !== null);
}

export async function readImageAttachmentFiles(
  files: Iterable<File>,
): Promise<PromptAttachment[]> {
  const imageFiles = Array.from(files).filter((file) =>
    String(file.type || "").startsWith("image/"),
  );
  const attachments = await Promise.all(
    imageFiles.map((file, index) => normalizeImageAttachment(file, index)),
  );
  return attachments.filter(
    (attachment): attachment is PromptAttachment => attachment !== null,
  );
}

export function buildPromptInputParts(
  text: string,
  attachments: PromptAttachment[],
): RunInputPart[] {
  const trimmedText = text.trim();
  const parts: RunInputPart[] = [];
  if (trimmedText) {
    parts.push({ kind: "text", text: trimmedText });
  }
  for (const attachment of attachments) {
    parts.push({
      base64_data: attachment.base64Data,
      height: attachment.height,
      kind: "inline_media",
      mime_type: attachment.mimeType,
      modality: "image",
      name: attachment.name,
      size_bytes: attachment.sizeBytes,
      width: attachment.width,
    });
  }
  return parts;
}

export function summarizePromptAttachments(attachments: PromptAttachment[]): string {
  if (attachments.length === 0) {
    return "";
  }
  return attachments.length === 1 ? "[image]" : `[${attachments.length} images]`;
}

function normalizeImageAttachment(
  file: File,
  index: number,
): Promise<PromptAttachment | null> {
  return readFileAsDataUrl(file).then((previewUrl) => {
    const { base64Data, mimeType } = parseDataUrl(previewUrl);
    if (!base64Data) {
      return null;
    }
    return {
      base64Data,
      height: null,
      id: `attachment-${Date.now()}-${attachmentSequence++}`,
      mimeType,
      name: resolveAttachmentName(file, index, mimeType),
      previewUrl,
      sizeBytes: Number.isFinite(file.size) ? file.size : null,
      width: null,
    };
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read pasted image."));
    };
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl: string): { base64Data: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return { base64Data: "", mimeType: "image/png" };
  }
  return {
    base64Data: match[2] ?? "",
    mimeType: match[1] ?? "image/png",
  };
}

function resolveAttachmentName(file: File, index: number, mimeType: string): string {
  const name = file.name.trim();
  if (name) {
    return name;
  }
  const extension = attachmentExtension(mimeType);
  return `pasted-image-${index + 1}.${extension}`;
}

function attachmentExtension(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.trim().toLowerCase() ?? "";
  if (!subtype) {
    return "png";
  }
  return subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]+/g, "") || "png";
}

function formatAttachmentSize(sizeBytes: number | null): string {
  if (sizeBytes === null) {
    return "Image";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  const kib = sizeBytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  }
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}
