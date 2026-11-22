import { request, type DocumentApi, type DocumentSuggestions, type ExtractedDocumentImage, type TripDocument, type UploadedMedia } from './index';

// PDFs do roteiro por empresa: mesma interface (DocumentApi, ver api/index.ts)
// do operador legado, só com o caminho isolado por organizationId — reaproveita
// TripDocuments.tsx sem duplicar a UI. Isolamento real é da rota no servidor
// (organizationTripDocumentRoutes.ts: OWNER/ADMIN, trip.organizationId); aqui
// é só o cliente HTTP.
const documentPath = (organizationId: string, tripId: string, documentId = '') =>
  `/organizations/${encodeURIComponent(organizationId)}/tourism/trips/${encodeURIComponent(tripId)}/documents${documentId ? `/${encodeURIComponent(documentId)}` : ''}`;

export const createOrganizationDocumentApi = (organizationId: string): DocumentApi => ({
  list: (tripId) => request<TripDocument[]>(documentPath(organizationId, tripId)),
  upload: (tripId, file) => request<TripDocument>(documentPath(organizationId, tripId), {
    method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Document-Filename': encodeURIComponent(file.name) }, body: file,
  }),
  remove: (tripId, id) => request<void>(documentPath(organizationId, tripId, id), { method: 'DELETE' }),
  suggestions: (tripId, id) => request<DocumentSuggestions>(`${documentPath(organizationId, tripId, id)}/suggestions`, { method: 'POST' }),
  download: async (tripId, doc) => {
    const response = await fetch(`/api${documentPath(organizationId, tripId, doc.id)}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Não foi possível baixar o documento.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.download = doc.originalFilename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  // Nunca persiste nada: só prévias privadas para a pessoa escolher à mão.
  previewImages: (tripId, documentId) => request<{ images: ExtractedDocumentImage[] }>(`${documentPath(organizationId, tripId, documentId)}/images`, { method: 'POST' }),
  // Reextrai no servidor e grava só a foto escolhida como mídia desta
  // empresa (ver organizationTripDocumentRoutes.ts) — índice é o mesmo de
  // previewImages, nunca a imagem em si.
  importImage: (tripId, documentId, index) => request<UploadedMedia>(`${documentPath(organizationId, tripId, documentId)}/images/${index}/import`, { method: 'POST' }),
});
