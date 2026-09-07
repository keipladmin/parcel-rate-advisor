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
    <main style={{ fontFamily: "inherit", padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <h1>Parcel Rate Advisor</h1>
      <p>
        Upload a GEODATA export from <code>samples/</code> to parse it and run every
        consignment line through the mocked <code>determine()</code> stub.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Ingest a GEODATA export</h2>
        <input type="file" onChange={handleFileUpload} disabled={ingesting} />
        {ingesting && <p>Parsing...</p>}
        {ingestError && <p style={{ color: "crimson" }}>Error: {ingestError}</p>}
      </section>

      <ReviewScreen determinations={ingested} />
    </main>
  );
}
