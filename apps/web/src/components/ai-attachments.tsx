import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@everycent/ui/components/attachment";
import { Spinner } from "@everycent/ui/components/spinner";
import { FileSpreadsheet, FileText, ImageOff, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  type AiAttachment,
  aiAttachmentUrl,
  deleteAiAttachment,
  MAX_AI_FILE_BYTES,
  uploadAiAttachment,
} from "@/lib/ai";

/** At most this many files go with one message. */
const MAX_FILES = 5;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (type: string) => type.startsWith("image/");
const isSheet = (type: string) => /spreadsheet|csv|tab-separated/.test(type);

/** A file picked for the next message: uploading, ready (uploaded), or refused. */
interface PickedFile {
  key: string;
  name: string;
  size: number;
  /** A local preview of a photo, until it's sent. */
  preview: string | null;
  state: "uploading" | "done" | "error";
  error?: string;
  attachment?: AiAttachment;
}

/**
 * The files picked for the next message. Each uploads as soon as it's picked, so sending is
 * instant; one removed before sending is deleted from the server.
 */
export function usePickedFiles(budgetId: string) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const counter = useRef(0);
  const update = (key: string, patch: Partial<PickedFile>) =>
    setFiles((all) => all.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  function add(picked: Iterable<File>) {
    const room = MAX_FILES - files.length;
    for (const file of [...picked].slice(0, Math.max(0, room))) {
      counter.current += 1;
      const key = `file-${counter.current}`;
      const entry: PickedFile = {
        key,
        name: file.name,
        size: file.size,
        preview: isImage(file.type) ? URL.createObjectURL(file) : null,
        state: "uploading",
      };
      setFiles((all) => [...all, entry]);
      if (file.size > MAX_AI_FILE_BYTES) {
        update(key, { state: "error", error: "Bigger than 15 MB" });
        continue;
      }
      uploadAiAttachment(budgetId, file).then(
        (attachment) => update(key, { state: "done", attachment }),
        (error: Error) => update(key, { state: "error", error: error.message }),
      );
    }
  }

  function remove(key: string) {
    const file = files.find((f) => f.key === key);
    if (file?.preview) URL.revokeObjectURL(file.preview);
    if (file?.attachment) void deleteAiAttachment(budgetId, file.attachment.id);
    setFiles((all) => all.filter((f) => f.key !== key));
  }

  /** Empties the list once its files are sent (they're the conversation's now). */
  function clear() {
    for (const f of files) if (f.preview) URL.revokeObjectURL(f.preview);
    setFiles([]);
  }

  const ready = files.flatMap((f) => (f.attachment ? [f.attachment] : []));
  return {
    files,
    ready,
    add,
    remove,
    clear,
    uploading: files.some((f) => f.state === "uploading"),
    full: files.length >= MAX_FILES,
  };
}

/** The files picked for the next message, above the message box. */
export function PickedFiles({
  files,
  onRemove,
}: {
  files: readonly PickedFile[];
  onRemove: (key: string) => void;
}) {
  if (files.length === 0) return null;
  return (
    <AttachmentGroup className="w-full px-2 pt-1" aria-label="Attached files">
      {files.map((f) => (
        <Attachment key={f.key} size="sm" state={f.state} className="max-w-56">
          <AttachmentMedia variant={f.preview ? "image" : "icon"}>
            {f.state === "uploading" && !f.preview ? (
              <Spinner />
            ) : f.preview ? (
              <img src={f.preview} alt="" />
            ) : (
              <FileIcon type={f.attachment?.contentType ?? f.name} />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{f.name}</AttachmentTitle>
            <AttachmentDescription role={f.state === "error" ? "alert" : undefined}>
              {f.state === "error"
                ? f.error
                : f.state === "uploading"
                  ? "Uploading…"
                  : formatSize(f.size)}
            </AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <AttachmentAction aria-label={`Remove ${f.name}`} onClick={() => onRemove(f.key)}>
              <X />
            </AttachmentAction>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

function FileIcon({ type }: { type: string }) {
  return isSheet(type) || /\.(xlsx|csv|tsv)$/i.test(type) ? <FileSpreadsheet /> : <FileText />;
}

/** The pointer a sent message keeps to a file (the API's `everycent-attachment:` part). */
export interface SentFile {
  attachmentId: string;
  fileName: string;
  contentType: string;
  byteSize?: number;
}

/** A sent message's file part, read back: null for parts that aren't the app's files. */
export function sentFile(part: unknown): SentFile | null {
  if (!part || typeof part !== "object") return null;
  const p = part as {
    type?: unknown;
    source?: { value?: unknown; mimeType?: unknown };
    metadata?: { attachmentId?: unknown; fileName?: unknown; byteSize?: unknown };
  };
  if (p.type !== "image" && p.type !== "document") return null;
  const id = p.metadata?.attachmentId;
  if (typeof id !== "string") return null;
  return {
    attachmentId: id,
    fileName: typeof p.metadata?.fileName === "string" ? p.metadata.fileName : "File",
    contentType: typeof p.source?.mimeType === "string" ? p.source.mimeType : "",
    byteSize: typeof p.metadata?.byteSize === "number" ? p.metadata.byteSize : undefined,
  };
}

/** A file in the conversation: a photo's thumbnail or the file's name; opens it in a new tab. */
export function SentFileCard({ budgetId, file }: { budgetId: string; file: SentFile }) {
  const [broken, setBroken] = useState(false);
  const url = aiAttachmentUrl(budgetId, file.attachmentId);
  const photo = isImage(file.contentType) && !broken;
  return (
    <Attachment
      size="sm"
      orientation={photo ? "vertical" : "horizontal"}
      className="ml-auto max-w-56"
    >
      <AttachmentMedia variant={photo ? "image" : "icon"}>
        {photo ? (
          <img src={url} alt={file.fileName} loading="lazy" onError={() => setBroken(true)} />
        ) : broken ? (
          <ImageOff />
        ) : (
          <FileIcon type={file.contentType} />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{file.fileName}</AttachmentTitle>
        {file.byteSize !== undefined && (
          <AttachmentDescription>{formatSize(file.byteSize)}</AttachmentDescription>
        )}
      </AttachmentContent>
      <AttachmentTrigger asChild>
        <a href={url} target="_blank" rel="noreferrer">
          <span className="sr-only">Open {file.fileName}</span>
        </a>
      </AttachmentTrigger>
    </Attachment>
  );
}
