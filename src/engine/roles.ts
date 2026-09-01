// Canonical role identifiers.
//
// These are INTERNAL IDs, never shown to a user. Display names live in
// src/i18n/ (Sprint 2) so that the same role can be called different things in
// different languages without touching game logic.
//
// The acronyms are inherited from v1 because they are the join key across
// every table in the project; renaming them to English would be a large,
// error-prone change with no user-visible benefit.
//
// Note NIN vs NIA: v1 used NIN for "Niño Salvaje" (wild child, picks a father)
// and NIA for "Niña Pequeña" (little girl, peeks during the night). The
// abandoned v2 tree used NIN for the little girl instead, so the two trees
// disagreed on what the same acronym meant. v3 follows v1.

export const ROLE_IDS = [
  // Village
  'ALD', // aldeano / villager
  'VID', // vidente / seer
  'ANC', // anciano / elder
  'BRU', // bruja / potion-brewer
  'PIR', // pirómano / arsonist
  'CUE', // cuervo / raven
  'PRO', // protector / guardian
  'NIN', // niño salvaje / wild child
  'DOM', // domador de osos / bear tamer
  'CUP', // cupido / matchmaker
  'CAZ', // cazador / hunter
  'ANG', // ángel / angel
  'ACT', // actor / understudy
  'NIA', // niña pequeña / little girl
  'SEC', // abominable sectario — in the narrator script, in neither old tree
  // Wolves
  'LOB', // hombre lobo / werewolf
  'PER', // perro lobo / wolf dog
  'INF', // infecto padre lobo / infecting wolf father
  'ALB', // lobo albino / albino wolf
] as const

export type RoleId = (typeof ROLE_IDS)[number]

export const isRoleId = (value: string): value is RoleId =>
  (ROLE_IDS as readonly string[]).includes(value)
