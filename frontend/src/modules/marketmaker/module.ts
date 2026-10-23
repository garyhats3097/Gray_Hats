import { ArrowLeftRight } from "lucide-react";
import type { ModuleManifest } from "../types";
import MarketMakerPage from "./MarketMakerPage";

export const marketMakerModule: ModuleManifest = {
  id: "market-maker",
  name: "Market Maker",
  path: "/market-maker",
  icon: ArrowLeftRight,
  description: "Indicative bid/ask quotes from the shared oracle (stub)",
  page: MarketMakerPage,
};
