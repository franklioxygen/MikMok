import { FormEvent, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";

const acceptedFormats = ["mp4", "mov", "mkv", "avi", "webm", "m4v", "3gp", "flv", "wmv", "ts"];

type UploadedVideo = {
  id: string;
  sourceName: string;
  streamUrl: string;
  title: string;
};

type UploadResponse = {
  accepted: number;
  folderId: string;
  folderName: string;
  rejected: string[];
  uploadBatchId: string;
  videos: UploadedVideo[];
};

export function UploadPage() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const acceptValue = useMemo(() => acceptedFormats.map((format) => `.${format}`).join(","), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedFiles.length === 0) {
      setError("Select at least one video file.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();

      for (const file of selectedFiles) {
        formData.append("files[]", file);
      }

      const uploadResult = await apiRequest<UploadResponse>("/uploads", {
        method: "POST",
        body: formData
      });

      setResult(uploadResult);
      setSelectedFiles([]);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to upload files.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="sheet-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Upload Pipeline</p>
          <h2>Drop videos into the same indexed library the feed already uses.</h2>
          <p className="sheet-copy">Uploaded files land in the system-managed Uploads source, then immediately reindex into the feed.</p>
        </div>
        <span className="pill">Step 3</span>
      </div>

      <form className="feature-card form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          Video files
          <input
            accept={acceptValue}
            multiple
            onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
            ref={inputRef}
            type="file"
          />
        </label>

        <div className="tag-row">
          {acceptedFormats.map((format) => (
            <span key={format} className="pill">
              .{format}
            </span>
          ))}
        </div>

        <div className="upload-page__summary">
          <p className="sheet-copy">
            {selectedFiles.length > 0 ? `${selectedFiles.length} files ready to upload.` : "Choose one or more supported video files."}
          </p>
          <button className="action-chip action-chip--primary" disabled={isSubmitting || selectedFiles.length === 0} type="submit">
            {isSubmitting ? "Uploading..." : "Upload videos"}
          </button>
        </div>

        {selectedFiles.length > 0 ? (
          <div className="stack-list">
            {selectedFiles.map((file) => (
              <article key={`${file.name}-${file.size}-${file.lastModified}`} className="list-card">
                <div>
                  <h3>{file.name}</h3>
                  <p className="list-card__path">{Math.max(1, Math.round(file.size / 1024 / 1024))} MB</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {error ? (
          <article className="list-card">
            <p>{error}</p>
          </article>
        ) : null}
      </form>

      {result ? (
        <div className="stack-list">
          <article className="list-card">
            <div>
              <h3>{result.accepted} videos indexed</h3>
              <p className="list-card__path">
                Batch {result.uploadBatchId} · source {result.folderName}
              </p>
              {result.rejected.length > 0 ? <p className="list-card__path">Rejected: {result.rejected.join(", ")}</p> : null}
            </div>
            <Link className="action-chip action-chip--primary" to={`/folders/${result.folderId}`}>
              Open Uploads
            </Link>
          </article>

          {result.videos.map((video) => (
            <article key={video.id} className="list-card">
              <div>
                <h3>{video.title}</h3>
                <p className="list-card__path">{video.sourceName}</p>
              </div>
              <a className="action-chip action-chip--primary" href={video.streamUrl}>
                Open stream
              </a>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
