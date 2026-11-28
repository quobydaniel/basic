// AI shopkeeper characters — Premium storefront customization. A seller
// picks a tiny character to greet buyers on their storefront in place of
// the generic assistant; the auto-pilot also role-plays as the character
// in chats (identity comes from stores.ai_character + stores.ai_name).

export type AiCharacter = {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
};

export const AI_CHARACTERS: AiCharacter[] = [
  { id: "akua", name: "Akua", emoji: "🧕🏾", blurb: "Market maven — warm and chatty" },
  { id: "kofi", name: "Kofi", emoji: "🧑🏾‍🍳", blurb: "Shop keeper — brisk and helpful" },
  { id: "ama", name: "Ama", emoji: "👩🏾‍💼", blurb: "Pro desk — polished and precise" },
  { id: "nkoso", name: "Nkoso", emoji: "🤖", blurb: "Tech bot — fast and factual" },
  { id: "sardine", name: "Sardine", emoji: "🐈‍⬛", blurb: "Shop cat — cool and mysterious" },
  { id: "owusu", name: "Owusu", emoji: "🦉", blurb: "Night owl — wise and patient" },
];

export function characterById(id: string | null | undefined): AiCharacter | null {
  if (!id) return null;
  return AI_CHARACTERS.find((c) => c.id === id) ?? null;
}
