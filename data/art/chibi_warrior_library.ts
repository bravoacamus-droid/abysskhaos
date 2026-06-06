/**
 * Chibi Warrior Art Library — the winning prompts used to generate
 * the 6 chibi Damned Warrior characters (one per weapon family) and
 * their 6 animations each. Stored here so:
 *
 *   1. Future class generation (mage, rogue, archer, infiltrator)
 *      can REUSE the body block + animation templates — only the
 *      class-specific clothing + weapon descriptions need to change.
 *
 *   2. If we need to regenerate any character or animation, the
 *      exact prompt that worked is right here, version-controlled.
 *
 * IMPORTANT: every prompt below was approved by the user during the
 * 2026-06-06 chibi-pivot session AFTER multiple iteration rounds.
 * Do NOT modify these without re-running the regenerate flow on a
 * test character first.
 */

/** Body block — class-agnostic. The substitutions [CLASS] and
 *  [CLOTHING_BLOCK] / [WEAPON_BLOCK] / [PALETTE] are class-specific.
 *  This is the foundation that worked across all 6 weapon variants. */
export const CHIBI_BODY_TEMPLATE = `HD-2D Octopath Traveler / FF VI Pixel Remaster battler sprite — 3/4 view FACING [FACING_DIRECTION], body angled to viewer's lower-left, attacking toward the LEFT of frame. Damned [CLASS] with [WEAPON_NAME]: young human male warrior, swept-back dark chocolate brown hair, determined youthful clean-shaven face, light tan skin. EYES: small narrow PIXEL EYES with dark brown irises and tiny black pupils — NOT large white circles, NOT round googly eyes, NOT white balls, just small dark intense pixel eyes typical of HD-2D Octopath battlers, eye whites barely visible. Wears [CLOTHING_BLOCK]. CHIBI-LEANING HD-2D body, proportions ~4.5 heads tall. Palette: [PALETTE]. WEAPON: [WEAPON_BLOCK]. NO CAPE, NO CLOAK, NO TRAILING FABRIC. Weight on back leg, dynamic combat stance with subtle S-curve, knees bent. Shaded 3-4 tones per color, light from upper-right, soft dark outer outline. Transparent background`;

/** Toxic phrases that broke prompts during the chibi pivot. NEVER
 *  use ANY of these in character creation prompts. */
export const TOXIC_PHRASES = [
  "ABSOLUTELY IDENTICAL across all N variants",
  "series",
  "variants in a series",
  "NO style variations",
  "ALWAYS symmetric",
  "the X variant MUST also...",
  "identical between variants",
  "across variants",
] as const;

/** Warrior-specific clothing block (for substituting into the body
 *  template). Other classes will have different blocks. */
export const WARRIOR_CLOTHING =
  "simple bronze pauldrons on both shoulders (symmetric), tattered crimson red battle tunic with brown leather trim, brown belt with bronze buckle, worn brown leather pants, dark boots";

export const WARRIOR_PALETTE =
  "crimson red tunic, brown leather, polished bronze, dark boots, dark brown hair";

export type WeaponFamily =
  | "sword_1h"
  | "sword_2h"
  | "sword_1h_shield"
  | "axe_1h"
  | "axe_1h_shield"
  | "axe_2h";

export type AnimState = "idle" | "attack" | "skill" | "block" | "hurt" | "death";

/** Per-weapon-family character creation prompt blocks (substituted
 *  into [WEAPON_BLOCK] of the body template). Plus the PixelLab
 *  character ID we ended up with after final approval. */
