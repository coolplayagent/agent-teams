export function markBootstrapReady(doc: Document = document) {
  doc.body.dataset.bootstrapState = "ready";
}
