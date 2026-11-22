-- Coordenadas confirmadas do ponto de embarque e de cada parada do TripDeparture.
-- Opcional e aditivo: viagens e embarques antigos continuam com NULL; nunca
-- preenchidas automaticamente (sempre por pesquisa + confirmação explícita no painel).
ALTER TABLE "Trip" ADD COLUMN "meetingLat" REAL;
ALTER TABLE "Trip" ADD COLUMN "meetingLng" REAL;
ALTER TABLE "TripDeparture" ADD COLUMN "lat" REAL;
ALTER TABLE "TripDeparture" ADD COLUMN "lng" REAL;
