/**
 * Magic-number sniffing (spec.md §12: "MIME-type sniffing, not just extension
 * trust").
 *
 * The upload bytes never pass through our server — the browser PUTs them
 * straight to Microsoft — so the check happens at submit time against the
 * stored file's first bytes. A caller who declares `application/pdf` and
 * uploads an executable is rejected before the record is ever created.
 */

const MP4_BRANDS = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ']
const QUICKTIME_BRANDS = ['qt  ']

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

/** True when `bytes` looks like an ISO base-media file (MP4 / MOV family). */
function isoBoxType(bytes: Uint8Array): string | null {
  // Bytes 0-3 are the box size, 4-7 the box type.
  if (bytes.length < 12) return null
  return ascii(bytes, 4, 4)
}

export type SniffedKind = 'pdf' | 'doc' | 'docx' | 'mp4' | 'mov' | 'unknown'

export function sniff(bytes: Uint8Array): SniffedKind {
  // %PDF
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'

  // OLE2 compound document — legacy .doc
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'doc'

  // ZIP container — .docx (and every other OOXML file)
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'docx'

  const box = isoBoxType(bytes)
  if (box === 'ftyp') {
    const brand = ascii(bytes, 8, 4)
    if (QUICKTIME_BRANDS.includes(brand)) return 'mov'
    if (MP4_BRANDS.includes(brand)) return 'mp4'
    // An unlisted brand is still a valid ISO-BMFF file; treat as MP4 rather
    // than rejecting a legitimate recording from an unusual encoder.
    return 'mp4'
  }
  // Some QuickTime writers lead with `moov`/`mdat`/`wide`/`free` instead.
  if (box && ['moov', 'mdat', 'wide', 'free', 'skip'].includes(box)) return 'mov'

  return 'unknown'
}

/** Which sniffed kinds each declared content type is allowed to resolve to. */
const ACCEPTED: Record<string, SniffedKind[]> = {
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  // MP4 and QuickTime share a container family and are routinely mislabelled by
  // browsers and phones, so either byte signature satisfies either declaration.
  'video/mp4': ['mp4', 'mov'],
  'video/quicktime': ['mov', 'mp4'],
}

export function matchesDeclaredType(bytes: Uint8Array, contentType: string): boolean {
  const accepted = ACCEPTED[contentType]
  if (!accepted) return false
  return accepted.includes(sniff(bytes))
}
