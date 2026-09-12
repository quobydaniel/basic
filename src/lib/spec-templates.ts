// Category-driven specification templates — Jiji-style. A seller picks a
// category; these fields appear in the product editor and render in the
// product page's Details tab. Matched by keywords in the category slug/name.
// Fields with `options` render as tap-to-select chips in the editor —
// selection over typing wherever the answer is predictable.
export type SpecField = { key: string; placeholder?: string; options?: string[] };

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOE_SIZES = ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"];
const COLOURS = ["Black", "White", "Gold", "Blue", "Red", "Green", "Brown", "Beige", "Multicolour"];
const CONDITIONS = ["New", "Refurbished", "Used — like new", "Used — good"];
const STORAGE = ["64GB", "128GB", "256GB", "512GB", "1TB"];
const MATERIALS = ["Cotton", "Leather", "Kente cloth", "Brass", "Wood", "Ceramic", "Rattan", "Silver"];

const TEMPLATES: { match: string[]; fields: SpecField[] }[] = [
  {
    match: ["phone", "electronic", "audio", "digital", "computer", "laptop", "tablet", "tv"],
    fields: [
      { key: "Brand", placeholder: "e.g. Apple, Samsung, Tecno" },
      { key: "Model", placeholder: "e.g. iPhone 15 Pro" },
      { key: "Condition", options: CONDITIONS },
      { key: "RAM", options: ["2GB", "3GB", "4GB", "6GB", "8GB", "12GB"] },
      { key: "Storage", options: STORAGE },
      { key: "Screen size", options: ["5.5\"", "6.1\"", "6.5\"", "6.7\"", "13\"", "15\"", "17\""] },
    ],
  },
  {
    match: ["fashion", "women", "men", "kids", "clothing", "shoes", "accessories", "jewelry", "bag"],
    fields: [
      { key: "Brand", placeholder: "e.g. GTP, Woodin" },
      { key: "Size", options: [...SIZES, ...SHOE_SIZES] },
      { key: "Colour", options: COLOURS },
      { key: "Material", options: MATERIALS },
      { key: "Condition", options: CONDITIONS },
    ],
  },
  {
    match: ["beauty", "skincare", "hair", "health", "wellness", "cosmetic"],
    fields: [
      { key: "Brand", placeholder: "e.g. Nafsuka Skin" },
      { key: "Volume", options: ["30ml", "50ml", "100ml", "250ml", "500ml", "1L"] },
      { key: "Skin/Hair type", options: ["Dry skin", "Oily skin", "Combination", "Sensitive", "All hair types"] },
      { key: "Ingredients", placeholder: "e.g. Raw shea, neem" },
      { key: "Expiry", placeholder: "e.g. 08/2027" },
    ],
  },
  {
    match: ["food", "drink", "packaged", "grocery"],
    fields: [
      { key: "Brand", placeholder: "e.g. Nkulenu" },
      { key: "Weight/Volume", options: ["100g", "250g", "500g", "1kg", "750ml", "1L", "2L"] },
      { key: "Packaging", options: ["Sealed jar", "Pouch", "Bottle", "Box", "Vacuum-packed"] },
      { key: "Best before", placeholder: "e.g. 12/2026" },
    ],
  },
  {
    match: ["home", "living", "furniture", "kitchen", "decor", "appliance", "bedding"],
    fields: [
      { key: "Brand", placeholder: "e.g. Artisans GH" },
      { key: "Material", options: MATERIALS },
      { key: "Dimensions", placeholder: "e.g. 45 × 30 × 20 cm" },
      { key: "Colour", options: COLOURS },
      { key: "Condition", options: CONDITIONS },
    ],
  },
  {
    match: ["art", "craft", "painting", "ceramic", "sculpt"],
    fields: [
      { key: "Artist/Maker", placeholder: "e.g. Adinkra Studio" },
      { key: "Material", options: MATERIALS },
      { key: "Dimensions", placeholder: "e.g. 30 cm tall" },
      { key: "Year", placeholder: "e.g. 2026" },
      { key: "Condition", options: CONDITIONS },
    ],
  },
];

const DEFAULT_FIELDS: SpecField[] = [
  { key: "Brand", placeholder: "e.g. Maker or brand name" },
  { key: "Condition", options: CONDITIONS },
];

/** Pick the template whose keywords hit the category slug or name. */
export function specFieldsFor(categorySlug?: string | null, categoryName?: string | null): SpecField[] {
  const hay = `${categorySlug ?? ""} ${categoryName ?? ""}`.toLowerCase();
  for (const t of TEMPLATES) {
    if (t.match.some((m) => hay.includes(m))) return t.fields;
  }
  return DEFAULT_FIELDS;
}
