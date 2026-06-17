export function basePath(): string {
  return new URL('.', document.baseURI).pathname.replace(/\/+$/, '');
}
