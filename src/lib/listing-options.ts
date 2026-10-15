// Choices for the "List a property" form (shared by the form and its server action).
export const DEED_TYPES = [
  "Chanote (โฉนดที่ดิน)",
  "Nor Sor 3 Gor (น.ส.3 ก.)",
  "Nor Sor 3 (น.ส.3)",
  "Condominium title (อ.ช.2)",
  "Not sure yet",
] as const;

export const PROPERTY_TYPES = [
  { value: "condo", label: "Condo" },
  { value: "house", label: "House" },
  { value: "townhouse", label: "Townhouse" },
  { value: "land", label: "Land" },
] as const;
