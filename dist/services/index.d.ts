import { TripCreateInput, TripUpdateInput, TripQueryInput, VisitCreateInput, VisitUpdateInput, VisitQueryInput, GalleryCreateInput, GalleryUpdateInput, GalleryQueryInput } from '../validators/index.js';
export declare const tripService: {
    findAll(query: TripQueryInput): Promise<{
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findById(id: string): Promise<any>;
    create(data: TripCreateInput): Promise<any>;
    update(id: string, data: TripUpdateInput): Promise<any>;
    delete(id: string): Promise<{
        success: boolean;
    }>;
    publish(id: string): Promise<any>;
    unpublish(id: string): Promise<any>;
};
export declare const visitService: {
    findAll(query: VisitQueryInput): Promise<{
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findById(id: string): Promise<any>;
    create(data: VisitCreateInput): Promise<any>;
    update(id: string, data: VisitUpdateInput): Promise<any>;
    delete(id: string): Promise<{
        success: boolean;
    }>;
    associateWithTrip(visitId: string, tripId: string | null): Promise<any>;
};
export declare const galleryService: {
    findAll(query: GalleryQueryInput): Promise<{
        data: any[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findById(id: string): Promise<any>;
    create(data: GalleryCreateInput): Promise<any>;
    update(id: string, data: GalleryUpdateInput): Promise<any>;
    delete(id: string): Promise<{
        success: boolean;
    }>;
    reorder(entries: {
        id: string;
        orderIndex: number;
    }[]): Promise<{
        success: boolean;
    }>;
};
export declare const dashboardService: {
    getStats(): Promise<{
        tripsTotal: number;
        tripsPublished: number;
        tripsDraft: number;
        visitsTotal: number;
        visitsNeedsReview: number;
        visitsWithCoords: number;
        galleryTotal: number;
        galleryFeatured: number;
    }>;
};
//# sourceMappingURL=index.d.ts.map