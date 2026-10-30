import { z } from 'zod';
export declare const tripCreateSchema: z.ZodObject<{
    title: z.ZodString;
    headlineDisplay: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    category: z.ZodString;
    description: z.ZodString;
    city: z.ZodString;
    region: z.ZodString;
    startDateISO: z.ZodString;
    endDateISO: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    departureTime: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    departureTolerance: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    returnTime: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    scheduleInfo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    scheduleTBD: z.ZodDefault<z.ZodBoolean>;
    priceValue: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    priceDisplay: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    priceUnit: z.ZodDefault<z.ZodString>;
    free: z.ZodDefault<z.ZodBoolean>;
    intensityClass: z.ZodDefault<z.ZodEnum<["leve", "moderado", "intenso", "extremo"]>>;
    spotsLeft: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    trailDistance: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    supportPoint: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    supportPointInfo: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    meetingCity: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    meetingPoint: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    meetingDetails: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    meetingMapsQuery: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    includes: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    includesHighlight: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    includedServices: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    itinerary: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    routeNotes: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    importantInfo: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    media: z.ZodDefault<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        alt: z.ZodString;
        focus: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodEnum<["image", "video"]>>;
    }, "strip", z.ZodTypeAny, {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }, {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }>, "many">>;
    buttonLabel: z.ZodDefault<z.ZodString>;
    buttonClass: z.ZodDefault<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["DRAFT", "OPEN", "COMPLETED", "CANCELLED", "SOLD_OUT", "CLOSED"]>>;
    availabilitySchema: z.ZodDefault<z.ZodString>;
    storedIdentity: z.ZodOptional<z.ZodString>;
    departures: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        time: z.ZodString;
        place: z.ZodString;
        city: z.ZodString;
        mapsUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        mapsQuery: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        orderIndex: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }, {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    includes: string[];
    title: string;
    category: string;
    description: string;
    city: string;
    region: string;
    startDateISO: string;
    scheduleTBD: boolean;
    priceUnit: string;
    free: boolean;
    intensityClass: "leve" | "moderado" | "intenso" | "extremo";
    status: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED" | "SOLD_OUT" | "CLOSED";
    media: {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }[];
    buttonLabel: string;
    buttonClass: string;
    availabilitySchema: string;
    departures: {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }[];
    headlineDisplay?: string | null | undefined;
    endDateISO?: string | null | undefined;
    departureTime?: string | null | undefined;
    departureTolerance?: string | null | undefined;
    returnTime?: string | null | undefined;
    scheduleInfo?: string | null | undefined;
    priceValue?: number | null | undefined;
    priceDisplay?: string | null | undefined;
    spotsLeft?: number | null | undefined;
    trailDistance?: string | null | undefined;
    supportPoint?: string | null | undefined;
    supportPointInfo?: string | null | undefined;
    meetingCity?: string | null | undefined;
    meetingPoint?: string | null | undefined;
    meetingDetails?: string | null | undefined;
    meetingMapsQuery?: string | null | undefined;
    includesHighlight?: string | null | undefined;
    includedServices?: string[] | null | undefined;
    itinerary?: string[] | null | undefined;
    routeNotes?: string[] | null | undefined;
    importantInfo?: string[] | null | undefined;
    storedIdentity?: string | undefined;
}, {
    title: string;
    category: string;
    description: string;
    city: string;
    region: string;
    startDateISO: string;
    includes?: string[] | undefined;
    headlineDisplay?: string | null | undefined;
    endDateISO?: string | null | undefined;
    departureTime?: string | null | undefined;
    departureTolerance?: string | null | undefined;
    returnTime?: string | null | undefined;
    scheduleInfo?: string | null | undefined;
    scheduleTBD?: boolean | undefined;
    priceValue?: number | null | undefined;
    priceDisplay?: string | null | undefined;
    priceUnit?: string | undefined;
    free?: boolean | undefined;
    intensityClass?: "leve" | "moderado" | "intenso" | "extremo" | undefined;
    spotsLeft?: number | null | undefined;
    trailDistance?: string | null | undefined;
    supportPoint?: string | null | undefined;
    supportPointInfo?: string | null | undefined;
    meetingCity?: string | null | undefined;
    meetingPoint?: string | null | undefined;
    meetingDetails?: string | null | undefined;
    meetingMapsQuery?: string | null | undefined;
    status?: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED" | "SOLD_OUT" | "CLOSED" | undefined;
    includesHighlight?: string | null | undefined;
    includedServices?: string[] | null | undefined;
    itinerary?: string[] | null | undefined;
    routeNotes?: string[] | null | undefined;
    importantInfo?: string[] | null | undefined;
    media?: {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }[] | undefined;
    buttonLabel?: string | undefined;
    buttonClass?: string | undefined;
    availabilitySchema?: string | undefined;
    storedIdentity?: string | undefined;
    departures?: {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }[] | undefined;
}>;
export declare const tripUpdateSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    headlineDisplay: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    category: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    region: z.ZodOptional<z.ZodString>;
    startDateISO: z.ZodOptional<z.ZodString>;
    endDateISO: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    departureTime: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    departureTolerance: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    returnTime: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    scheduleInfo: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    scheduleTBD: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    priceValue: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
    priceDisplay: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    priceUnit: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    free: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    intensityClass: z.ZodOptional<z.ZodDefault<z.ZodEnum<["leve", "moderado", "intenso", "extremo"]>>>;
    spotsLeft: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
    trailDistance: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    supportPoint: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    supportPointInfo: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    meetingCity: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    meetingPoint: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    meetingDetails: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    meetingMapsQuery: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    includes: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    includesHighlight: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    includedServices: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>>;
    itinerary: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>>;
    routeNotes: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>>;
    importantInfo: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>>;
    media: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        alt: z.ZodString;
        focus: z.ZodOptional<z.ZodString>;
        type: z.ZodOptional<z.ZodEnum<["image", "video"]>>;
    }, "strip", z.ZodTypeAny, {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }, {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }>, "many">>>;
    buttonLabel: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    buttonClass: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["DRAFT", "OPEN", "COMPLETED", "CANCELLED", "SOLD_OUT", "CLOSED"]>>>;
    availabilitySchema: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    storedIdentity: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    departures: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        time: z.ZodString;
        place: z.ZodString;
        city: z.ZodString;
        mapsUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        mapsQuery: z.ZodNullable<z.ZodOptional<z.ZodString>>;
        orderIndex: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }, {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }>, "many">>>>;
}, "strip", z.ZodTypeAny, {
    includes?: string[] | undefined;
    title?: string | undefined;
    headlineDisplay?: string | null | undefined;
    category?: string | undefined;
    description?: string | undefined;
    city?: string | undefined;
    region?: string | undefined;
    startDateISO?: string | undefined;
    endDateISO?: string | null | undefined;
    departureTime?: string | null | undefined;
    departureTolerance?: string | null | undefined;
    returnTime?: string | null | undefined;
    scheduleInfo?: string | null | undefined;
    scheduleTBD?: boolean | undefined;
    priceValue?: number | null | undefined;
    priceDisplay?: string | null | undefined;
    priceUnit?: string | undefined;
    free?: boolean | undefined;
    intensityClass?: "leve" | "moderado" | "intenso" | "extremo" | undefined;
    spotsLeft?: number | null | undefined;
    trailDistance?: string | null | undefined;
    supportPoint?: string | null | undefined;
    supportPointInfo?: string | null | undefined;
    meetingCity?: string | null | undefined;
    meetingPoint?: string | null | undefined;
    meetingDetails?: string | null | undefined;
    meetingMapsQuery?: string | null | undefined;
    status?: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED" | "SOLD_OUT" | "CLOSED" | undefined;
    includesHighlight?: string | null | undefined;
    includedServices?: string[] | null | undefined;
    itinerary?: string[] | null | undefined;
    routeNotes?: string[] | null | undefined;
    importantInfo?: string[] | null | undefined;
    media?: {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }[] | undefined;
    buttonLabel?: string | undefined;
    buttonClass?: string | undefined;
    availabilitySchema?: string | undefined;
    storedIdentity?: string | undefined;
    departures?: {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }[] | undefined;
}, {
    includes?: string[] | undefined;
    title?: string | undefined;
    headlineDisplay?: string | null | undefined;
    category?: string | undefined;
    description?: string | undefined;
    city?: string | undefined;
    region?: string | undefined;
    startDateISO?: string | undefined;
    endDateISO?: string | null | undefined;
    departureTime?: string | null | undefined;
    departureTolerance?: string | null | undefined;
    returnTime?: string | null | undefined;
    scheduleInfo?: string | null | undefined;
    scheduleTBD?: boolean | undefined;
    priceValue?: number | null | undefined;
    priceDisplay?: string | null | undefined;
    priceUnit?: string | undefined;
    free?: boolean | undefined;
    intensityClass?: "leve" | "moderado" | "intenso" | "extremo" | undefined;
    spotsLeft?: number | null | undefined;
    trailDistance?: string | null | undefined;
    supportPoint?: string | null | undefined;
    supportPointInfo?: string | null | undefined;
    meetingCity?: string | null | undefined;
    meetingPoint?: string | null | undefined;
    meetingDetails?: string | null | undefined;
    meetingMapsQuery?: string | null | undefined;
    status?: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED" | "SOLD_OUT" | "CLOSED" | undefined;
    includesHighlight?: string | null | undefined;
    includedServices?: string[] | null | undefined;
    itinerary?: string[] | null | undefined;
    routeNotes?: string[] | null | undefined;
    importantInfo?: string[] | null | undefined;
    media?: {
        src: string;
        alt: string;
        type?: "image" | "video" | undefined;
        focus?: string | undefined;
    }[] | undefined;
    buttonLabel?: string | undefined;
    buttonClass?: string | undefined;
    availabilitySchema?: string | undefined;
    storedIdentity?: string | undefined;
    departures?: {
        city: string;
        time: string;
        place: string;
        orderIndex: number;
        mapsUrl?: string | null | undefined;
        mapsQuery?: string | null | undefined;
    }[] | undefined;
}>;
export declare const tripQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "OPEN", "COMPLETED", "CANCELLED", "SOLD_OUT", "CLOSED"]>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
    status?: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED" | "SOLD_OUT" | "CLOSED" | undefined;
}, {
    search?: string | undefined;
    status?: "DRAFT" | "OPEN" | "COMPLETED" | "CANCELLED" | "SOLD_OUT" | "CLOSED" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const visitCreateSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    date: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    city: z.ZodString;
    region: z.ZodString;
    lat: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    lng: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
    images: z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        alt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        src: string;
        alt: string;
    }, {
        src: string;
        alt: string;
    }>, "many">>>;
    tripId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    needsReview: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    source: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    storedIdentity: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    city: string;
    region: string;
    needsReview: boolean;
    description?: string | null | undefined;
    date?: string | null | undefined;
    storedIdentity?: string | undefined;
    lat?: number | null | undefined;
    lng?: number | null | undefined;
    images?: {
        src: string;
        alt: string;
    }[] | null | undefined;
    tripId?: string | null | undefined;
    notes?: string | null | undefined;
    source?: string | null | undefined;
}, {
    title: string;
    city: string;
    region: string;
    description?: string | null | undefined;
    date?: string | null | undefined;
    storedIdentity?: string | undefined;
    lat?: number | null | undefined;
    lng?: number | null | undefined;
    images?: {
        src: string;
        alt: string;
    }[] | null | undefined;
    tripId?: string | null | undefined;
    needsReview?: boolean | undefined;
    notes?: string | null | undefined;
    source?: string | null | undefined;
}>;
export declare const visitUpdateSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    date: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    city: z.ZodOptional<z.ZodString>;
    region: z.ZodOptional<z.ZodString>;
    lat: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
    lng: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodNumber>>>;
    images: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        alt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        src: string;
        alt: string;
    }, {
        src: string;
        alt: string;
    }>, "many">>>>;
    tripId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    needsReview: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    source: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    storedIdentity: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    description?: string | null | undefined;
    city?: string | undefined;
    region?: string | undefined;
    date?: string | null | undefined;
    storedIdentity?: string | undefined;
    lat?: number | null | undefined;
    lng?: number | null | undefined;
    images?: {
        src: string;
        alt: string;
    }[] | null | undefined;
    tripId?: string | null | undefined;
    needsReview?: boolean | undefined;
    notes?: string | null | undefined;
    source?: string | null | undefined;
}, {
    title?: string | undefined;
    description?: string | null | undefined;
    city?: string | undefined;
    region?: string | undefined;
    date?: string | null | undefined;
    storedIdentity?: string | undefined;
    lat?: number | null | undefined;
    lng?: number | null | undefined;
    images?: {
        src: string;
        alt: string;
    }[] | null | undefined;
    tripId?: string | null | undefined;
    needsReview?: boolean | undefined;
    notes?: string | null | undefined;
    source?: string | null | undefined;
}>;
export declare const visitQuerySchema: z.ZodObject<{
    needsReview: z.ZodOptional<z.ZodBoolean>;
    tripId: z.ZodOptional<z.ZodString>;
    city: z.ZodOptional<z.ZodString>;
    region: z.ZodOptional<z.ZodString>;
    hasCoords: z.ZodOptional<z.ZodBoolean>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
    city?: string | undefined;
    region?: string | undefined;
    tripId?: string | undefined;
    needsReview?: boolean | undefined;
    hasCoords?: boolean | undefined;
}, {
    search?: string | undefined;
    city?: string | undefined;
    region?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    tripId?: string | undefined;
    needsReview?: boolean | undefined;
    hasCoords?: boolean | undefined;
}>;
export declare const galleryCreateSchema: z.ZodObject<{
    title: z.ZodString;
    date: z.ZodString;
    dateDisplay: z.ZodString;
    description: z.ZodString;
    images: z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        alt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        src: string;
        alt: string;
    }, {
        src: string;
        alt: string;
    }>, "many">;
    tripId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    visitId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    isFeatured: z.ZodDefault<z.ZodBoolean>;
    orderIndex: z.ZodDefault<z.ZodNumber>;
    storedIdentity: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string;
    date: string;
    orderIndex: number;
    images: {
        src: string;
        alt: string;
    }[];
    dateDisplay: string;
    isFeatured: boolean;
    storedIdentity?: string | undefined;
    tripId?: string | null | undefined;
    visitId?: string | null | undefined;
}, {
    title: string;
    description: string;
    date: string;
    images: {
        src: string;
        alt: string;
    }[];
    dateDisplay: string;
    storedIdentity?: string | undefined;
    orderIndex?: number | undefined;
    tripId?: string | null | undefined;
    visitId?: string | null | undefined;
    isFeatured?: boolean | undefined;
}>;
export declare const galleryUpdateSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
    dateDisplay: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    images: z.ZodOptional<z.ZodArray<z.ZodObject<{
        src: z.ZodString;
        alt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        src: string;
        alt: string;
    }, {
        src: string;
        alt: string;
    }>, "many">>;
    tripId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    visitId: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    isFeatured: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    orderIndex: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    storedIdentity: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    description?: string | undefined;
    date?: string | undefined;
    storedIdentity?: string | undefined;
    orderIndex?: number | undefined;
    images?: {
        src: string;
        alt: string;
    }[] | undefined;
    tripId?: string | null | undefined;
    dateDisplay?: string | undefined;
    visitId?: string | null | undefined;
    isFeatured?: boolean | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
    date?: string | undefined;
    storedIdentity?: string | undefined;
    orderIndex?: number | undefined;
    images?: {
        src: string;
        alt: string;
    }[] | undefined;
    tripId?: string | null | undefined;
    dateDisplay?: string | undefined;
    visitId?: string | null | undefined;
    isFeatured?: boolean | undefined;
}>;
export declare const galleryQuerySchema: z.ZodObject<{
    isFeatured: z.ZodOptional<z.ZodBoolean>;
    tripId: z.ZodOptional<z.ZodString>;
    visitId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
    tripId?: string | undefined;
    visitId?: string | undefined;
    isFeatured?: boolean | undefined;
}, {
    search?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    tripId?: string | undefined;
    visitId?: string | undefined;
    isFeatured?: boolean | undefined;
}>;
export declare const dashboardStatsSchema: z.ZodObject<{
    tripsTotal: z.ZodNumber;
    tripsPublished: z.ZodNumber;
    tripsDraft: z.ZodNumber;
    visitsTotal: z.ZodNumber;
    visitsNeedsReview: z.ZodNumber;
    visitsWithCoords: z.ZodNumber;
    galleryTotal: z.ZodNumber;
    galleryFeatured: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    tripsTotal: number;
    tripsPublished: number;
    tripsDraft: number;
    visitsTotal: number;
    visitsNeedsReview: number;
    visitsWithCoords: number;
    galleryTotal: number;
    galleryFeatured: number;
}, {
    tripsTotal: number;
    tripsPublished: number;
    tripsDraft: number;
    visitsTotal: number;
    visitsNeedsReview: number;
    visitsWithCoords: number;
    galleryTotal: number;
    galleryFeatured: number;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const changePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export type TripCreateInput = z.infer<typeof tripCreateSchema>;
export type TripUpdateInput = z.infer<typeof tripUpdateSchema>;
export type TripQueryInput = z.infer<typeof tripQuerySchema>;
export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitUpdateInput = z.infer<typeof visitUpdateSchema>;
export type VisitQueryInput = z.infer<typeof visitQuerySchema>;
export type GalleryCreateInput = z.infer<typeof galleryCreateSchema>;
export type GalleryUpdateInput = z.infer<typeof galleryUpdateSchema>;
export type GalleryQueryInput = z.infer<typeof galleryQuerySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
//# sourceMappingURL=index.d.ts.map