/**
 * Filename and folder-name normalisation (spec.md §7.1).
 *
 * The candidate's original filename is never used for storage — it is shown
 * back to them in the upload preview only. Everything that reaches SharePoint
 * goes through here first.
 */

const FOLDER_NAME_MAX = 100

/** Extensions we are willing to write, keyed by the MIME types we accept. */
const RESUME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

const VIDEO_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

/**
 * Strips anything outside `[A-Za-z0-9 ,.'-]`, collapses runs of whitespace and
 * caps length. Used for the candidate portion of the folder name.
 */
export function sanitizeName(raw: string): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9 ,.'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FOLDER_NAME_MAX)
    .trim()

  // SharePoint rejects names that end in a dot, and an empty name is useless.
  return cleaned.replace(/\.+$/, '').trim() || 'Candidate'
}

/** `{CandidateID} - {SanitizedFullName}` (spec.md §7.1). */
export function candidateFolderName(candidateId: string, fullName: string): string {
  return `${candidateId} - ${sanitizeName(fullName)}`
}

/**
 * Resolves the *storage* filename. Always `Resume.{ext}` / `Introduction.{ext}`
 * with the extension derived from the server-validated MIME type, never from
 * the uploaded filename.
 */
export function storageFileName(kind: 'resume' | 'video', contentType: string): string {
  const table = kind === 'resume' ? RESUME_EXTENSIONS : VIDEO_EXTENSIONS
  const extension = table[contentType]
  if (!extension) {
    throw new Error(`No storage extension mapped for content type: ${contentType}`)
  }
  return kind === 'resume' ? `Resume.${extension}` : `Introduction.${extension}`
}

/** Encodes a library-relative path for use in a Graph `:/path:` addressing segment. */
export function encodeGraphPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}
