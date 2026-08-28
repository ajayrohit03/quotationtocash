// Shared between the server list page and the client "Load more" table —
// kept in its own file (not exported from document-list-page.tsx) so the
// client component doesn't pull in that server component's prisma import.
export const DOCUMENT_PAGE_SIZE = 25;
