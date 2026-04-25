import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { supabase } from "./supabase";

type PresignResponse = {
  uploadUrl: string;
  objectKey: string;
};

export const uploadMealPhoto = async (uri: string): Promise<string> => {
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  const { data, error } = await supabase.functions.invoke("get-upload-url", {
    body: {
      content_type: "image/jpeg",
      file_ext: "jpg",
    },
  });

  if (error) {
    let message = "Could not create a signed upload URL.";
    const context = "context" in error ? error.context : null;
    if (context instanceof Response) {
      try {
        const details = await context.json();
        if (typeof details?.error === "string") message = details.error;
      } catch {
        message = `${message} Status ${context.status}.`;
      }
    }

    throw new Error(message);
  }

  const presigned = data as PresignResponse;
  if (!presigned.uploadUrl || !presigned.objectKey) {
    throw new Error("Upload URL response was missing uploadUrl or objectKey.");
  }

  const uploadResult = await FileSystem.uploadAsync(presigned.uploadUrl, compressed.uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": "image/jpeg",
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error("Photo upload failed.");
  }

  return presigned.objectKey;
};
