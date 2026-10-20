import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Everything the app shell needs to mount a module. To add a module:
 *   1. create src/modules/<name>/ with a page and a module.ts exporting a ModuleManifest
 *   2. add it to the list in src/modules.ts
 * Nothing in src/core changes.
 */
export type ModuleManifest = {
  id: string;
  name: string;
  path: string;
  icon: LucideIcon;
  description: string;
  page: ComponentType;
};
