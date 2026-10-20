import type { ModuleManifest } from "./modules/types";
import { perpsModule } from "./modules/perps/module";
import { lendingModule } from "./modules/lending/module";

/** Mounted modules, in sidebar order. Adding a module = one line here. */
export const MODULES: ModuleManifest[] = [perpsModule, lendingModule];
