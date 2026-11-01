import { Icon } from "../ui/Icon";
import type { WorkspaceFile } from "../stores/workspace";

/**
 * The workspace of the agent. A file leaves the browser only when the user
 * downloads it. The list holds no key.
 */
export function WorkspacePanel({
  files,
  onRemove,
}: {
  files: WorkspaceFile[];
  onRemove: (path: string) => void;
}) {
  const download = (file: WorkspaceFile): void => {
    const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.path.split("/").pop() ?? "file.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel" aria-labelledby="workspace-title">
      <div className="panel-head">
        <div className="panel-title">
          <span className="eyebrow eyebrow--cyan">Workspace</span>
          <h2 id="workspace-title">Agent files</h2>
        </div>
        <span className="chip">{files.length}</span>
      </div>

      {files.length === 0 ? (
        <p className="hint">
          The workspace is empty. Turn on a coding tool in Settings, then ask the AI to write a file. A file stays
          in this browser.
        </p>
      ) : (
        <ul className="workspace-list">
          {files.map((file) => (
            <li key={file.path} className="workspace-item">
              <span className="workspace-name mono">{file.path}</span>
              <span className="workspace-size">{file.content.length}</span>
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                aria-label={`Download ${file.path}`}
                onClick={() => download(file)}
              >
                <Icon name="download" size={12} />
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                aria-label={`Delete ${file.path}`}
                onClick={() => onRemove(file.path)}
              >
                <Icon name="trash" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
