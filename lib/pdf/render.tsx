import { renderToBuffer } from "@react-pdf/renderer";
import type { PreviewDocument } from "@/components/documents/preview-types";
import { DocumentPdf } from "./document-pdf";

export async function renderDocumentPdf(
  document: PreviewDocument,
  gstEnabled: boolean,
): Promise<Buffer> {
  return renderToBuffer(<DocumentPdf document={document} gstEnabled={gstEnabled} />);
}
