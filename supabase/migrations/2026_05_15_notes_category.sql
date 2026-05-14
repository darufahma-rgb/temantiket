-- Add category column to notes table
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS notes_category_idx ON public.notes(category);
