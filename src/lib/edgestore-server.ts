import { initEdgeStore } from '@edgestore/server';

const es = initEdgeStore.create();

/**
 * This is the main router for the Edge Store buckets.
 */
export const edgeStoreRouter = es.router({
    publicFiles: es.fileBucket({
        maxSize: 1024 * 1024 * 10, // 10MB
        accept: ['image/*', 'application/pdf', 'text/*'], // Accept images, PDFs, and text files for invoices
    }),
});

/**
 * This type is used to create the type-safe client for the frontend.
 */
export type EdgeStoreRouter = typeof edgeStoreRouter;
