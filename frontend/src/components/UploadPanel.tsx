import { FormEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";

const acceptedFormats = ["mp4", "mov", "mkv", "avi", "webm", "m4v", "3gp", "flv", "wmv", "ts"];

type UploadedVideo = {
  id: string;
  sourceName: string;
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

export function UploadPanel() {
  const navigate = useNavigate();
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
    <div className="stack-list">
      <form className="upload-panel form-stack" onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <p className="eyebrow">Upload</p>
          <h3>Upload</h3>
          <p className="sheet-copy">Files go into the system Uploads source and reindex into the feed.</p>
        </div>

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

        <div className="upload-page__summary upload-panel__actions">
          <p className="sheet-copy">
            {selectedFiles.length > 0 ? `${selectedFiles.length} files ready to upload.` : "Choose one or more supported video files."}
          </p>
          <button className="action-chip action-chip--primary" disabled={isSubmitting || selectedFiles.length === 0} type="submit">
            {isSubmitting ? "Uploading..." : "Upload videos"}
          </button>
        </div>

        {selectedFiles.length > 0 ? (
          <div className="upload-panel__files">
            {selectedFiles.map((file) => (
              <article key={`${file.name}-${file.size}-${file.lastModified}`} className="upload-panel__file">
                <div>
                  <h3>{file.name}</h3>
                  <p className="list-card__path">{Math.max(1, Math.round(file.size / 1024 / 1024))} MB</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {error ? (
          <article className="mounts-page__notice">
            <p>{error}</p>
          </article>
        ) : null}
      </form>

      {result ? (
        <div className="upload-panel__results">
          <article className="upload-panel__result">
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
            <article key={video.id} className="upload-panel__result">
              <div>
                <h3>{video.title}</h3>
                <p className="list-card__path">{video.sourceName}</p>
              </div>
              <button
                className="action-chip action-chip--primary"
                onClick={() => {
                  navigate(`/feed?video=${encodeURIComponent(video.id)}`);
                }}
                type="button"
              >
                Play
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
