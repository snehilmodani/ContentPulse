'use client';

import { useRef, useState } from 'react';
import { Check, Copy, Loader2, RefreshCw, Upload } from 'lucide-react';
import type { VisualResponse } from '@contentpulse/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useGenerateExternalPrompt,
  useRegenerateVisual,
  useUploadVisual,
} from '@/lib/hooks/use-packages';

const METHOD_LABEL: Record<string, string> = {
  ai_dalle:    'DALL·E / Gemini',
  web_unsplash:'Unsplash',
  web_pexels:  'Pexels',
  template:    'Template',
  user_upload: 'Your upload',
};

const METHOD_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  ai_dalle:    'default',
  web_unsplash:'secondary',
  web_pexels:  'secondary',
  template:    'outline',
  user_upload: 'outline',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

interface Props {
  visual: VisualResponse | null;
  onClose: () => void;
}

export function VisualDetailDialog({ visual, onClose }: Props) {
  const [regenInstruction, setRegenInstruction] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generatePrompt = useGenerateExternalPrompt();
  const regenerateVisual = useRegenerateVisual();
  const uploadVisual = useUploadVisual();

  const handleGeneratePrompt = async () => {
    if (!visual) return;
    setGeneratedPrompt(null);
    const result = await generatePrompt.mutateAsync(visual.id);
    setGeneratedPrompt(result.prompt);
  };

  const handleRegenerate = async () => {
    if (!visual) return;
    const instruction = regenInstruction.trim();
    await regenerateVisual.mutateAsync({
      visualId: visual.id,
      body: instruction ? { instruction } : {},
    });
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !visual) return;
    await uploadVisual.mutateAsync({ visualId: visual.id, file });
    onClose();
  };

  const isUserUpload = visual?.generation_method === 'user_upload';
  const isRegenerating = visual?.status === 'regenerating' || regenerateVisual.isPending;

  // Reset generated prompt when a new visual is opened
  const prevVisualId = useRef<string | null>(null);
  if (visual?.id !== prevVisualId.current) {
    prevVisualId.current = visual?.id ?? null;
    if (generatedPrompt !== null) setGeneratedPrompt(null);
    if (regenInstruction !== '') setRegenInstruction('');
  }

  return (
    <Dialog open={!!visual} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle className="text-base capitalize">
              {visual?.visual_type.replace(/_/g, ' ')} visual
            </DialogTitle>
            {visual && (
              <Badge variant={METHOD_VARIANT[visual.generation_method] ?? 'outline'}>
                {METHOD_LABEL[visual.generation_method] ?? visual.generation_method}
              </Badge>
            )}
            {visual && (
              <span className="text-xs text-muted-foreground ml-auto">
                v{visual.version} · {visual.width_px}×{visual.height_px}px
              </span>
            )}
          </div>
          {visual?.source_url && visual.generation_method.startsWith('web_') && (
            <a
              href={visual.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-500 hover:underline truncate block mt-0.5"
            >
              View original source ↗
            </a>
          )}
        </DialogHeader>

        {visual && (
          <div className="space-y-5 pt-1">
            {/* Stored prompt / search query */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {visual.generation_method === 'web_unsplash' || visual.generation_method === 'web_pexels'
                  ? 'Search query used'
                  : 'Prompt used'}
              </Label>
              {visual.prompt_used ? (
                <div className="flex gap-2 items-start">
                  <pre className="flex-1 text-xs bg-muted/60 border border-border rounded p-2.5 whitespace-pre-wrap leading-relaxed overflow-auto max-h-36">
                    {visual.prompt_used}
                  </pre>
                  <CopyButton text={visual.prompt_used} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No prompt recorded.</p>
              )}
            </div>

            {/* Generate detailed external prompt */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                External image generator prompt
              </Label>
              <p className="text-xs text-muted-foreground">
                A richer prompt you can paste into Gemini Nano Banana, Midjourney, Sora, etc.
              </p>
              {generatedPrompt ? (
                <div className="flex gap-2 items-start">
                  <pre className="flex-1 text-xs bg-muted/60 border border-border rounded p-2.5 whitespace-pre-wrap leading-relaxed overflow-auto max-h-40">
                    {generatedPrompt}
                  </pre>
                  <CopyButton text={generatedPrompt} />
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGeneratePrompt}
                  disabled={generatePrompt.isPending}
                  className="gap-1.5"
                >
                  {generatePrompt.isPending
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                    : 'Generate detailed prompt'}
                </Button>
              )}
              {generatedPrompt && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGeneratePrompt}
                  disabled={generatePrompt.isPending}
                  className="gap-1.5 text-xs"
                >
                  {generatePrompt.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3" />}
                  Regenerate prompt
                </Button>
              )}
            </div>

            {/* Regenerate this image */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Regenerate this image
              </Label>
              {isUserUpload ? (
                <p className="text-xs text-muted-foreground italic">
                  Upload a replacement or use the external prompt above to recreate externally.
                </p>
              ) : (
                <>
                  <Textarea
                    placeholder={visual.prompt_used ?? 'Describe what you want…'}
                    value={regenInstruction}
                    onChange={(e) => setRegenInstruction(e.target.value)}
                    className="text-sm resize-none"
                    rows={3}
                    disabled={isRegenerating}
                  />
                  <Button
                    size="sm"
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="gap-1.5"
                  >
                    {isRegenerating
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</>
                      : <><RefreshCw className="h-3.5 w-3.5" /> Regenerate</>}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Leave blank to regenerate with the original prompt. Only this image is regenerated.
                  </p>
                </>
              )}
            </div>

            {/* Upload replacement */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Replace with your own image
              </Label>
              <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP · max 10 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadVisual.isPending}
                className="gap-1.5"
              >
                {uploadVisual.isPending
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="h-3.5 w-3.5" /> Choose file</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
