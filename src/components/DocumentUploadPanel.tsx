import { useState } from "react";
import { uploadDocument, type UploadedDocument } from "@/api/horizonApi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChat } from "@/context/ChatContext";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function DocumentUploadPanel() {
  const { sendMessage } = useChat();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const uploaded = await uploadDocument(selectedFile);
      setUploadedDocuments((previous) => [uploaded, ...previous]);

      await sendMessage(
        `I uploaded a document named "${uploaded.name}". Please analyze it and provide a concise summary with key findings.`,
        {
          action: "analyze_uploaded_document",
          documentId: uploaded.id,
          documentName: uploaded.name,
        },
      );

      setSelectedFile(null);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Document Upload</CardTitle>
        <CardDescription>Upload files to the Horizon document pipeline.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              setSelectedFile(file);
              setError(null);
            }}
            disabled={isUploading}
          />
          {selectedFile && (
            <p className="text-xs text-muted-foreground">
              Selected: {selectedFile.name} ({formatBytes(selectedFile.size)})
            </p>
          )}
        </div>

        <Button
          type="button"
          className="w-full"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? "Uploading..." : "Upload document"}
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent uploads</h3>
          {uploadedDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {uploadedDocuments.map((document) => (
                <div key={document.id} className="rounded-md border p-3">
                  <p className="text-sm font-medium truncate">{document.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(document.size)} · {new Date(document.uploadedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">Status: {document.status}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}