import { HandCoins } from "lucide-react";
import type { ModuleManifest } from "../types";
import LendingPage from "./LendingPage";

export const lendingModule: ModuleManifest = {
  id: "lending",
  name: "Lending",
  path: "/lending",
  icon: HandCoins,
  description: "Borrow against your collateral",
  page: LendingPage,
};
