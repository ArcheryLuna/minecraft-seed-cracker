import type { Metadata } from "next";
import SeedGenerator from "@/components/generator/SeedGenerator";

export const metadata: Metadata = {
  title: "Seed Generator",
  description: "Make a Minecraft: Java Edition seed: random, from text, or with structures where you want them.",
};

export default function Page() {
  return <SeedGenerator />;
}
