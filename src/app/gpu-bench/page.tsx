import type { Metadata } from "next";
import Bench from "./Bench";

export const metadata: Metadata = {
  title: "GPU benchmark",
  robots: { index: false },
};

// Developer page: compares the WebGPU search with the CPU search.
export default function Page() {
  return <Bench />;
}
