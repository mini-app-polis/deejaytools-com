import { useState } from "react";
import SongUploadForm from "@/components/SongUploadForm";
import UserIdField from "@/components/staff/UserIdField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiEvent } from "@/schemas";

/**
 * Upload a song for a dancer at the event. The upload form the admins use,
 * sending this event's id with the upload, which the API authorizes the
 * delegation on.
 */
export default function UploadForSection({ event }: { event: ApiEvent }) {
  const [draft, setDraft] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>{userId ? `Upload for: ${userId}` : "Upload for a dancer"}</CardTitle>
          {userId && (
            <Button variant="outline" size="sm" onClick={() => { setUserId(null); setDraft(""); }}>
              Change dancer
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!userId ? (
          <form
            className="space-y-3 max-w-lg"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) setUserId(draft.trim());
            }}
          >
            <UserIdField id="upload-for-user" value={draft} onChange={setDraft} />
            <Button type="submit" disabled={!draft.trim()}>
              Continue
            </Button>
          </form>
        ) : (
          <SongUploadForm variant="self" onBehalf={{ userId, label: userId, eventId: event.id }} />
        )}
      </CardContent>
    </Card>
  );
}
