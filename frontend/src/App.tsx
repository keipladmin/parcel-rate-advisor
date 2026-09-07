import { useState } from "react";
import { ingestExport, type Determination } from "./api";
import ReviewScreen from "./ReviewScreen";

export default function App() {
  const [ingested, setIngested] = useState<Determination[]>([]);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIngesting(true);
    setIngestError(null);
    try {
      setIngested(await ingestExport(file));
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIngesting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="brand">
          <span className="brand-mark" aria-hidden="true">📦</span>
          Parcel Rate Advisor
        </h1>
        <p>
          Upload a GEODATA export to parse it and run every consignment line through the
          mocked <code>determine()</code> stub, then review and export final rates.
        </p>
      </header>

      <main className="app-content">
        <section className="card">
          <h2>Ingest a GEODATA export</h2>
          <p>Upload one of the sample export files to get started.</p>
          <div className="upload-row">
            <input type="file" onChange={handleFileUpload} disabled={ingesting} />
            {ingesting && <span className="status-note">Parsing…</span>}
          </div>
          {ingestError && <p className="error-banner">Error: {ingestError}</p>}
        </section>

        <ReviewScreen determinations={ingested} />
      </main>
    </div>
  );
}