export const WEAPON_FAMILIES: Record<WeaponFamily, {
  weaponName: string;
  weaponBlock: string;
  pixellabCharId: string;
  note?: string;
}> = {
  sword_1h: {
    weaponName: "ONE-HANDED IRON SWORD in dynamic combat-ready stance",
    weaponBlock:
      "right hand grips a ONE-HANDED IRON SWORD held forward and slightly raised at combat-ready (blade angled diagonally forward, hilt at waist level, sword tip pointing forward and slightly up), LEFT HAND free and held in a dynamic combat-ready position (open palm forward at chest height for balance and threat-display, like a duelist's guard)",
    pixellabCharId: "4121f0b7-681a-40b3-9b58-e875ad9e35bb",
  },
  sword_2h: {
    weaponName: "LARGE TWO-HANDED IRON GREATSWORD",
    weaponBlock:
      "wielding a LARGE TWO-HANDED IRON GREATSWORD with BOTH HANDS gripping the SHORT HILT — top hand below crossguard, bottom hand at pommel, both hands on hilt only (never on blade). Massive blade angled forward toward the LEFT at combat ready, blade tip pointing left. NEVER one-handed, ALWAYS two-handed on hilt",
    pixellabCharId: "bea16dce-ce04-4e78-b49a-c60c8e0bb9f3",
    note: "Greatsword PixelLab combat_idle reads as hurt and combat_hurt reads as idle — they were swapped at upload time in upload-chibi-warriors-and-lizardman.ts",
  },
  sword_1h_shield: {
    weaponName: "SWORD AND ROUND METAL SHIELD",
    weaponBlock:
      "right hand grips a one-handed iron sword held forward at ready (blade angled forward, hilt at waist), left arm has a LARGE ROUND METAL SHIELD strapped to it held UP at chest height defensively in front of the body — the round shield is a CLEAR visual element, polished metal with a bronze rim, NEVER hidden behind the body",
    pixellabCharId: "1d5773cf-0c42-475d-a8d2-07d334ffa632",
  },
  axe_1h: {
    weaponName: "SINGLE-HANDED IRON BATTLE AXE",
    weaponBlock:
      "right hand grips a SINGLE-HANDED IRON BATTLE AXE — heavy CURVED axe BLADE on a short wooden HAFT, blade angled forward at hip, hilt at waist. NO sword anywhere, ALWAYS an axe with curved blade. Left hand free at his side ready for combat",
    pixellabCharId: "46d3e4b0-6073-48f7-8d17-e94168416bcb",
  },
  axe_1h_shield: {
    weaponName: "AXE AND ROUND METAL SHIELD",
    weaponBlock:
      "right hand grips a one-handed IRON BATTLE AXE (curved blade on short wooden haft, blade forward at hip), left arm has a LARGE ROUND METAL SHIELD strapped to it held UP at chest height defensively in front of the body — the round shield is a CLEAR visual element, polished metal with a bronze rim, NEVER hidden behind the body. NO sword anywhere, ALWAYS an axe in right hand and shield on left arm",
    pixellabCharId: "d6b71ce7-c47c-40a5-8a89-67e1485de3a0",
  },
  axe_2h: {
    weaponName: "MASSIVE TWO-HANDED IRON BATTLE GREATAXE",
    weaponBlock:
      "wielding a MASSIVE TWO-HANDED IRON BATTLE GREATAXE held with BOTH HANDS firmly gripping the long wooden HAFT — the huge wide curved AXE BLADE is the visual focal point, angled forward and down at combat ready, both hands stacked on the long haft, blade at hip level. NO sword anywhere, ALWAYS a massive greataxe with wide curved blade",
    pixellabCharId: "044d6b38-b0f7-4880-be20-a7ad343ee506",
  },
};

/** Per-(family × state) animation prompts. These were tuned per
 *  weapon shape (1H sword vs 2H greatsword vs +shield) to make the
 *  motion read correctly. They CAN be reused on a different class's
 *  weapon variants — only the weapon-specific words (sword/axe/etc.)
 *  need to change. */
