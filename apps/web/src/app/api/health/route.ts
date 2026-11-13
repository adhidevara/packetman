import { connection } from "next/server";
import { PACKETMAN_VERSION } from "@/lib/version";

/** Liveness probe for Docker/Kubernetes. Returns no user data. */
export async function GET() {
  await connection(); // evaluate per request so runtime env (relay flag) is reflected
  return Response.json(
    { status: "ok", version: PACKETMAN_VERSION, relay: process.env.PACKETMAN_RELAY_ENABLED !== "false" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
