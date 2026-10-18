// .ktheme 패킹: JSZip STORE (압축 없음), 최상위 = KakaoTalkTheme.css + Images/. JSZip 은 브라우저 전역(CDN).

const ALLOWED = /^(KakaoTalkTheme\.css|Images\/[A-Za-z0-9]+(@[23]x)?\.png)$/;
const FIXED_DATE = new Date(Date.UTC(2026, 0, 1)); // 같은 입력이면 같은 zip

/** files: Map<path, Blob|string|Uint8Array> -> Blob(application/octet-stream) */
export async function packTheme(files, JSZipImpl = globalThis.JSZip) {
  if (!JSZipImpl) throw new Error('JSZip not loaded');
  const zip = new JSZipImpl();
  // 폴더 엔트리를 먼저 고정 날짜로 만든다. 안 그러면 JSZip 이 Images/ 를 현재 시각으로 자동 생성해 바이트가 달라짐
  if ([...files.keys()].some(p => p.startsWith('Images/'))) zip.file('Images/', null, { dir: true, compression: 'STORE', date: FIXED_DATE });
  for (const [path, data] of files) {
    if (!ALLOWED.test(path)) throw new Error(`not allowed in .ktheme: ${path}`);
    zip.file(path, data, { compression: 'STORE', date: FIXED_DATE });
  }
  if (!files.has('KakaoTalkTheme.css')) throw new Error('KakaoTalkTheme.css missing');
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/octet-stream' });
}
