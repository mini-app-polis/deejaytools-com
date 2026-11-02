import { useState } from "react";
import { type ApiEventPerson } from "@/schemas";
import SongUploadForm from "@/components/SongUploadForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import PersonPicker from "@/components/staff/PersonPicker";

/**
 * The manager Upload For section: find any user, then upload a song as
 * them. It renders its own TabsContent so it stays mounted while another
 * manager section is shown, keeping the chosen user.
 */
export default function ManagerUploadForSection() {
  const [ufSelected, setUfSelected] = useState<ApiEventPerson | null>(null);

  return (
    <TabsContent value="upload-for" className="mt-4 space-y-4">
      {!ufSelected ? (
        <Card>
          <CardHeader><CardTitle>Upload For</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Find the user you're uploading for. The song is created exactly as if they uploaded it themselves.
            </p>
            <div className="max-w-lg">
              <PersonPicker
                id="upload-for-user"
                allUsers
                label="User to upload for"
                value={null}
                onChange={setUfSelected}
                autoFocus
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>
                Upload For: {ufSelected.display_name}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setUfSelected(null)}>
                Change user
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <SongUploadForm
              variant="self"
              onBehalf={{
                userId: ufSelected.user_id,
                label: ufSelected.email_masked
                  ? `${ufSelected.display_name} (${ufSelected.email_masked})`
                  : ufSelected.display_name,
              }}
            />
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
