export type PackagingLevelInput = { name: string; unitsInLevel: number };
export type PackagingLevelWithFactor = { level: number; name: string; unitsInLevel: number; cumulativeUnits: number };

// Levels are stored bottom-up (level 1 = smallest pack level directly above the base unit).
// unitsInLevel is always relative to the level directly below (or the base unit, for level 1).
// cumulativeUnits is the total number of base units one of this level contains.
export function withCumulativeFactors(levels: { level: number; name: string; unitsInLevel: number }[]): PackagingLevelWithFactor[] {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  let cumulative = 1;
  return sorted.map((l) => {
    cumulative *= l.unitsInLevel;
    return { level: l.level, name: l.name, unitsInLevel: l.unitsInLevel, cumulativeUnits: cumulative };
  });
}

// Level names must be unique and differ from the base unit: Purchase picks a level by name, so
// a "STRIP" level on a medicine whose base unit is STRIP would be received as single strips.
export function packagingNameProblem(levels: PackagingLevelInput[], baseUnit: string): string | null {
  const unit = baseUnit.trim().toUpperCase();
  const seen = new Set<string>();
  for (const level of levels) {
    if (level.name === unit) return `A pack level can't be called "${level.name}" — that's already the base unit. Name it after the pack instead (e.g. BOX, CARTON, PACK).`;
    if (seen.has(level.name)) return `Two pack levels are both called "${level.name}". Give each level a different name.`;
    seen.add(level.name);
  }
  return null;
}

export function parsePackagingLevels(raw: unknown): PackagingLevelInput[] | null {
  if (!Array.isArray(raw)) return null;
  const levels: PackagingLevelInput[] = [];
  for (const entry of raw) {
    const record = entry as Record<string, unknown>;
    const name = typeof record?.name === "string" ? record.name.trim().toUpperCase() : "";
    const unitsInLevel = Number(record?.unitsInLevel);
    if (!name || !Number.isFinite(unitsInLevel) || unitsInLevel <= 0) return null;
    levels.push({ name, unitsInLevel });
  }
  return levels;
}
