interface HealthResponse {
  status: string;
  sha: string;
}

async function getHealth(): Promise<HealthResponse> {
  const apiUrl = process.env.API_URL ?? "http://localhost:3000";

  try {
    const res = await fetch(`${apiUrl}/health`, { cache: "no-store" });
    if (!res.ok) {
      return { status: `error (${res.status})`, sha: "n/a" };
    }
    return (await res.json()) as HealthResponse;
  } catch {
    return { status: "unreachable", sha: "n/a" };
  }
}

export default async function HomePage() {
  const health = await getHealth();

  return (
    <main>
      <h1>Inventra</h1>
      <p>API status: {health.status}</p>
      <p>Build SHA: {health.sha}</p>
    </main>
  );
}
