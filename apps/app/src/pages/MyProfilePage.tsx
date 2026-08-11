import type { ApiAuthMe } from "@deejaytools/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { useApiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import PartnersSection from "@/components/PartnersSection";
import { useAuthMe } from "@/hooks/useAuthMe";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
});
type ProfileForm = z.infer<typeof profileSchema>;

export default function MyProfilePage() {
  const api = useApiClient();
  const { me, loading, reload } = useAuthMe();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: "", lastName: "" },
  });

  useEffect(() => {
    if (!me) return;
    form.reset({
      firstName: me.first_name ?? "",
      lastName: me.last_name ?? "",
    });
  }, [me, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSubmitting(true);
    try {
      await api.patch<ApiAuthMe>("/v1/auth/me", {
        firstName: values.firstName,
        lastName: values.lastName,
      });
      await reload();
      toast.success("Profile updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="space-y-6">
      <h1 className="page-title text-2xl">My Profile</h1>

      <div className="rounded-lg border bg-card">
        <div className="px-4 py-3 border-b">
          <h2 className="font-semibold">Profile</h2>
        </div>
        <div className="p-4 space-y-4">
          {loading && !me ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="space-y-1">
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{me?.email ?? "—"}</p>
              </div>

              <Form {...form}>
                <form onSubmit={onSubmit} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Save changes"}
                  </Button>
                </form>
              </Form>
            </>
          )}
        </div>
      </div>

      <PartnersSection />
    </div>
  );
}
