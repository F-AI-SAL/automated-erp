export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "3rem", maxWidth: 640 }}>
      <h1>🍽️ Food Engineering ERP</h1>
      <p>Multi-tenant Restaurant ERP — modular monolith, event-driven, Kafka-ready.</p>
      <p style={{ color: "#666" }}>
        Phase 0 skeleton is live. Health check:{" "}
        <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
