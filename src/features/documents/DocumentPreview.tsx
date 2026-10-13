import { Button } from "../../shared/ui/Button";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import type {
  DocumentVersion,
  DocumentInput,
} from "../../../shared/contracts/document-types";
import { documentBytes, draftBytes } from "../../documents";
export function DocumentPreview({
  version,
  draft,
  close,
}: {
  version?: DocumentVersion;
  draft?: DocumentInput;
  close: () => void;
}) {
  const target = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [pages, setPages] = useState(0),
    [zoom, setZoom] = useState(false);
  useEffect(() => {
    let disposed = false,
      task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    void (async () => {
      if (!version && !draft) return;
      const blob = version
          ? await documentBytes(version, "pdf")
          : await draftBytes(draft!, "pdf"),
        pdf = await import("pdfjs-dist");
      pdf.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      if (disposed) return;
      task = pdf.getDocument({ data: await blob.arrayBuffer() });
      const doc = await task.promise;
      if (disposed) return;
      setPages(doc.numPages);
      for (let number = 1; number <= doc.numPages && !disposed; number++) {
        const page = await doc.getPage(number),
          viewport = page.getViewport({ scale: 1.25 }),
          canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "mb-4 h-auto w-full";
        canvas.setAttribute("aria-label", `Page ${number}`);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Aperçu indisponible.");
        await page.render({ canvasContext: context, canvas, viewport }).promise;
        if (!disposed) target.current?.append(canvas);
        page.cleanup();
      }
    })().catch((reason) => {
      if (!disposed) setError(reason.message);
    });
    return () => {
      disposed = true;
      void task?.destroy();
      target.current?.replaceChildren();
    };
  }, [version, draft]);
  return (
    <section className="app-panel my-4 p-4" aria-label="Aperçu PDF">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3>
          Aperçu PDF ·{" "}
          {version ? `version ${version.number}` : "brouillon non enregistré"} ·{" "}
          {pages ? `${pages} page(s)` : "Chargement…"}
        </h3>
        <Button
          type="button"
          className="app-button"
          onClick={() => setZoom(!zoom)}
        >
          {zoom ? "Adapter à l’écran" : "Agrandir le PDF"}
        </Button>
        <Button type="button" className="app-button" onClick={close}>
          Fermer l’aperçu
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="overflow-auto">
        <div ref={target} style={zoom ? { width: 744 } : undefined} />
      </div>
    </section>
  );
}
