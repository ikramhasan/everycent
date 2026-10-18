import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@everycent/ui/components/alert-dialog";
import { Button } from "@everycent/ui/components/button";
import { Spinner } from "@everycent/ui/components/spinner";
import { FileText, ImagePlus, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { aiReadsAttachment } from "@/lib/ai";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_BYTES } from "./transaction-attachment";

/**
 * A new transaction's attachment, picked before the transaction exists: kept in the browser and
 * uploaded once the transaction is saved. With AI on for the budget, picking a receipt asks
 * whether to fill the transaction in from it (`onFill`).
 */
export function NewTransactionAttachment({
  file,
  onFile,
  aiEnabled,
  filling,
  onFill,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  aiEnabled: boolean;
  /** The AI is reading the file. */
  filling: boolean;
  onFill: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [asking, setAsking] = useState(false);
  const canFill = aiEnabled && file !== null && aiReadsAttachment(file);

  function pick(picked: File) {
    if (picked.size > MAX_ATTACHMENT_BYTES) {
      toast.error("That file is too big: attachments can be at most 15 MB.");
      return;
    }
    onFile(picked);
    if (aiEnabled && aiReadsAttachment(picked)) setAsking(true);
  }

  return (
    <div className="mr-auto flex min-w-0 items-center gap-1.5">
      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) pick(picked);
        }}
      />
      {file ? (
        <>
          <span className="flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
            {filling ? (
              <Spinner className="size-3.5" />
            ) : (
              <FileText className="size-3.5 shrink-0" />
            )}
            <span className="truncate" title={file.name}>
              {filling ? `Reading ${file.name}…` : file.name}
            </span>
            <button
              type="button"
              className="-mr-1 rounded-sm p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label={`Remove ${file.name}`}
              disabled={filling}
              onClick={() => onFile(null)}
            >
              <X className="size-3.5" />
            </button>
          </span>
          {canFill && !filling && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onFill(file)}>
              <Sparkles /> Fill in with AI
            </Button>
          )}
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => input.current?.click()}
        >
          <ImagePlus /> {aiEnabled ? "Add receipt" : "Add attachment"}
        </Button>
      )}
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Fill in this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              everycent AI can read {file?.name ?? "the file"} and fill in the date, payee,
              category, memo and amount, using your own payees and categories. Check them before
              saving: the transaction is added uncleared, for you to clear when it shows up in your
              account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Just attach it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (file) onFill(file);
              }}
            >
              <Sparkles /> Fill in with AI
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