export const ANIMATION_PROMPTS: Record<WeaponFamily, Record<AnimState, string>> = {
  // 1H weapons — sword 1H. Skill uses cyan magic on the SWORD blade
  // (not the free hand) per user preference.
  sword_1h: {
    idle:
      "HD-2D combat ready idle: warrior stands STILL in alert upright combat-ready pose holding the one-handed iron sword in his right hand, blade angled forward at hip, left hand free at side in duelist guard position. The sword stays STEADY and FIXED in his right hand every frame. Motion is ONLY very gentle smooth chest breathing — chest rises and falls smoothly. NO hand twitching, NO arm movement, NO jerky motion. The hands stay FIXED every frame, the sword stays steady. Pose essentially identical across all frames except gentle breathing. Eyes wide open and forward-focused",
    attack:
      "HD-2D powerful AGILE one-handed sword SLASH attack with IMPACT EFFECT: warrior with the one-handed iron sword in his right hand performs a SWIFT POWERFUL DIAGONAL SLASH arc forward — raising the sword behind his right shoulder building anticipation, then SWINGING in a quick agile arc forward with body weight committed, front foot stepping in. ON IMPACT a bright WHITE FLASH/SPARK effect bursts at the blade edge showing the strike landing — crisp clean white impact spark, dramatic follow-through with sword extended forward after the strike. The sword is held SINGLE-HANDED in the right hand throughout — left hand free at side. Clean crisp blade, no blur, no smoke. The impact effect is a bright white spark/flash, NOT smoke or cloud",
    skill:
      "HD-2D powerful magical sword strike skill: warrior delivers a POWERFUL focused sword strike with the one-handed iron sword in his right hand — charging the entire sword blade with bright CYAN MAGICAL ENERGY glowing intensely along the blade, raising the cyan-glowing sword high overhead, then SLAMMING down in a devastating magical slash with the sword as the focal point, cyan magical shockwave bursts outward from the blade edge on impact, dramatic follow-through with sword extended low trailing cyan sparks. THE MAGIC IS ON THE SWORD BLADE throughout — left hand stays at side and free, ALL energy and motion is from the SWORD itself. Clean crisp glowing blade, both action and magic centered on the one-handed sword strike",
    block:
      "defensive guard: warrior holds the one-handed sword horizontally in front of his body as a shield to protect himself, blade glows bright white",
    hurt:
      "warrior takes a hit and briefly flinches IN PLACE from the impact, body recoils slightly with the blow, the one-handed sword stays firmly in his right hand, feet stay PLANTED on the ground, quick recovery back to combat-ready stance, NO backward movement, NO leaping, just brief flinch and quick recovery",
    death:
      "HD-2D defeated warrior collapse: warrior's knees buckle as he staggers forward and CROUCHES DEEPLY DOWN low to the ground, the one-handed sword plunges down with both hands gripping the hilt and the blade tip planted into the ground in front, warrior LEANS LOW AND CROUCHES DEEP onto the sword as a cane, drops onto one knee then the second knee so he is fully kneeling LOW with both hands resting on the sword hilt and head bowed low in defeat. The SWORD STAYS ITS NORMAL SIZE every frame — it is NOT elongated, NOT stretched, NOT made longer, NOT deformed. The WARRIOR CROUCHES LOWER AND DEEPER to reach the sword's natural length. Warrior NEVER falls backward, kneels low with sword planted vertically at its natural normal length",
  },

  // 2H greatsword — heavy weight, both hands always on hilt. Skill is
  // cyan magic CHARGED ON THE BLADE (free hand isn't free).
  sword_2h: {
    idle:
      "HD-2D combat ready idle: warrior stands STILL in alert upright combat-ready pose holding the heavy two-handed greatsword in both hands gripping the SHORT HILT, the greatsword stays STEADY and FIXED in his hands every frame. Motion is ONLY very gentle smooth chest breathing — chest rises and falls smoothly with each breath. NO hand twitching, NO arm movement, NO jerky motion, NO coughing-like lurching, NO upper body jerk. The hands stay FIXED on the hilt every frame, the greatsword stays steady. The pose is essentially identical across all frames except for the gentle smooth breathing of the chest. Eyes wide open and forward-focused throughout",
    attack:
      "HD-2D powerful WIDE two-handed greatsword strike: warrior raises the heavy greatsword high overhead with both hands on the SHORT HILT, slams down in a DEVASTATING WIDE slash cleave with full body weight committed, dramatic follow-through with greatsword extended low after impact. Both hands stay on the hilt every frame, heavy weight visible in body posture. Clean crisp blade throughout, no blur, no smoke, no fog",
    skill:
      "HD-2D powerful WIDE magical greatsword strike: the warrior charges the entire greatsword blade with bright CYAN MAGICAL ENERGY glowing intensely along the long massive blade, raises the cyan-glowing heavy greatsword high overhead with both hands on the long hilt, slams down in a DEVASTATING WIDE magical cleave with full body weight committed, cyan magical shockwave bursts outward from the long blade edge on impact, dramatic follow-through trailing cyan sparks. THE MAGIC IS ON THE GREATSWORD BLADE throughout — never a free hand. Both hands stay on the hilt every frame, heavy weight visible in body posture",
    block:
      "defensive guard: warrior holds the greatsword horizontally in front of his body as a shield to protect himself, blade glows bright white",
    hurt:
      "warrior takes a hit and briefly flinches IN PLACE from the impact, body recoils slightly with the blow, both hands stay firmly on the long greatsword hilt, feet stay PLANTED on the ground, quick recovery back to combat-ready stance, NO backward movement, NO leaping, just brief flinch and quick recovery",
    death:
      "HD-2D defeated warrior collapse: warrior's knees buckle as he staggers forward, the greatsword plunges down with both hands gripping the SHORT HILT and the massive blade tip planted firmly into the ground in front, warrior leans his weight on the upright greatsword as a cane, drops onto one knee then the second knee comes down so he is fully kneeling with both hands resting on the SHORT hilt and head bowed low in exhausted defeat. Warrior NEVER falls backward, ALWAYS stays upright on knees with greatsword planted vertically. The HILT IS SHORT for a large blade (same short hilt as the base sprite, NOT extended or long)",
  },

  // 1H+shield — shield raised throughout. Block focuses on SHIELD as
  // the protagonist (not the weapon). Skill keeps shield up while
  // sword channels cyan magic.
  sword_1h_shield: {
    idle:
      "HD-2D combat ready idle: warrior stands STILL in alert upright combat-ready pose holding the one-handed iron sword in his right hand and a LARGE ROUND METAL SHIELD on his left arm raised at chest height defensively. The sword stays in his right hand and the shield stays raised on his left arm every frame. Motion is ONLY very gentle smooth chest breathing. NO hand twitching, NO arm movement, NO jerky motion. Pose essentially identical across all frames except gentle breathing. Eyes wide open and forward-focused. MOUTH STAYS CLOSED throughout — the warrior is silent, NOT shouting, NOT yelling, NOT opening his mouth at all, mouth remains closed in every frame. Both weapon and shield stay steady",
    attack:
      "HD-2D powerful AGILE one-handed sword SLASH attack with IMPACT EFFECT: warrior with the one-handed iron sword in his right hand performs a SWIFT POWERFUL DIAGONAL SLASH arc forward — raising the sword behind his right shoulder building anticipation, then SWINGING in a quick agile arc forward with body weight committed, front foot stepping in. ON IMPACT a bright WHITE FLASH/SPARK effect bursts at the blade edge showing the strike landing. The SHIELD STAYS RAISED on the left arm throughout the attack as defensive cover. The sword is held SINGLE-HANDED in the right hand throughout. Clean crisp blade, no blur, no smoke. Impact effect is bright white spark",
    skill:
      "HD-2D powerful magical sword strike skill: warrior delivers a POWERFUL focused sword strike with the one-handed iron sword in his right hand — charging the entire sword blade with bright CYAN MAGICAL ENERGY glowing intensely along the blade, raising the cyan-glowing sword high overhead, then SLAMMING down in a devastating magical slash with the sword as the focal point, cyan magical shockwave bursts outward from the blade edge on impact, dramatic follow-through with sword extended low trailing cyan sparks. THE MAGIC IS ON THE SWORD BLADE throughout. The shield stays raised on the left arm throughout as defensive cover. Clean crisp glowing blade",
    block:
      "defensive shield guard: warrior raises his LARGE ROUND METAL SHIELD UP and FORWARD as the primary defensive barrier protecting his body, the SHIELD is the protagonist of this animation glowing bright white as if sunlight shines on the polished metal. The sword is held back behind/beside the shield in a secondary position. The SHIELD is the focal point — raised forward to block any incoming attack, the entire animation centers on the shield being held forward as protection",
    hurt:
      "warrior takes a hit and briefly flinches IN PLACE from the impact, body recoils slightly with the blow, the sword stays firmly in his right hand and the shield stays on his left arm, feet stay PLANTED on the ground, quick recovery back to combat-ready stance, NO backward movement, NO leaping, just brief flinch and quick recovery",
    death:
      "HD-2D defeated warrior collapse: warrior's knees buckle as he staggers forward and CROUCHES DEEPLY DOWN low to the ground, the sword plunges down with both hands gripping the hilt and the blade tip planted into the ground in front, shield lowered on the left arm or dropped to the side. Warrior LEANS LOW AND CROUCHES DEEP onto the sword as a cane, drops onto one knee then the second knee so he is fully kneeling LOW with both hands on the upright hilt and head bowed low in defeat. The SWORD STAYS ITS NORMAL SIZE every frame — NOT elongated, NOT stretched. The WARRIOR CROUCHES LOWER AND DEEPER to reach the sword's natural length. Warrior NEVER falls backward, kneels low with sword planted vertically at natural length",
  },

  axe_1h: {
    idle:
      "HD-2D combat ready idle: warrior stands STILL in alert upright combat-ready pose holding the single-handed iron battle axe in his right hand, curved blade angled forward at hip, left hand free at side. The axe stays STEADY and FIXED in his right hand every frame. Motion is ONLY very gentle smooth chest breathing — chest rises and falls smoothly. NO hand twitching, NO arm movement, NO jerky motion. The hands stay FIXED every frame, the axe stays steady. Pose essentially identical across all frames except gentle breathing. Eyes wide open and forward-focused",
    attack:
      "HD-2D powerful AGILE one-handed axe CHOP attack with IMPACT EFFECT: warrior with the single-handed iron battle axe in his right hand performs a SWIFT POWERFUL DOWNWARD CHOP — raising the axe high overhead with right arm building anticipation, then SWINGING in a quick agile downward chop arc forward with body weight committed, front foot stomping in. ON IMPACT a bright WHITE FLASH/SPARK effect bursts at the curved blade edge showing the strike landing — crisp clean white impact spark, dramatic follow-through with axe extended low after the strike. The axe is held SINGLE-HANDED in the right hand throughout — left hand free at side. Clean crisp curved blade, no blur, no smoke. The impact effect is a bright white spark/flash, NOT smoke or cloud",
    skill:
      "HD-2D powerful magical axe strike skill: warrior delivers a POWERFUL focused axe chop with the single-handed iron axe in his right hand — charging the entire axe blade with bright CYAN MAGICAL ENERGY glowing intensely along the curved blade, raising the cyan-glowing axe high overhead, then SLAMMING down in a devastating magical chop with the axe as the focal point, cyan magical shockwave bursts outward from the blade edge on impact, dramatic follow-through with axe extended low trailing cyan sparks. THE MAGIC IS ON THE AXE BLADE throughout — left hand stays at side and free, ALL energy and motion is from the AXE itself. Clean crisp glowing curved blade",
    block:
      "defensive guard: warrior holds the one-handed axe horizontally in front of his body as a shield to protect himself, blade glows bright white",
    hurt:
      "warrior takes a hit and briefly flinches IN PLACE from the impact, body recoils slightly with the blow, the one-handed axe stays firmly in his right hand, feet stay PLANTED on the ground, quick recovery back to combat-ready stance, NO backward movement, NO leaping, just brief flinch and quick recovery",
    death:
      "HD-2D defeated warrior collapse: warrior's knees buckle as he staggers forward and CROUCHES DEEPLY DOWN low to the ground, the one-handed axe plunges down with both hands gripping the haft and the curved blade buried in the ground in front, warrior LEANS LOW AND CROUCHES DEEP onto the axe haft as a cane, drops onto one knee then the second knee so he is fully kneeling LOW with both hands resting on the upright haft and head bowed low in defeat. The AXE STAYS ITS NORMAL SIZE every frame — it is NOT elongated, NOT stretched, NOT made longer, NOT deformed. The WARRIOR CROUCHES LOWER AND DEEPER to reach the axe's natural length. Warrior NEVER falls backward, kneels low with axe planted blade-down haft-up at its natural normal length",
  },

  axe_1h_shield: {
    idle:
      "HD-2D combat ready idle: warrior stands STILL in alert upright combat-ready pose holding the single-handed iron battle axe in his right hand and a LARGE ROUND METAL SHIELD on his left arm raised at chest height defensively. The axe stays in his right hand and the shield stays raised on his left arm every frame. Motion is ONLY very gentle smooth chest breathing. NO hand twitching, NO arm movement, NO jerky motion. Pose essentially identical across all frames except gentle breathing. Eyes wide open and forward-focused. Both weapon and shield stay steady",
    attack:
      "HD-2D powerful AGILE one-handed axe CHOP attack with IMPACT EFFECT: warrior with the single-handed iron axe in his right hand performs a SWIFT POWERFUL DOWNWARD CHOP — raising the axe high overhead with right arm building anticipation, then SWINGING in a quick agile downward chop arc forward with body weight committed, front foot stomping in. ON IMPACT a bright WHITE FLASH/SPARK effect bursts at the curved blade edge showing the strike landing. The SHIELD STAYS RAISED on the left arm throughout the attack as defensive cover. The axe is held SINGLE-HANDED in the right hand throughout. Clean crisp curved blade, no blur, no smoke. Impact effect is bright white spark",
    skill:
      "HD-2D powerful magical axe strike skill: warrior delivers a POWERFUL focused axe chop with the single-handed iron axe in his right hand — charging the entire axe blade with bright CYAN MAGICAL ENERGY glowing intensely along the curved blade, raising the cyan-glowing axe high overhead, then SLAMMING down in a devastating magical chop with the axe as the focal point, cyan magical shockwave bursts outward from the blade edge on impact, dramatic follow-through with axe extended low trailing cyan sparks. THE MAGIC IS ON THE AXE BLADE throughout. The shield stays raised on the left arm throughout as defensive cover. Clean crisp glowing curved blade",
    block:
      "defensive shield guard: warrior raises his LARGE ROUND METAL SHIELD UP and FORWARD as the primary defensive barrier protecting his body, the SHIELD is the protagonist of this animation glowing bright white as if sunlight shines on the polished metal. The axe is held back behind/beside the shield in a secondary position. The SHIELD is the focal point — raised forward to block any incoming attack, the entire animation centers on the shield being held forward as protection",
    hurt:
      "warrior takes a hit and briefly flinches IN PLACE from the impact, body recoils slightly with the blow, the axe stays firmly in his right hand and the shield stays on his left arm, feet stay PLANTED on the ground, quick recovery back to combat-ready stance, NO backward movement, NO leaping, just brief flinch and quick recovery",
    death:
      "HD-2D defeated warrior collapse: warrior's knees buckle as he staggers forward and CROUCHES DEEPLY DOWN low to the ground, the axe plunges down with both hands gripping the haft and the curved blade buried in the ground in front, shield lowered on the left arm or dropped to the side. Warrior LEANS LOW AND CROUCHES DEEP onto the axe haft as a cane, drops onto one knee then the second knee so he is fully kneeling LOW with both hands on the upright haft and head bowed low in defeat. The AXE STAYS ITS NORMAL SIZE every frame — NOT elongated, NOT stretched. The WARRIOR CROUCHES LOWER AND DEEPER to reach the axe's natural length. Warrior NEVER falls backward, kneels low with axe planted blade-down haft-up at natural length",
  },

  axe_2h: {
    idle:
      "HD-2D combat idle stance: warrior holds the heavy two-handed greataxe in both hands gripping the long haft, subtle natural body breathing motion only (chest rises and falls gently with each breath), eyes wide open and forward-focused throughout, body stays planted in coiled combat-ready pose, both hands stay on the haft every frame, returns seamlessly to start pose for closed loop",
    attack:
      "HD-2D powerful WIDE two-handed greataxe overhead cleave with maximum force and weight: raising the massive heavy greataxe high overhead with both hands gripping the long haft body coiled back, slashing down in a WIDE POWERFUL arc forward with FULL body weight committed, front foot stomping in to plant momentum, dramatic follow-through with greataxe extended low after the powerful impact. Both hands stay firmly on the long haft throughout. The HEAVY weight of the greataxe is visible in body posture every frame",
    skill:
      "HD-2D powerful WIDE magical greataxe strike: the warrior charges the entire greataxe blade with bright CYAN MAGICAL ENERGY glowing intensely along the wide curved blade, raises the cyan-glowing heavy greataxe high overhead with both hands on the long haft, slams down in a DEVASTATING WIDE magical cleave with full body weight committed, cyan magical shockwave bursts outward from the wide blade edge on impact, dramatic follow-through trailing cyan sparks. THE MAGIC IS ON THE GREATAXE BLADE throughout — never a free hand. Both hands stay on the haft every frame, heavy weight visible in body posture",
    block:
      "defensive parry pose: warrior raises the greataxe HORIZONTALLY UP at face height with both hands wide on the long haft like a quarterstaff defensive guard, blocking an incoming sword strike from above, body braced and leaning slightly back, NOT attacking, pure defense. The greataxe blade GLOWS BRIGHT WHITE as if sunlight is shining and reflecting off the polished steel",
    hurt:
      "warrior takes a hit and briefly flinches IN PLACE from the impact, body recoils slightly with the blow, both hands stay firmly on the long greataxe haft, feet stay PLANTED on the ground, quick recovery back to combat-ready stance, NO backward movement, NO leaping, just brief flinch and quick recovery",
    death:
      "HD-2D defeated warrior collapse: warrior's knees buckle as he staggers forward, the greataxe plunges down with both hands gripping the long haft and the wide curved blade buried in the ground in front, warrior leans his weight on the upright greataxe haft as a massive cane, drops onto one knee then the second knee comes down so he is fully kneeling with both hands resting on the upright haft and head bowed low in exhausted defeat. Warrior NEVER falls backward, ALWAYS stays upright on knees with greataxe planted blade-down haft-up as a staff",
  },
};

/** Standard PixelLab call params we used across all chibi anims. */
export const CHIBI_GEN_PARAMS = {
  size: 64,
  view: "side" as const,
  mode: "v3" as const,
  facing: "south" as const,
  atlasFacingKey: "south-west" as const, // relabeled at upload time
  frameCountByState: {
    idle: 8,
    attack: 10,
    skill: 8,
    block: 8,
    hurt: 8,
    death: 8,
  } satisfies Record<AnimState, number>,
};
