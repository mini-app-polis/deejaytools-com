import { useState } from "react";
import SongUploadForm from "@/components/SongUploadForm";
import PersonPicker from "@/components/staff/PersonPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiEvent, ApiEventPerson } from "@/schemas";

/**
 * Upload a song for a dancer at the event. The upload form the admins use,
 * sending this event's id with the upload, which the API authorizes the
 * delegation on.
 */
export default function UploadForSection({ event }: { event: ApiEvent }) {
  const [dancer, setDancer] = useState<ApiEventPerson | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>{dancer ? `Upload for: ${dancer.display_name}` : "Upload for a dancer"}</CardTitle>
          {dancer && (
            <Button variant="outline" size="sm" onClick={() => setDancer(null)}>
              Change dancer
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!dancer ? (
          <div className="max-w-lg">
            <PersonPicker
              id="upload-for-user"
              eventId={event.id}
              label="Dancer"
              value={null}
              onChange={setDancer}
              hint="For a dancer with no link to the event yet, ask an admin to upload."
            />
          </div>
        ) : (
          <SongUploadForm
            variant="self"
            onBehalf={{ userId: dancer.user_id, label: dancer.display_name, eventId: event.id }}
          />
        )}
      </CardContent>
    </Card>
  );
}
