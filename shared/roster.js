import { characters as characterMaster } from "../data/prisma/catalog.js";

// Keep the source master and existing ownership for a future release.
const deferredIds = new Set([401, 403, 402, 501]);
export const characters = characterMaster.filter((c) => !deferredIds.has(c.id));
export const isAvailableCharacter = (id) =>
  characters.some((c) => c.id === Number(id));
