import { useNavigate } from "react-router-dom";
import { ChevronLeft, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RevisionNotesPolisher } from "@/components/RevisionNotesPolisher";

export default function AgentRevisionNotes() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50/60">
      {/* Header */}
      <div className="bg-white border-b border-border/60 px-4 py-4 md:px-8 md:py-5">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="h-7 px-2 text-muted-foreground hover:text-foreground -ml-1.5 mb-3 text-[12.5px]"
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
            Kembali
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl border border-border flex items-center justify-center shrink-0 bg-white">
              <FileEdit className="h-4.5 w-4.5 text-foreground" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-[18px] md:text-[20px] font-bold text-foreground leading-tight tracking-tight">
                Catatan Revisi
              </h1>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Ubah catatan kasar jadi dokumentasi revisi yang rapi & profesional — otomatis pakai AI.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-5">
        <RevisionNotesPolisher />
      </div>
    </div>
  );
}
