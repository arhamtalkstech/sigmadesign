import type { Metadata } from "next";
import { ConnectClient } from "./connect-client";

export const metadata: Metadata = {
  title: "Agents · SigmaDesign",
  description:
    "Connect local coding agents to your SigmaDesign library — tools, setup, and skill download.",
};

export default function ConnectPage() {
  return <ConnectClient />;
}
