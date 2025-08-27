"use client";

import * as React from "react";

type UploadAreaProps = {
  token: string;
  apiBase: string;
  onUploaded?: (file: { storageKey: string; size: number; mime: string; name: string }) => void;
  accept?: string | string[];
  multiple?: boolean;
  text?: {
    title?: string;
    subtitle?: string;
    button?: string;
  };
};

async function presignPut(apiBase: string, token: string, file: File) {
  const res = await fetch(`${apiBase}/storage/presign-put`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any));
    throw new Error(data?.error || `Failed to presign upload (${res.status})`);
  }
  return res.json();
}

async function serverUpload(apiBase: string, token: string, storageKey: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("storageKey", storageKey);
  const res = await fetch(`${apiBase}/storage/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any));
    throw new Error(data?.error || `Server upload failed (${res.status})`);
  }
  return res.json();
}

async function commit(apiBase: string, token: string, args: { storageKey: string; name: string; mime: string; size: number; uploadId?: string }) {
  const res = await fetch(`${apiBase}/storage/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as any));
    throw new Error(data?.error || `Commit failed (${res.status})`);
  }
  return res.json();
}

export function UploadArea({
  token,
  apiBase,
  onUploaded,
  accept,
  multiple = true,
  text,
}: UploadAreaProps) {
  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        // 1) Reserve + plan
        const plan = await presignPut(apiBase, token, file);

        // 2) Upload (presigned or server)
        if (plan.strategy === "presigned") {
          const headers = new Headers(plan.headers || {});
          // Ensure Content-Type is set for the PUT
          if (!headers.has("Content-Type") && file.type) {
            headers.set("Content-Type", file.type);
          }
          const putRes = await fetch(plan.url, {
            method: "PUT",
            body: file,
            headers,
          });
          if (!putRes.ok) {
            throw new Error(`Presigned upload failed (${putRes.status})`);
          }
          // 3) Commit
          await commit(apiBase, token, {
            storageKey: plan.storageKey || plan.key,
            name: file.name,
            mime: file.type,
            size: file.size,
            uploadId: plan.uploadId,
          });
          onUploaded?.({
            storageKey: plan.storageKey || plan.key,
            size: file.size,
            mime: file.type,
            name: file.name,
          });
        } else if (plan.strategy === "server-upload") {
          const result = await serverUpload(apiBase, token, plan.storageKey, file);
          // Best-effort: result.file may include metadata
          onUploaded?.({
            storageKey: plan.storageKey,
            size: file.size,
            mime: file.type,
            name: file.name,
          });
        } else {
          throw new Error(`Unknown upload strategy: ${String(plan.strategy)}`);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    // reset so same file can be picked again
    e.currentTarget.value = "";
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer?.files ?? null;
    void handleFiles(files);
  };

  const labelTitle = text?.title ?? "Upload files";
  const labelSubtitle = text?.subtitle ?? "Drag & drop files here or click to browse.";
  const buttonLabel = text?.button ?? "Choose files";

  const acceptAttr =
    Array.isArray(accept) ? accept.join(",") : typeof accept === "string" ? accept : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={[
          "rounded-lg border border-dashed p-6 transition-colors",
          dragActive ? "border-primary bg-primary/5" : "border-border",
          busy ? "opacity-70" : "",
        ].join(" ")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        aria-disabled={busy}
        tabIndex={0}
      >
        <div className="text-sm font-medium">{labelTitle}</div>
        <div className="text-xs text-foreground/60">{labelSubtitle}</div>
        <div className="mt-3 inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-accent/20 transition">
          {busy ? "Uploading…" : buttonLabel}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={acceptAttr}
          multiple={multiple}
          onChange={onChange}
          disabled={busy}
        />
      </div>
    </div>
  );
}
