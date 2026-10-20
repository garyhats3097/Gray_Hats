import { CandlestickChart } from "lucide-react";
import type { ModuleManifest } from "../types";
import PerpsPage from "./PerpsPage";

export const perpsModule: ModuleManifest = {
  id: "perps",
  name: "Perpetuals",
  path: "/perps",
  icon: CandlestickChart,
  description: "Leveraged long/short positions on ETH/USD",
  page: PerpsPage,
};
