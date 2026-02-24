"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

type Photo = {
  id: string;
  uploaded_by: string;
  storage_path: string;
  public_url: string;
  caption: string;
  photo_date: string;
  created_at: string;
};

type User = {
  id: string;
  email: string;
  displayName: string;
};

export default function PhotosPage() {
  const router = useRouter();

  // Auth state
  const [email, setEmail] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [users, setUsers] = useState<User[]>([]);

  // Data state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lightbox state
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadDate, setUploadDate] = useState(new Date().toISOString().split("T")[0]);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1) Auth gate
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setEmail(data.user.email ?? "");
      setCurrentUserId(data.user.id);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, display_name");

      if (!profilesError && profilesData) {
        const userList: User[] = profilesData.map((profile) => ({
          id: profile.id,
          email: profile.email ?? "",
          displayName: profile.display_name ?? profile.email ?? "Unknown",
        }));
        setUsers(userList);
      }

      await loadPhotos();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // 2) Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("photos-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "photos" },
        () => {
          loadPhotos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) ESC key to close modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxPhoto) setLightboxPhoto(null);
        else if (showUploadModal) closeUploadModal();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxPhoto, showUploadModal]);

  async function loadPhotos() {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setPhotos([]);
    } else {
      setPhotos((data as Photo[]) ?? []);
    }
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    if (file) {
      setUploadPreviewUrl(URL.createObjectURL(file));
    } else {
      setUploadPreviewUrl(null);
    }
  }

  function closeUploadModal() {
    setShowUploadModal(false);
    setUploadFile(null);
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadPreviewUrl(null);
    setUploadCaption("");
    setUploadDate(new Date().toISOString().split("T")[0]);
    setFileInputKey((k) => k + 1);
  }

  async function handleUpload() {
    if (!uploadFile) {
      setError("Please select a photo.");
      return;
    }
    setUploading(true);
    setError(null);

    const fileExt = uploadFile.name.split(".").pop();
    const storagePath = `${currentUserId}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, uploadFile, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from("photos")
      .getPublicUrl(storagePath);

    const { error: insertError } = await supabase.from("photos").insert({
      uploaded_by: currentUserId,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      caption: uploadCaption.trim(),
      photo_date: uploadDate,
    });

    if (insertError) {
      setError(insertError.message);
      setUploading(false);
      return;
    }

    closeUploadModal();
    setUploading(false);
    await loadPhotos();
  }

  async function handleDelete(photo: Photo) {
    if (!confirm("Delete this photo? This cannot be undone.")) return;

    const { error: storageError } = await supabase.storage
      .from("photos")
      .remove([photo.storage_path]);

    if (storageError) {
      setError(storageError.message);
      return;
    }

    const { error: dbError } = await supabase
      .from("photos")
      .delete()
      .eq("id", photo.id);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null);
    await loadPhotos();
  }

  function getUploaderName(userId: string): string {
    const user = users.find((u) => u.id === userId);
    return user?.displayName ?? user?.email ?? "Unknown";
  }

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginBottom: 0,
        paddingBottom: 16,
        borderBottom: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1 }}>
          <a
            href="/expenses"
            style={{ display: "flex", alignItems: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <img
              src="/pidou.png"
              alt="953 Columbus Logo"
              style={{ width: 50, height: 50, objectFit: "contain" }}
            />
          </a>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              color: "var(--accent-orange)",
              letterSpacing: "-0.5px"
            }}>
              953 Columbus
            </h1>
            <p style={{
              marginTop: 4,
              color: "var(--text-secondary)",
              fontSize: 14,
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}>
              {email}
            </p>
          </div>
        </div>

        <button
          className="cursor-pointer"
          onClick={logout}
          style={{
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 500,
            whiteSpace: "nowrap",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 6
          }}
        >
          Sign out
        </button>
      </div>

      {/* Nav tabs */}
      <nav style={{
        display: "flex",
        gap: 4,
        marginBottom: 32,
        borderBottom: "2px solid var(--border)"
      }}>
        <a
          href="/expenses"
          style={{
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--text-secondary)",
            borderBottom: "2px solid transparent",
            marginBottom: -2,
            textDecoration: "none"
          }}
        >
          Expenses
        </a>
        <a
          href="/photos"
          style={{
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--accent-orange)",
            borderBottom: "2px solid var(--accent-orange)",
            marginBottom: -2,
            textDecoration: "none"
          }}
        >
          Photos
        </a>
      </nav>

      {/* Action row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>Album</h2>
        <button
          className="cursor-pointer"
          onClick={() => setShowUploadModal(true)}
          style={{
            padding: "9px 18px",
            fontSize: 14,
            fontWeight: 600,
            background: "var(--accent-orange)",
            color: "white",
            border: "none",
            borderRadius: 6
          }}
        >
          + Add Photo
        </button>
      </div>

      {/* Error */}
      {error && (
        <p style={{ color: "crimson", marginBottom: 16, fontSize: 14 }}>{error}</p>
      )}

      {/* Photo grid */}
      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
      ) : photos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-secondary)" }}>
          <p style={{ fontSize: 16 }}>No photos yet.</p>
          <p style={{ fontSize: 14, marginTop: 8 }}>Add the first one!</p>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8
        }}>
          {photos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => setLightboxPhoto(photo)}
              className="cursor-pointer"
              style={{
                aspectRatio: "1",
                overflow: "hidden",
                borderRadius: 6,
                background: "var(--bg-secondary)"
              }}
            >
              <img
                src={photo.public_url}
                alt={photo.caption || "Photo"}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100
          }}
          onClick={closeUploadModal}
        >
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: 8,
              padding: 28,
              maxWidth: 480,
              width: "calc(100% - 32px)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 20px 0", fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>
              Add a Photo
            </h3>

            <input
              key={fileInputKey}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "block", marginBottom: 12, fontSize: 14, color: "var(--text-primary)" }}
            />

            {uploadPreviewUrl && (
              <img
                src={uploadPreviewUrl}
                alt="Preview"
                style={{
                  width: "100%",
                  maxHeight: 220,
                  objectFit: "contain",
                  borderRadius: 6,
                  marginBottom: 16,
                  background: "var(--bg-secondary)"
                }}
              />
            )}

            <input
              type="text"
              placeholder="Caption (optional)"
              value={uploadCaption}
              onChange={(e) => setUploadCaption(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                padding: "9px 12px",
                fontSize: 14,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                marginBottom: 12,
                boxSizing: "border-box"
              }}
            />

            <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
              Date
            </label>
            <input
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
              style={{
                display: "block",
                width: "100%",
                padding: "9px 12px",
                fontSize: 14,
                border: "1px solid var(--border)",
                borderRadius: 6,
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                marginBottom: 20,
                boxSizing: "border-box"
              }}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="cursor-pointer"
                onClick={handleUpload}
                disabled={uploading || !uploadFile}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  background: uploading || !uploadFile ? "var(--border)" : "var(--accent-orange)",
                  color: "white",
                  border: "none",
                  borderRadius: 6
                }}
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
              <button
                className="cursor-pointer"
                onClick={closeUploadModal}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 500,
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16
          }}
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            style={{ maxWidth: "min(90vw, 800px)", width: "100%", textAlign: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxPhoto.public_url}
              alt={lightboxPhoto.caption || "Photo"}
              style={{
                maxHeight: "70vh",
                maxWidth: "100%",
                objectFit: "contain",
                borderRadius: 8,
                display: "block",
                margin: "0 auto"
              }}
            />

            <div style={{ marginTop: 16 }}>
              {lightboxPhoto.caption && (
                <p style={{ color: "white", fontSize: 17, margin: "0 0 6px 0", fontWeight: 500 }}>
                  {lightboxPhoto.caption}
                </p>
              )}
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>
                {formatDate(lightboxPhoto.photo_date)} &bull; Uploaded by {getUploaderName(lightboxPhoto.uploaded_by)}
              </p>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
              <button
                className="cursor-pointer"
                onClick={() => handleDelete(lightboxPhoto)}
                style={{
                  padding: "8px 24px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#ff6b6b",
                  background: "transparent",
                  border: "1px solid #ff6b6b",
                  borderRadius: 6
                }}
              >
                Delete
              </button>
              <button
                className="cursor-pointer"
                onClick={() => setLightboxPhoto(null)}
                style={{
                  padding: "8px 24px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "white",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.35)",
                  borderRadius: 6
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
