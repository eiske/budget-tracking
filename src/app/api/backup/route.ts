import { snapshotBuffer } from "@/lib/backup";
import { backupFileName } from "@/lib/backup-name";
import { isSameOrigin } from "@/lib/domain/host";

/**
 * Downloads a backup of the whole database. POST only (a link or <img> on another site cannot
 * trigger it), and a browser request must come from this same origin. The proxy has already
 * refused any Host that is not localhost.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const bytes = await snapshotBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
