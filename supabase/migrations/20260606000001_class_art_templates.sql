-- Phase 4d-chibi: store the winning prompts used to generate the
-- chibi warrior set in the DB, so the same logic can be reused for
-- future classes (mage, rogue, archer, etc.) without re-deriving
-- the style from scratch.
--
-- Categories:
--   character_body        — the parameterized body prompt template
--                           (one row, applies to ALL classes)
--   character_weapon      — per weapon-family character prompt
--                           (e.g. greatsword body + weapon block)
--   animation             — per (weapon_family × state) animation
--                           prompt that worked on the chibi warrior
--
-- The prompt_template column has [CLASS] / [WEAPON] placeholders
-- intended for substitution when generating non-warrior chars.

create table if not exists public.class_art_templates (
    id                       text primary key,
    category                 text not null
        check (category in ('character_body', 'character_weapon', 'animation')),
    template_class           text not null,    -- 'warrior' (origin class)
    weapon_family            text,             -- sword_1h, sword_2h, ...
    animation_state          text,             -- idle, attack, skill, block, hurt, death
    prompt                   text not null,    -- the prompt that actually worked
    prompt_template          text,             -- parameterized version with placeholders
    pixellab_character_id    text,             -- reference char in PixelLab
    pixellab_animation_id    text,             -- reference anim in PixelLab
    frame_count              integer,          -- typical frame count
    approved                 boolean not null default true,
    notes                    text,
    created_at               timestamptz not null default now()
);

create index if not exists class_art_templates_category_idx
    on public.class_art_templates (category, template_class, weapon_family);
