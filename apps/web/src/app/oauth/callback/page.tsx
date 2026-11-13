import type { Metadata } from "next";
import { OAuthCallback } from "./OAuthCallback";

export const metadata: Metadata = {
  title: "Packetman · OAuth",
  robots: { index: false },
};

export default function Page() {
  return <OAuthCallback />;
}
