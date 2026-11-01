-- “Embarque a confirmar” é informação comunicável; não use campo vazio para
-- representar essa decisão. O default preserva as viagens já existentes.
ALTER TABLE "Trip" ADD COLUMN "meetingTBD" BOOLEAN NOT NULL DEFAULT false;
