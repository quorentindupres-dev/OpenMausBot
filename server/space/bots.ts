import type { A01BindingMode } from "../../shared/space.ts";

export type SpaceBot = {
  id: string;
  name: string;
  title?: string;
  chiefOfStaff?: boolean;
  a01Role?: string;
  a01Mode?: A01BindingMode;
  projectSlug?: string;
  tasks?: ReadonlyArray<{ threadId: string; title?: string }>;
};

let bots: () => readonly SpaceBot[] = () => [];

/** The harness's live bot list, for the mirror, the prompt and the agents' routes. */
export function bindSpaceBots(source: () => readonly SpaceBot[]): void {
  bots = source;
}

export const spaceBots = (): readonly SpaceBot[] => bots();
