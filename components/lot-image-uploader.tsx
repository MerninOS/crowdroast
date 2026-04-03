"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/mernin/Button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

interface LotImageUploaderProps {
  sellerId?: string;
  headerImageUrl: string;
  supportingImages: string[];
  onChange: (next: { headerImageUrl: string; supportingImages: string[] }) => void;
  disabled?: boolean;
}

const MAX_SUPPORTING_IMAGES = 6;

function buildStoragePath(sellerId: string, fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${sellerId}/${Date.now()}-${rand}.${safeExt}`;
}

async function uploadImageFile(file: File) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to upload images");
  }

  const path = buildStoragePath(user.id, file.name);
  const { error } = await supabase.storage.from("lot-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("lot-images").getPublicUrl(path);
  return data.publicUrl;
}

export function LotImageUploader({
  sellerId,
  headerImageUrl,
  supportingImages,
  onChange,
  disabled = false,
}: LotImageUploaderProps) {
  const [isUploadingHeader, setIsUploadingHeader] = useState(false);
  const [isUploadingSupporting, setIsUploadingSupporting] = useState(false);

  const canUpload = useMemo(() => Boolean(sellerId) && !disabled, [sellerId, disabled]);

  const onHeaderSelect = async (file: File | null) => {
    if (!file) return;
    if (!sellerId) {
      toast.error("You must be signed in to upload images");
      return;
    }
    setIsUploadingHeader(true);
    try {
      const url = await uploadImageFile(file);
      onChange({ headerImageUrl: url, supportingImages });
      toast.success("Header image uploaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setIsUploadingHeader(false);
    }
  };

  const onSupportingSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!sellerId) {
      toast.error("You must be signed in to upload images");
      return;
    }

    const remainingSlots = MAX_SUPPORTING_IMAGES - supportingImages.length;
    if (remainingSlots <= 0) {
      toast.error(`You can add up to ${MAX_SUPPORTING_IMAGES} supporting images`);
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    setIsUploadingSupporting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of selected) {
        const url = await uploadImageFile(file);
        uploadedUrls.push(url);
      }
      onChange({
        headerImageUrl,
        supportingImages: [...supportingImages, ...uploadedUrls],
      });
      toast.success(`${uploadedUrls.length} image${uploadedUrls.length > 1 ? "s" : ""} uploaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload images");
    } finally {
      setIsUploadingSupporting(false);
    }
  };

  const removeHeader = () => onChange({ headerImageUrl: "", supportingImages });

  const removeSupporting = (index: number) => {
    onChange({
      headerImageUrl,
      supportingImages: supportingImages.filter((_, idx) => idx !== index),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>Header Image</Label>
        <div className="rounded-lg border bg-muted/20 p-3">
          {headerImageUrl ? (
            <div className="relative overflow-hidden rounded-md border">
              <img src={headerImageUrl} alt="Header preview" className="h-48 w-full object-cover" />
              {!disabled && (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-2 top-2 h-8 w-8"
                  onClick={removeHeader}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md border border-dashed bg-background text-sm text-muted-foreground">
              No header image yet
            </div>
          )}
          {!disabled && (
            <div className="mt-3">
              <Label
                htmlFor="lot-header-upload"
                className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium ${!canUpload ? "opacity-60" : ""}`}
              >
                <Upload className="h-4 w-4" />
                {isUploadingHeader ? "Uploading..." : "Upload Header"}
              </Label>
              <input
                id="lot-header-upload"
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!canUpload || isUploadingHeader}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  void onHeaderSelect(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Supporting Images</Label>
        <div className="rounded-lg border bg-muted/20 p-3">
          {supportingImages.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {supportingImages.map((url, idx) => (
                <div key={url} className="relative overflow-hidden rounded-md border">
                  <img src={url} alt={`Supporting preview ${idx + 1}`} className="h-32 w-full object-cover" />
                  {!disabled && (
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 h-7 w-7"
                      onClick={() => removeSupporting(idx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center rounded-md border border-dashed bg-background text-sm text-muted-foreground">
              No supporting images yet
            </div>
          )}
          {!disabled && (
            <div className="mt-3 flex items-center justify-between">
              <Label
                htmlFor="lot-supporting-upload"
                className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium ${!canUpload ? "opacity-60" : ""}`}
              >
                <Upload className="h-4 w-4" />
                {isUploadingSupporting ? "Uploading..." : "Add Supporting Images"}
              </Label>
              <p className="text-xs text-muted-foreground">
                {supportingImages.length}/{MAX_SUPPORTING_IMAGES}
              </p>
              <input
                id="lot-supporting-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={!canUpload || isUploadingSupporting}
                onChange={(e) => {
                  void onSupportingSelect(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
