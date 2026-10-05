import { isItemDone } from "./lab-results";

type Decimalish = { toString(): string } | null;

// Catalog items go to the browser with Decimal columns turned into plain strings.
export const serializeCatalogItem = <
  T extends { price: { toString(): string }; parameters?: { altFactor: Decimalish; refLow: Decimalish; refHigh: Decimalish }[] },
>(
  item: T,
) => ({
  ...item,
  price: item.price.toString(),
  parameters: (item.parameters ?? []).map((p) => ({
    ...p,
    altFactor: p.altFactor?.toString() ?? null,
    refLow: p.refLow?.toString() ?? null,
    refHigh: p.refHigh?.toString() ?? null,
  })),
});

type ResultValueRow = {
  id: number;
  parameterId: number | null;
  kind: string;
  name: string;
  unit: string | null;
  altUnit: string | null;
  altValue: string | null;
  referenceText: string | null;
  value: string;
  flag: string | null;
};

// The shape of one test's result as the Lab and Operator screens receive it.
export function serializeResultItem(item: {
  id: number;
  nameAtSale: string;
  result: string | null;
  remarks: string | null;
  resultUploadedAt: Date | null;
  resultValues: ResultValueRow[];
}) {
  return {
    id: item.id,
    name: item.nameAtSale,
    result: item.result,
    remarks: item.remarks,
    done: isItemDone(item),
    resultUploadedAt: item.resultUploadedAt,
    values: item.resultValues.map((v) => ({
      id: v.id,
      parameterId: v.parameterId,
      kind: v.kind,
      name: v.name,
      unit: v.unit,
      altUnit: v.altUnit,
      altValue: v.altValue,
      referenceText: v.referenceText,
      value: v.value,
      flag: v.flag,
    })),
  };
}
